import { logAction, listAudit } from "@/lib/audit";
import {
  accessibleCompanyIds,
  canAccessCompany,
} from "@/lib/auth/rbac";
import {
  getCompany,
  getTenant,
  listAssetsForCompany,
  listCompanies,
  listManagedApprovalRequests,
  listManagedChannelAdaptations,
  listManagedContentConcepts,
  listManagedPaidAuthorizations,
  listManagedPlannedSlots,
  listManagedStrategyCycles,
  listPublishLogs,
  listScheduledPosts,
  updateCompany,
  updateManagedStrategyCycle,
} from "@/lib/db";
import {
  listManagedJobs,
  type ManagedContentJobRecord,
} from "@/lib/managed-content-jobs/repository";
import {
  ManagedContentContractError,
  submitManagedContentJobForStaff,
} from "@/lib/managed-content-jobs/service";
import { draftManagedContentBrief } from "@/lib/managed-content-jobs/brief-draft";
import {
  consumedConceptUnits,
  strategyInputsConfirmed,
} from "@/lib/managed-service/workflow";
import { resolveCompanyPackage } from "@/lib/marketing-packages";
import type {
  Asset,
  Company,
  ManagedApprovalRequest,
  ManagedChannelAdaptation,
  ManagedContentConcept,
  ManagedPaidAuthorization,
  ManagedPlannedSlot,
  ManagedStrategyCycle,
  PublishLog,
  ScheduledPost,
} from "@/lib/types";
import type { ContentDeskActor } from "./auth";
import type {
  ClientWorkspace,
  OperationsMetricKey,
  OperationsOverview,
  RiskLevel,
} from "./types";

const DAY_MS = 86_400_000;
const ACTIVE_SLOT_STATUSES = new Set([
  "planned",
  "awaiting_approval",
  "approved",
  "scheduled",
]);
const JOB_PROCESSING = new Set(["submitting", "accepted", "processing"]);
const JOB_FAILED = new Set(["submit_failed", "failed", "poll_exhausted"]);
const REGENERATABLE_TERMINAL_JOBS = new Set([
  "ready",
  "paused",
  "failed",
  "submit_failed",
  "poll_exhausted",
]);
const RISK_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export class ContentDeskOperatorError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface TenantSnapshot {
  companies: Company[];
  cycles: ManagedStrategyCycle[];
  concepts: ManagedContentConcept[];
  adaptations: ManagedChannelAdaptation[];
  slots: ManagedPlannedSlot[];
  approvals: ManagedApprovalRequest[];
  paid: ManagedPaidAuthorization[];
  jobs: ManagedContentJobRecord[];
  scheduled: ScheduledPost[];
  publishLogs: PublishLog[];
}

function latestCycle(
  cycles: ManagedStrategyCycle[],
  companyId: string,
): ManagedStrategyCycle | undefined {
  return cycles.find(
    (cycle) => cycle.companyId === companyId && cycle.status !== "superseded",
  );
}

function modeFor(company: Company): "automated" | "staff_directed" {
  return company.profile.managedService?.serviceLevel === "approval"
    ? "staff_directed"
    : "automated";
}

function coverageDays(
  slots: ManagedPlannedSlot[],
  companyId: string,
  nowMs: number,
): number {
  const latest = slots
    .filter(
      (slot) =>
        slot.companyId === companyId &&
        ACTIVE_SLOT_STATUSES.has(slot.status) &&
        Date.parse(slot.plannedPublishAt) >= nowMs,
    )
    .reduce(
      (maximum, slot) => Math.max(maximum, Date.parse(slot.plannedPublishAt)),
      0,
    );
  return latest
    ? Math.min(30, Math.max(0, Math.ceil((latest - nowMs) / DAY_MS)))
    : 0;
}

function snapshotForCompany(snapshot: TenantSnapshot, companyId: string) {
  const concepts = snapshot.concepts.filter(
    (item) => item.companyId === companyId,
  );
  const conceptIds = new Set(concepts.map((item) => item.id));
  return {
    cycles: snapshot.cycles.filter((item) => item.companyId === companyId),
    concepts,
    adaptations: snapshot.adaptations.filter((item) =>
      conceptIds.has(item.conceptId),
    ),
    slots: snapshot.slots.filter((item) => item.companyId === companyId),
    approvals: snapshot.approvals.filter(
      (item) => item.companyId === companyId,
    ),
    paid: snapshot.paid.filter((item) => item.companyId === companyId),
    jobs: snapshot.jobs.filter((item) => item.companyId === companyId),
    scheduled: snapshot.scheduled.filter(
      (item) => item.companyId === companyId,
    ),
    publishLogs: snapshot.publishLogs.filter(
      (item) => item.companyId === companyId,
    ),
  };
}

async function tenantSnapshot(tenantId: string): Promise<TenantSnapshot> {
  const [
    companies,
    cycles,
    concepts,
    adaptations,
    slots,
    approvals,
    paid,
    jobs,
    scheduled,
    publishLogs,
  ] = await Promise.all([
    listCompanies(tenantId),
    listManagedStrategyCycles(tenantId),
    listManagedContentConcepts(tenantId),
    listManagedChannelAdaptations(tenantId),
    listManagedPlannedSlots(tenantId),
    listManagedApprovalRequests(tenantId),
    listManagedPaidAuthorizations(tenantId),
    listManagedJobs(tenantId),
    listScheduledPosts(tenantId),
    listPublishLogs(tenantId),
  ]);
  return {
    companies: companies.filter(
      (company) =>
        company.status !== "archived" &&
        !company.profile.contentLibraryShelf,
    ),
    cycles,
    concepts,
    adaptations,
    slots,
    approvals,
    paid,
    jobs,
    scheduled,
    publishLogs,
  };
}

function restrictSnapshotToCompanies(
  snapshot: TenantSnapshot,
  companyIds: Set<string>,
): TenantSnapshot {
  const visibleCompanyIds = new Set(
    snapshot.companies
      .filter((company) => companyIds.has(company.id))
      .map((company) => company.id),
  );
  const permitted = <T extends { companyId: string }>(rows: T[]) =>
    rows.filter((row) => visibleCompanyIds.has(row.companyId));
  return {
    companies: snapshot.companies.filter((company) =>
      visibleCompanyIds.has(company.id),
    ),
    cycles: permitted(snapshot.cycles),
    concepts: permitted(snapshot.concepts),
    adaptations: permitted(snapshot.adaptations),
    slots: permitted(snapshot.slots),
    approvals: permitted(snapshot.approvals),
    paid: permitted(snapshot.paid),
    jobs: permitted(snapshot.jobs),
    scheduled: permitted(snapshot.scheduled),
    publishLogs: permitted(snapshot.publishLogs),
  };
}

function paidAuthorizationAtRisk(
  authorization: ManagedPaidAuthorization,
  approvals: ManagedApprovalRequest[],
  company: Company,
): boolean {
  const creative = approvals.find(
    (approval) => approval.id === authorization.creativeApprovalId,
  );
  const budget = approvals.find(
    (approval) => approval.id === authorization.budgetTargetingApprovalId,
  );
  const billing = company.profile.managedService?.serviceBilling;
  return (
    authorization.status !== "approved" ||
    authorization.requestedBudgetAud > authorization.clientMonthlyCapAud ||
    creative?.status !== "approved" ||
    budget?.status !== "approved" ||
    !authorization.disclosureAcceptedAt ||
    Boolean(
      billing && !["active", "cancel_at_period_end"].includes(billing.status),
    )
  );
}

function latestPublishByPost(logs: PublishLog[]): Map<string, PublishLog> {
  const result = new Map<string, PublishLog>();
  for (const log of logs) {
    if (log.scheduledPostId && !result.has(log.scheduledPostId)) {
      result.set(log.scheduledPostId, log);
    }
  }
  return result;
}

function publicationStatus(
  post: ScheduledPost | undefined,
): ClientWorkspace["publications"][number]["status"] {
  if (post?.status === "failed" || post?.status === "dead") {
    return "failed";
  }
  if (
    post?.status === "scheduled" ||
    post?.status === "publishing" ||
    post?.status === "delivery_unknown" ||
    post?.status === "published"
  ) {
    return post.status;
  }
  return "planned";
}

export async function getOperationsOverview(
  actor: ContentDeskActor,
  now = new Date(),
): Promise<OperationsOverview> {
  const allowedCompanyIds = new Set(await accessibleCompanyIds(actor));
  const snapshot = restrictSnapshotToCompanies(
    await tenantSnapshot(actor.tenantId),
    allowedCompanyIds,
  );
  const nowIso = now.toISOString();
  const nowMs = now.getTime();
  const contentDueLimit = nowMs + 14 * DAY_MS;
  const queue: OperationsOverview["queue"] = [];
  const counts = new Map<OperationsMetricKey, number>();
  const add = (
    company: Company,
    kind: OperationsMetricKey,
    risk: RiskLevel,
    summary: string,
    nextAction: string,
    dueAt?: string | null,
    id: string = kind,
  ) => {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    queue.push({
      id: `${company.id}:${id}`,
      companyId: company.id,
      clientName: company.name,
      kind,
      risk,
      summary,
      dueAt,
      nextAction,
    });
  };

  const clientRows = snapshot.companies.map((company) => {
    const rows = snapshotForCompany(snapshot, company.id);
    const cycle = latestCycle(rows.cycles, company.id);
    const profileConfirmed = Boolean(cycle && strategyInputsConfirmed(cycle));
    const coverage = coverageDays(rows.slots, company.id, nowMs);
    const queueStart = queue.length;
    const service = company.profile.managedService;
    if (!profileConfirmed) {
      add(
        company,
        "profile_confirmation",
        "high",
        "Strategy inputs have not been confirmed.",
        "Confirm profile",
      );
    }
    const strategyDue = Boolean(
      service?.strategyDueAt &&
      Date.parse(service.strategyDueAt) <= nowMs &&
      !service.strategyCompletedAt &&
      (!cycle || cycle.status === "draft"),
    );
    if (strategyDue) {
      add(
        company,
        "strategy_due",
        "high",
        "Quarterly strategy is due.",
        "Prepare strategy",
        service?.strategyDueAt,
      );
    }
    if (coverage < 30) {
      add(
        company,
        "calendar_coverage",
        coverage === 0 ? "high" : "medium",
        `Explicit calendar coverage reaches ${coverage} of 30 days.`,
        "Complete calendar",
      );
    }
    for (const slot of rows.slots) {
      const dueMs = Date.parse(slot.finalContentDueAt);
      if (
        ACTIVE_SLOT_STATUSES.has(slot.status) &&
        dueMs >= nowMs &&
        dueMs <= contentDueLimit
      ) {
        add(
          company,
          "content_due",
          dueMs - nowMs <= 3 * DAY_MS ? "high" : "medium",
          "Final content is due inside 14 days.",
          "Review content",
          slot.finalContentDueAt,
          `content_due:${slot.id}`,
        );
      }
    }
    for (const job of rows.jobs) {
      if (JOB_PROCESSING.has(job.status)) {
        add(
          company,
          "jobs_processing",
          "low",
          "A managed content request is in progress.",
          "View request",
          null,
          `job:${job.id}`,
        );
      } else if (JOB_FAILED.has(job.status)) {
        add(
          company,
          "jobs_failed",
          "high",
          job.lastError ?? "A managed content request needs intervention.",
          "Resolve request",
          null,
          `job:${job.id}`,
        );
      } else if (job.status === "paused") {
        add(
          company,
          "payment_pauses",
          "critical",
          job.lastError ?? "Managed content delivery is paused.",
          "Resolve payment or service pause",
          null,
          `job:${job.id}`,
        );
      }
    }
    for (const approval of rows.approvals) {
      if (approval.status === "pending" && approval.dueAt < nowIso) {
        add(
          company,
          "approvals_overdue",
          "high",
          "Client approval is overdue.",
          "Follow up approval",
          approval.dueAt,
          `approval:${approval.id}`,
        );
      }
    }
    for (const post of rows.scheduled) {
      if (post.status === "failed" || post.status === "dead") {
        add(
          company,
          "publishing_failures",
          post.status === "dead" ? "critical" : "high",
          `Publication to ${post.platform} failed.`,
          "Resolve publication",
          null,
          `publish:${post.id}`,
        );
      }
    }
    const billing = service?.serviceBilling;
    if (billing?.status === "paused") {
      add(
        company,
        "payment_pauses",
        "critical",
        "Managed delivery is paused for payment resolution.",
        "Resolve payment",
        billing.graceEndsAt ?? null,
      );
    }
    for (const authorization of rows.paid) {
      if (paidAuthorizationAtRisk(authorization, rows.approvals, company)) {
        add(
          company,
          "paid_budget_risks",
          "high",
          "Paid activity is missing a required authorization or exceeds a guardrail.",
          "Review paid authorization",
          null,
          `paid:${authorization.id}`,
        );
      }
    }
    return {
      id: company.id,
      name: company.name,
      industry: company.profile.industry ?? null,
      serviceMode: modeFor(company),
      profileConfirmed,
      strategyStatus: cycle?.status ?? ("missing" as const),
      calendarCoverageDays: coverage,
      openRiskCount: queue
        .slice(queueStart)
        .filter((item) => item.risk !== "low").length,
    };
  });

  const metricDefinitions: Array<
    [OperationsMetricKey, string, string, RiskLevel]
  > = [
    [
      "profile_confirmation",
      "Profile confirmation",
      "clients need confirmed inputs",
      "high",
    ],
    [
      "strategy_due",
      "Strategies due",
      "quarterly strategies are overdue",
      "high",
    ],
    [
      "calendar_coverage",
      "30-day coverage",
      "clients lack full explicit coverage",
      "medium",
    ],
    [
      "content_due",
      "Content due",
      "slots have final content due inside 14 days",
      "medium",
    ],
    [
      "jobs_processing",
      "Requests processing",
      "managed requests are in progress",
      "low",
    ],
    [
      "jobs_failed",
      "Request failures",
      "managed requests need intervention",
      "high",
    ],
    [
      "approvals_overdue",
      "Approvals overdue",
      "approval SLAs have elapsed",
      "high",
    ],
    [
      "publishing_failures",
      "Publishing failures",
      "publications need intervention",
      "critical",
    ],
    [
      "payment_pauses",
      "Payment pauses",
      "clients have paused delivery",
      "critical",
    ],
    [
      "paid_budget_risks",
      "Paid-budget risk",
      "paid authorizations are blocked",
      "high",
    ],
  ];
  return {
    generatedAt: nowIso,
    totalClients: snapshot.companies.length,
    metrics: metricDefinitions.map(([key, label, detail, risk]) => ({
      key,
      label,
      count: counts.get(key) ?? 0,
      denominator: snapshot.companies.length,
      detail,
      risk,
    })),
    queue: queue.sort(
      (left, right) =>
        RISK_ORDER[left.risk] - RISK_ORDER[right.risk] ||
        (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999") ||
        left.clientName.localeCompare(right.clientName),
    ),
    clients: clientRows,
  };
}

async function scopedCompany(
  actor: ContentDeskActor,
  companyId: string,
): Promise<Company> {
  const company = await getCompany(companyId);
  if (
    !company ||
    company.status === "archived" ||
    company.tenantId !== actor.tenantId ||
    !(await canAccessCompany(actor, companyId))
  ) {
    throw new ContentDeskOperatorError("not found", 404);
  }
  return company;
}

function visualState(
  concept: ManagedContentConcept,
  asset: Asset | undefined,
  atIso: string,
): "ready" | "missing" | "rights_required" | "expired" {
  if (!asset) return "missing";
  if (
    asset.usageRights.expiryDate &&
    asset.usageRights.expiryDate <= atIso.slice(0, 10)
  ) {
    return "expired";
  }
  if (
    asset.status !== "approved" ||
    (asset.source === "upload" &&
      (!asset.rightsConfirmedAt || !asset.rightsConfirmationEmail)) ||
    (asset.source === "ai_generated" && !asset.privateProvenance)
  ) {
    return "rights_required";
  }
  return concept.reusableAssetId ? "ready" : "missing";
}

export async function getClientWorkspace(
  actor: ContentDeskActor,
  companyId: string,
  now = new Date(),
): Promise<ClientWorkspace> {
  const company = await scopedCompany(actor, companyId);
  const tenant = await getTenant(actor.tenantId);
  const [
    cycles,
    concepts,
    adaptations,
    slots,
    approvals,
    jobs,
    scheduled,
    logs,
    assets,
    audit,
  ] = await Promise.all([
    listManagedStrategyCycles(actor.tenantId, company.id),
    listManagedContentConcepts(actor.tenantId, company.id),
    listManagedChannelAdaptations(actor.tenantId),
    listManagedPlannedSlots(actor.tenantId, company.id),
    listManagedApprovalRequests(actor.tenantId, company.id),
    listManagedJobs(actor.tenantId, company.id),
    listScheduledPosts(actor.tenantId),
    listPublishLogs(actor.tenantId),
    listAssetsForCompany(company.id),
    listAudit(actor.tenantId, [company.id]),
  ]);
  const conceptIds = new Set(concepts.map((concept) => concept.id));
  const companyAdaptations = adaptations.filter((item) =>
    conceptIds.has(item.conceptId),
  );
  const adaptationById = new Map(
    companyAdaptations.map((adaptation) => [adaptation.id, adaptation]),
  );
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  const cycle = latestCycle(cycles, company.id);
  const resolvedPackage = resolveCompanyPackage(company, tenant);
  const currentPeriod = now.toISOString().slice(0, 7);
  const used = consumedConceptUnits(
    concepts.filter((concept) => concept.packagePeriod === currentPeriod),
  );
  const companyScheduled = scheduled.filter(
    (post) => post.companyId === company.id,
  );
  const scheduledById = new Map(
    companyScheduled.map((post) => [post.id, post]),
  );
  const horizonEnd = now.getTime() + 30 * DAY_MS;
  const horizonSlots = slots.filter((slot) => {
    const plannedAt = Date.parse(slot.plannedPublishAt);
    return (
      ACTIVE_SLOT_STATUSES.has(slot.status) &&
      plannedAt >= now.getTime() &&
      plannedAt <= horizonEnd
    );
  });
  const latestLog = latestPublishByPost(
    logs.filter((log) => log.companyId === company.id),
  );
  const billing = company.profile.managedService?.serviceBilling;
  const profileInputs = cycle?.confirmedInputs;

  return {
    companyId: company.id,
    profile: {
      name: company.name,
      industry: company.profile.industry ?? null,
      timezone: tenant?.timezone ?? "UTC",
      contactEmail:
        company.profile.approvalContact ?? company.profile.email ?? null,
      profileConfirmedAt: profileInputs?.profileConfirmedAt ?? null,
      goals: profileInputs?.goals ?? [],
      locations: profileInputs?.locations ?? company.profile.serviceAreas,
      seasonalInputs: profileInputs?.seasonalInputs ?? [],
    },
    strategy: cycle
      ? {
          id: cycle.id,
          quarterStart: cycle.quarterStart,
          status: cycle.status,
          mode: modeFor(company),
          guardrails: cycle.guardrails,
          approvedAt: cycle.approvedAt ?? null,
          updatedAt: cycle.updatedAt,
        }
      : null,
    plan: {
      packageId: resolvedPackage.id,
      billingStatus: billing?.status ?? "not_configured",
      conceptsAllowed: resolvedPackage.campaignConceptsPerMonth,
      conceptsUsed: used,
      channels: resolvedPackage.channels,
      monthlyAdCapAud:
        company.profile.managedService?.serviceOptions?.monthlyAdCapAud ?? 0,
    },
    schedule: horizonSlots.map((slot) => ({
      id: slot.id,
      conceptId: slot.conceptId,
      adaptationId: slot.adaptationId,
      channel: adaptationById.get(slot.adaptationId)?.channelKey ?? "unknown",
      plannedPublishAt: slot.plannedPublishAt,
      finalContentDueAt: slot.finalContentDueAt,
      status: slot.status,
      explicit: true,
    })),
    concepts: concepts.map((concept) => ({
      id: concept.id,
      title: concept.title,
      theme: concept.theme,
      status: concept.status,
      visualState: visualState(
        concept,
        concept.reusableAssetId
          ? assetById.get(concept.reusableAssetId)
          : undefined,
        now.toISOString(),
      ),
      adaptations: companyAdaptations
        .filter((adaptation) => adaptation.conceptId === concept.id)
        .map((adaptation) => ({
          id: adaptation.id,
          channel: adaptation.channelKey,
          status: adaptation.status,
        })),
    })),
    approvals: approvals.map((approval) => ({
      id: approval.id,
      scope: approval.scope,
      status: approval.status,
      dueAt: approval.dueAt,
      revisionRound: approval.revisionRound,
    })),
    publications: horizonSlots.map((slot) => {
      const scheduledPost = slot.scheduledPostId
        ? scheduledById.get(slot.scheduledPostId)
        : undefined;
      const log = scheduledPost ? latestLog.get(scheduledPost.id) : undefined;
      const status = publicationStatus(scheduledPost);
      return {
        id: scheduledPost?.id ?? `planned:${slot.id}`,
        slotId: slot.id,
        channel:
          scheduledPost?.platform ??
          adaptationById.get(slot.adaptationId)?.channelKey ??
          "unknown",
        status,
        lastError:
          status === "failed" ? (log?.detail ?? "Publication failed") : null,
      };
    }),
    jobs: jobs.map((job) => ({
      id: job.id,
      conceptId: job.conceptId,
      status: job.status,
      pollAttempts: job.pollAttempts,
      updatedAt: job.updatedAt,
      lastError: job.lastError ?? null,
      provenance: job.privateProvenance ?? null,
    })),
    audit: audit
      .filter((event) => event.companyId === company.id)
      .slice(0, 100)
      .map((event) => ({
        id: event.id,
        action: event.action,
        actorEmail: event.actorEmail,
        detail: event.detail ?? null,
        createdAt: event.createdAt,
      })),
  };
}

export async function updateClientStrategy(
  actor: ContentDeskActor,
  companyId: string,
  guardrails: ManagedStrategyCycle["guardrails"],
): Promise<{ strategyId: string }> {
  const company = await scopedCompany(actor, companyId);
  const cycles = await listManagedStrategyCycles(actor.tenantId, company.id);
  const cycle = latestCycle(cycles, company.id);
  if (!cycle) throw new ContentDeskOperatorError("strategy not found", 404);
  const updated = await updateManagedStrategyCycle(cycle.id, { guardrails });
  if (!updated) throw new ContentDeskOperatorError("strategy not found", 404);
  await logAction(actor, "content_desk.strategy_guardrails_updated", {
    targetType: "managed_strategy_cycle",
    targetId: cycle.id,
    companyId: company.id,
    detail: `Admin/Staff ${actor.role} updated approved operating guardrails.`,
  });
  return { strategyId: updated.id };
}

export async function updateClientMode(
  actor: ContentDeskActor,
  companyId: string,
  mode: "automated" | "staff_directed",
): Promise<{ mode: "automated" | "staff_directed" }> {
  const company = await scopedCompany(actor, companyId);
  const managed = company.profile.managedService;
  if (!managed) {
    throw new ContentDeskOperatorError(
      "managed service is not configured",
      409,
    );
  }
  await updateCompany(company.id, {
    profile: {
      ...company.profile,
      managedService: {
        ...managed,
        serviceLevel: mode === "staff_directed" ? "approval" : "fully_managed",
      },
    },
  });
  await logAction(actor, "content_desk.service_mode_updated", {
    targetType: "company",
    targetId: company.id,
    companyId: company.id,
    detail: `Admin/Staff ${actor.role} changed service mode to ${mode}.`,
  });
  return { mode };
}

export async function regenerateClientConcept(
  actor: ContentDeskActor,
  companyId: string,
  conceptId: string,
): Promise<{ jobId: string; idempotentReplay: boolean }> {
  const company = await scopedCompany(actor, companyId);
  const [concepts, slots, jobs] = await Promise.all([
    listManagedContentConcepts(actor.tenantId, company.id),
    listManagedPlannedSlots(actor.tenantId, company.id),
    listManagedJobs(actor.tenantId, company.id),
  ]);
  const concept = concepts.find((item) => item.id === conceptId);
  if (!concept) throw new ContentDeskOperatorError("not found", 404);
  const slot = slots
    .filter(
      (slot) =>
        slot.conceptId === concept.id && ACTIVE_SLOT_STATUSES.has(slot.status),
    )
    .sort((left, right) =>
      left.plannedPublishAt.localeCompare(right.plannedPublishAt),
    )[0];
  if (!slot) {
    throw new ContentDeskOperatorError(
      "regeneration requires an explicit active slot",
      409,
    );
  }
  const requestPrefix = `content-desk-regenerate:${concept.id}:attempt-`;
  const priorAttempts = jobs
    .filter((job) => job.requestId.startsWith(requestPrefix))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const latestAttempt = priorAttempts[0];
  const attemptNumber =
    latestAttempt && REGENERATABLE_TERMINAL_JOBS.has(latestAttempt.status)
      ? priorAttempts.length + 1
      : Math.max(1, priorAttempts.length);
  const requestId = `${requestPrefix}${attemptNumber}`;
  // Staff approve path: brief → submitManagedContentJobForStaff (managed-content jobs).
  const adaptations = await listManagedChannelAdaptations(
    actor.tenantId,
    concept.id,
  );
  const conceptChannels = adaptations.map((item) => item.channelKey);
  const briefDraft = await draftManagedContentBrief({
    companyName: company.name,
    theme: concept.theme,
    channelKeys: conceptChannels,
    conceptTitle: concept.title,
    guardrailNotes: [
      "Regenerate within approved theme and channel guardrails.",
    ],
  });
  let result: Awaited<ReturnType<typeof submitManagedContentJobForStaff>>;
  try {
    result = await submitManagedContentJobForStaff(actor, {
      companyId: company.id,
      requestId,
      conceptId: concept.id,
      plannedSlotId: slot.id,
      assetIds: concept.reusableAssetId ? [concept.reusableAssetId] : [],
      brief: briefDraft.briefText,
    });
  } catch (error) {
    if (error instanceof ManagedContentContractError) {
      throw new ContentDeskOperatorError(error.message, error.status);
    }
    throw error;
  }
  await logAction(actor, "content_desk.concept_regeneration_submitted", {
    targetType: "managed_content_concept",
    targetId: concept.id,
    companyId: company.id,
    detail: result.idempotentReplay
      ? "Admin/Staff replayed the existing regeneration request; explicit slots were retained."
      : "Admin/Staff submitted concept regeneration; explicit slots were retained.",
  });
  return { jobId: result.job.id, idempotentReplay: result.idempotentReplay };
}
