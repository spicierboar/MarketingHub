import {
  listCompanies,
  listManagedApprovalRequests,
  listManagedContentConcepts,
  listManagedDeliveryRuns,
  listManagedPlannedSlots,
  listManagedStrategyCycles,
  listPublishLogsSince,
  listScheduledPosts,
} from "@/lib/db";
import {
  listManagedJobs,
  type ManagedContentJobRecord,
} from "@/lib/managed-content-jobs/repository";
import { dueApprovalReminders } from "@/lib/managed-service/workflow";
import {
  isRetryEligiblePost,
  queueNowPartsForTenant,
} from "@/lib/publish-queue";
import type {
  Company,
  ManagedApprovalRequest,
  ManagedContentConcept,
  ManagedDeliveryRun,
  ManagedPlannedSlot,
  ManagedStrategyCycle,
  PublishLog,
  ScheduledPost,
} from "@/lib/types";

const DAY_MS = 86_400_000;
const CALENDAR_COVERAGE_ITEMS = 4;
const EXCEPTION_LIST_LIMIT = 12;
const ACTIVE_BILLING_STATUSES = new Set([
  "active",
  "past_due_grace",
  "cancel_at_period_end",
]);
const TERMINAL_JOB_STATUSES = new Set([
  "failed",
  "submit_failed",
  "poll_exhausted",
]);
const FINAL_CONCEPT_STATUSES = new Set([
  "approved",
  "scheduled",
  "completed",
]);

export type ControlPlaneStage =
  | "Service"
  | "Profile"
  | "Strategy"
  | "Calendar"
  | "Content"
  | "Approval"
  | "Publishing";

export type ControlPlaneRisk = "critical" | "high" | "medium";

export interface ControlPlaneException {
  id: string;
  companyId: string;
  companyName: string;
  stage: ControlPlaneStage;
  risk: ControlPlaneRisk;
  title: string;
  detail: string;
  href: string;
  owner: "Unassigned";
  sla: string;
  ageDays: number;
  estimatedMinutes: number;
}

export interface ControlPlaneMetric {
  label: string;
  value: string;
  detail: string;
  tone?: "danger" | "warning" | "good";
}

export interface AgencyControlPlaneSnapshot {
  activeClients: number;
  managedClients: number;
  runningAutomatically: number;
  exceptionClients: number;
  automationRate: number | null;
  exceptionRate: number | null;
  metrics: ControlPlaneMetric[];
  exceptions: ControlPlaneException[];
  exceptionTotal: number;
  queueMinutes: number;
  oldestAgeDays: number;
  bottleneckStage: ControlPlaneStage | null;
  unassignedCount: number;
  retryablePublishingCount: number;
  dueReminderCount: number;
  computedAt: string;
}

export interface AgencyControlPlaneInput {
  tenantId: string;
  nowIso: string;
  companies: Company[];
  strategyCycles: ManagedStrategyCycle[];
  concepts: ManagedContentConcept[];
  slots: ManagedPlannedSlot[];
  approvals: ManagedApprovalRequest[];
  deliveryRuns: ManagedDeliveryRun[];
  scheduledPosts: ScheduledPost[];
  publishLogs: PublishLog[];
  managedJobs: ManagedContentJobRecord[];
  queueToday?: string;
  queueHhmm?: string;
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

function metricValue(numerator: number, denominator: number): string {
  const value = percent(numerator, denominator);
  return value === null ? "Not recorded" : `${value}%`;
}

function ageDays(fromIso: string, nowIso: string): number {
  const elapsed = Date.parse(nowIso) - Date.parse(fromIso);
  return Number.isFinite(elapsed) ? Math.max(0, Math.floor(elapsed / DAY_MS)) : 0;
}

function quarterStart(iso: string): string {
  const date = new Date(iso);
  const month = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), month, 1))
    .toISOString()
    .slice(0, 10);
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

function riskRank(risk: ControlPlaneRisk): number {
  switch (risk) {
    case "critical":
      return 3;
    case "high":
      return 2;
    case "medium":
      return 1;
  }
}

function isManagedCompany(company: Company): boolean {
  return company.status !== "archived" && Boolean(company.profile.managedService);
}

function isActiveClient(company: Company): boolean {
  const status = company.profile.managedService?.serviceBilling?.status;
  return isManagedCompany(company) && Boolean(status && ACTIVE_BILLING_STATUSES.has(status));
}

function newestByCompany<T extends { companyId: string; createdAt: string }>(
  records: T[],
): Map<string, T> {
  const result = new Map<string, T>();
  for (const record of records) {
    const current = result.get(record.companyId);
    if (!current || record.createdAt > current.createdAt) {
      result.set(record.companyId, record);
    }
  }
  return result;
}

/** One definition used by profile metrics and exception classification. */
export function latestConfirmedProfileByCompany(
  cycles: ManagedStrategyCycle[],
): Map<string, ManagedStrategyCycle> {
  return newestByCompany(
    cycles.filter((cycle) =>
      Boolean(cycle.confirmedInputs.profileConfirmedAt),
    ),
  );
}

function pushException(
  rows: ControlPlaneException[],
  input: Omit<ControlPlaneException, "owner">,
): void {
  rows.push({ ...input, owner: "Unassigned" });
}

function buildExceptions(args: {
  nowIso: string;
  companies: Company[];
  cycles: ManagedStrategyCycle[];
  slots: ManagedPlannedSlot[];
  approvals: ManagedApprovalRequest[];
  runs: ManagedDeliveryRun[];
  posts: ScheduledPost[];
  jobs: ManagedContentJobRecord[];
}): ControlPlaneException[] {
  const {
    nowIso,
    companies,
    cycles,
    slots,
    approvals,
    runs,
    posts,
    jobs,
  } = args;
  const today = dateOnly(nowIso);
  const horizonEnd = addDays(nowIso, 30);
  const currentQuarter = quarterStart(nowIso);
  const rows: ControlPlaneException[] = [];
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const cyclesByCompany = new Map<string, ManagedStrategyCycle[]>();
  const slotsByCompany = new Map<string, ManagedPlannedSlot[]>();
  const confirmedProfileByCompany = latestConfirmedProfileByCompany(cycles);

  for (const cycle of cycles) {
    const values = cyclesByCompany.get(cycle.companyId) ?? [];
    values.push(cycle);
    cyclesByCompany.set(cycle.companyId, values);
  }
  for (const slot of slots) {
    const values = slotsByCompany.get(slot.companyId) ?? [];
    values.push(slot);
    slotsByCompany.set(slot.companyId, values);
  }

  for (const company of companies) {
    const billing = company.profile.managedService?.serviceBilling;
    if (!billing) {
      pushException(rows, {
        id: `service-status:${company.id}`,
        companyId: company.id,
        companyName: company.name,
        stage: "Service",
        risk: "high",
        title: "Confirm service billing status",
        detail: "No durable service billing status is recorded.",
        href: `/companies/${company.id}`,
        sla: "Before delivery continues",
        ageDays: ageDays(company.updatedAt, nowIso),
        estimatedMinutes: 15,
      });
    } else if (["paused", "pending_payment", "past_due_grace"].includes(billing.status)) {
      const paused = billing.status === "paused";
      pushException(rows, {
        id: `service-pause:${company.id}`,
        companyId: company.id,
        companyName: company.name,
        stage: "Service",
        risk: paused ? "critical" : "high",
        title: paused ? "Service is paused" : "Payment needs attention",
        detail: `Recorded service status: ${billing.status.replaceAll("_", " ")}.`,
        href: `/companies/${company.id}`,
        sla: paused ? "Now" : "Within 1 business day",
        ageDays: ageDays(
          billing.pausedAt ?? billing.failedPaymentAt ?? company.updatedAt,
          nowIso,
        ),
        estimatedMinutes: 20,
      });
    }

    if (!isActiveClient(company)) continue;
    const companyCycles = cyclesByCompany.get(company.id) ?? [];
    const confirmed = confirmedProfileByCompany.has(company.id);
    if (!confirmed) {
      pushException(rows, {
        id: `profile:${company.id}`,
        companyId: company.id,
        companyName: company.name,
        stage: "Profile",
        risk: "high",
        title: "Confirm the operating profile",
        detail: "No confirmed profile is present in a durable strategy cycle.",
        href: `/companies/${company.id}`,
        sla: "Before strategy runs",
        ageDays: ageDays(company.updatedAt, nowIso),
        estimatedMinutes: 25,
      });
    }

    const currentStrategy = companyCycles.find(
      (cycle) =>
        cycle.quarterStart === currentQuarter && cycle.status === "approved",
    );
    if (!currentStrategy) {
      pushException(rows, {
        id: `strategy:${company.id}`,
        companyId: company.id,
        companyName: company.name,
        stage: "Strategy",
        risk: "high",
        title: "Bring strategy up to date",
        detail: "No approved strategy cycle is recorded for the current quarter.",
        href: `/companies/${company.id}/strategy`,
        sla: "Within 1 business day",
        ageDays: ageDays(company.updatedAt, nowIso),
        estimatedMinutes: 30,
      });
    }

    const covered = (slotsByCompany.get(company.id) ?? []).filter(
      (slot) =>
        slot.status !== "cancelled" &&
        dateOnly(slot.plannedPublishAt) >= today &&
        dateOnly(slot.plannedPublishAt) <= horizonEnd,
    ).length;
    if (covered < CALENDAR_COVERAGE_ITEMS) {
      pushException(rows, {
        id: `calendar:${company.id}`,
        companyId: company.id,
        companyName: company.name,
        stage: "Calendar",
        risk: "medium",
        title: "Restore 30-day calendar coverage",
        detail: `${covered} of ${CALENDAR_COVERAGE_ITEMS} minimum planned items are recorded.`,
        href: `/calendar?company=${company.id}`,
        sla: "Within 2 business days",
        ageDays: 0,
        estimatedMinutes: 20,
      });
    }
  }

  for (const request of approvals) {
    if (request.status !== "pending" || request.dueAt >= nowIso) continue;
    const company = companyById.get(request.companyId);
    if (!company) continue;
    pushException(rows, {
      id: `approval:${request.id}`,
      companyId: company.id,
      companyName: company.name,
      stage: "Approval",
      risk: ageDays(request.dueAt, nowIso) >= 3 ? "critical" : "high",
      title: "Approval is overdue",
      detail: `Due ${dateOnly(request.dueAt)}; reminders remain governed by the approval workflow.`,
      href: "/approvals",
      sla: "Within 1 business day",
      ageDays: ageDays(request.dueAt, nowIso),
      estimatedMinutes: 10,
    });
  }

  for (const run of runs) {
    if (!["blocked", "failed"].includes(run.phase)) continue;
    const company = companyById.get(run.companyId);
    if (!company) continue;
    pushException(rows, {
      id: `delivery:${run.id}`,
      companyId: company.id,
      companyName: company.name,
      stage: run.phase === "failed" ? "Content" : "Strategy",
      risk: run.phase === "failed" ? "critical" : "high",
      title: run.phase === "failed" ? "Delivery run failed" : "Delivery run is blocked",
      detail: run.errors.at(-1) ?? run.missingInfo.at(0) ?? run.statusMessageKey,
      href: `/companies/${company.id}`,
      sla: "Within 4 hours",
      ageDays: ageDays(run.updatedAt, nowIso),
      estimatedMinutes: 25,
    });
  }

  for (const job of jobs) {
    if (!TERMINAL_JOB_STATUSES.has(job.status)) continue;
    const company = companyById.get(job.companyId);
    if (!company) continue;
    pushException(rows, {
      id: `managed-job:${job.id}`,
      companyId: company.id,
      companyName: company.name,
      stage: "Content",
      risk: "critical",
      title: "Managed content job failed",
      detail: job.lastError ?? `Job ended with ${job.status.replaceAll("_", " ")}.`,
      href: `/companies/${company.id}`,
      sla: "Within 4 hours",
      ageDays: ageDays(job.updatedAt, nowIso),
      estimatedMinutes: 20,
    });
  }

  for (const post of posts) {
    if (!["failed", "dead"].includes(post.status)) continue;
    const company = companyById.get(post.companyId);
    if (!company) continue;
    pushException(rows, {
      id: `publishing:${post.id}`,
      companyId: company.id,
      companyName: company.name,
      stage: "Publishing",
      risk: post.status === "dead" ? "critical" : "high",
      title: post.status === "dead" ? "Publishing retry limit reached" : "Publishing retry pending",
      detail:
        post.status === "dead"
          ? "This item requires staff review before it can be requeued."
          : "The governed publishing queue can retry this eligible item.",
      href: `/publishing?company=${company.id}`,
      sla: post.status === "dead" ? "Within 4 hours" : "Next scheduled run",
      ageDays: ageDays(post.updatedAt, nowIso),
      estimatedMinutes: post.status === "dead" ? 15 : 5,
    });
  }

  return rows.sort(
    (left, right) =>
      riskRank(right.risk) - riskRank(left.risk) ||
      right.ageDays - left.ageDays ||
      left.companyName.localeCompare(right.companyName),
  );
}

export function buildAgencyControlPlane(
  input: AgencyControlPlaneInput,
): AgencyControlPlaneSnapshot {
  const tenantCompanies = input.companies.filter(
    (company) => company.tenantId === input.tenantId && isManagedCompany(company),
  );
  const companyIds = new Set(tenantCompanies.map((company) => company.id));
  const inTenant = <T extends { tenantId: string; companyId: string }>(row: T) =>
    row.tenantId === input.tenantId && companyIds.has(row.companyId);
  const strategyCycles = input.strategyCycles.filter(inTenant);
  const concepts = input.concepts.filter(inTenant);
  const slots = input.slots.filter(inTenant);
  const approvals = input.approvals.filter(inTenant);
  const deliveryRuns = input.deliveryRuns.filter(inTenant);
  const managedJobs = input.managedJobs.filter(inTenant);
  const scheduledPosts = input.scheduledPosts.filter((row) =>
    companyIds.has(row.companyId),
  );
  const publishLogs = input.publishLogs.filter((row) =>
    companyIds.has(row.companyId),
  );
  const activeClients = tenantCompanies.filter(isActiveClient);
  const activeIds = new Set(activeClients.map((company) => company.id));
  const nowDate = dateOnly(input.nowIso);
  const horizonEnd = addDays(input.nowIso, 30);
  const currentQuarter = quarterStart(input.nowIso);
  const confirmedProfileByCompany =
    latestConfirmedProfileByCompany(strategyCycles);
  const confirmedProfiles = activeClients.filter((company) =>
    confirmedProfileByCompany.has(company.id),
  ).length;
  const currentStrategyCompanyIds = new Set(
    strategyCycles
      .filter(
        (cycle) =>
          cycle.quarterStart === currentQuarter && cycle.status === "approved",
      )
      .map((cycle) => cycle.companyId),
  );
  const currentStrategies = activeClients.filter((company) =>
    currentStrategyCompanyIds.has(company.id),
  ).length;

  const horizonCounts = new Map<string, number>();
  for (const slot of slots) {
    const plannedDate = dateOnly(slot.plannedPublishAt);
    if (
      slot.status !== "cancelled" &&
      activeIds.has(slot.companyId) &&
      plannedDate >= nowDate &&
      plannedDate <= horizonEnd
    ) {
      horizonCounts.set(
        slot.companyId,
        (horizonCounts.get(slot.companyId) ?? 0) + 1,
      );
    }
  }
  const scheduleCovered = activeClients.filter(
    (company) =>
      (horizonCounts.get(company.id) ?? 0) >= CALENDAR_COVERAGE_ITEMS,
  ).length;

  const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
  const finalisationDue = slots.filter(
    (slot) =>
      activeIds.has(slot.companyId) &&
      slot.status !== "cancelled" &&
      slot.finalContentDueAt <= input.nowIso &&
      slot.plannedPublishAt >= input.nowIso,
  );
  const finalisedOnTime = finalisationDue.filter((slot) => {
    const concept = conceptById.get(slot.conceptId);
    return Boolean(
      concept &&
        FINAL_CONCEPT_STATUSES.has(concept.status) &&
        concept.updatedAt <= slot.finalContentDueAt,
    );
  }).length;

  const respondedApprovals = approvals.filter(
    (request) =>
      Boolean(request.respondedAt) &&
      request.respondedAt! >= addDays(input.nowIso, -30),
  );
  const approvalsOnTime = respondedApprovals.filter(
    (request) => request.respondedAt! <= request.dueAt,
  ).length;
  const attempts = publishLogs.filter((log) =>
    ["published", "failed"].includes(log.status),
  );
  const successfulPublishes = attempts.filter(
    (log) => log.status === "published",
  ).length;
  const pauses = tenantCompanies.filter((company) =>
    ["paused", "pending_payment", "past_due_grace"].includes(
      company.profile.managedService?.serviceBilling?.status ?? "",
    ),
  ).length;

  const allExceptions = buildExceptions({
    nowIso: input.nowIso,
    companies: tenantCompanies,
    cycles: strategyCycles,
    slots,
    approvals,
    runs: deliveryRuns,
    posts: scheduledPosts,
    jobs: managedJobs,
  });
  const exceptionCompanyIds = new Set(
    allExceptions.map((exception) => exception.companyId),
  );
  const runningAutomatically = tenantCompanies.filter(
    (company) =>
      isActiveClient(company) && !exceptionCompanyIds.has(company.id),
  ).length;
  const exceptionClients = exceptionCompanyIds.size;
  const stageCounts = new Map<ControlPlaneStage, number>();
  for (const item of allExceptions) {
    stageCounts.set(item.stage, (stageCounts.get(item.stage) ?? 0) + 1);
  }
  const bottleneckStage =
    [...stageCounts.entries()].sort(
      (left, right) => right[1] - left[1],
    )[0]?.[0] ?? null;
  const dueReminderCount = approvals.reduce(
    (total, request) =>
      total + dueApprovalReminders(request, input.nowIso).length,
    0,
  );

  const metrics: ControlPlaneMetric[] = [
    {
      label: "Active clients",
      value: activeClients.length.toLocaleString(),
      detail: "Active service billing records",
      tone: "good",
    },
    {
      label: "Profiles confirmed",
      value: metricValue(confirmedProfiles, activeClients.length),
      detail: `${confirmedProfiles} of ${activeClients.length} active clients`,
    },
    {
      label: "Strategy current",
      value: metricValue(currentStrategies, activeClients.length),
      detail: "Approved for the current quarter",
    },
    {
      label: "30-day schedule coverage",
      value: metricValue(scheduleCovered, activeClients.length),
      detail: `At least ${CALENDAR_COVERAGE_ITEMS} durable planned items`,
    },
    {
      label: "Concepts finalised 14 days ahead",
      value: metricValue(finalisedOnTime, finalisationDue.length),
      detail:
        finalisationDue.length > 0
          ? `${finalisedOnTime} of ${finalisationDue.length} slots due for finalisation`
          : "No slots have reached the 14-day finalisation checkpoint",
    },
    {
      label: "Approvals on time",
      value: metricValue(approvalsOnTime, respondedApprovals.length),
      detail:
        respondedApprovals.length > 0
          ? `${approvalsOnTime} of ${respondedApprovals.length} responses in 30 days`
          : "No approval responses recorded in 30 days",
    },
    {
      label: "Publishing success",
      value: metricValue(successfulPublishes, attempts.length),
      detail:
        attempts.length > 0
          ? `${successfulPublishes} of ${attempts.length} attempts in 30 days`
          : "No publishing attempts recorded in 30 days",
    },
    {
      label: "Payment or service pauses",
      value: pauses.toLocaleString(),
      detail: "Pending payment, grace period, or paused service",
      tone: pauses > 0 ? "danger" : "good",
    },
    {
      label: "Automation / exception rate",
      value: `${metricValue(runningAutomatically, tenantCompanies.length)} / ${metricValue(exceptionClients, tenantCompanies.length)}`,
      detail: `${runningAutomatically} automatic · ${exceptionClients} need attention`,
      tone: exceptionClients > 0 ? "warning" : "good",
    },
  ];

  return {
    activeClients: activeClients.length,
    managedClients: tenantCompanies.length,
    runningAutomatically,
    exceptionClients,
    automationRate: percent(runningAutomatically, tenantCompanies.length),
    exceptionRate: percent(exceptionClients, tenantCompanies.length),
    metrics,
    exceptions: allExceptions.slice(0, EXCEPTION_LIST_LIMIT),
    exceptionTotal: allExceptions.length,
    queueMinutes: allExceptions.reduce(
      (total, item) => total + item.estimatedMinutes,
      0,
    ),
    oldestAgeDays: Math.max(0, ...allExceptions.map((item) => item.ageDays)),
    bottleneckStage,
    unassignedCount: allExceptions.filter(
      (item) => item.owner === "Unassigned",
    ).length,
    retryablePublishingCount: scheduledPosts.filter((post) =>
      isRetryEligiblePost(
        post,
        publishLogs
          .filter((log) => log.scheduledPostId === post.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        {
          nowIso: input.nowIso,
          today: input.queueToday ?? dateOnly(input.nowIso),
          hhmm: input.queueHhmm ?? input.nowIso.slice(11, 16),
        },
      ),
    ).length,
    dueReminderCount,
    computedAt: input.nowIso,
  };
}

export async function loadAgencyControlPlane(
  tenantId: string,
  nowIso = new Date().toISOString(),
): Promise<AgencyControlPlaneSnapshot> {
  const sinceIso = new Date(Date.parse(nowIso) - 30 * DAY_MS).toISOString();
  const [
    companies,
    strategyCycles,
    concepts,
    slots,
    approvals,
    deliveryRuns,
    scheduledPosts,
    publishLogs,
    managedJobs,
    queueClock,
  ] = await Promise.all([
    listCompanies(tenantId),
    listManagedStrategyCycles(tenantId),
    listManagedContentConcepts(tenantId),
    listManagedPlannedSlots(tenantId),
    listManagedApprovalRequests(tenantId),
    listManagedDeliveryRuns(tenantId),
    listScheduledPosts(tenantId),
    listPublishLogsSince(tenantId, sinceIso),
    listManagedJobs(tenantId),
    queueNowPartsForTenant(tenantId),
  ]);

  return buildAgencyControlPlane({
    tenantId,
    nowIso,
    companies,
    strategyCycles,
    concepts,
    slots,
    approvals,
    deliveryRuns,
    scheduledPosts,
    publishLogs,
    managedJobs,
    queueToday: queueClock.today,
    queueHhmm: queueClock.hhmm,
  });
}
