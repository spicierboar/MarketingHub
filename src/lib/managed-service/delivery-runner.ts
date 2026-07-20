// Managed delivery runner — post-onboarding strategy + calendar + draft content.
//
// HARD RULES:
//   • Creates draft campaigns / ai_draft content / calendar SUGGESTIONS only
//   • May promote awaiting_approval → active when enough items are approved/scheduled
//   • NEVER calls scheduleOne, publishDuePosts, or any go-live path
//   • Critique gate and approval policies remain the only publish path
//
// Timing:
//   • signup / onboarding: strategyEligibleAt = onboard+6h, strategyDueAt = onboard+12h
//   • local demo: eligibleAt = now (so strategy can unlock without waiting 6h)
//   • package_change: strategyEligibleAt = now (no 6h delay), strategyDueAt = now+12h
// processDueManagedDeliveries must not start generating until now >= strategyEligibleAt.

import { logAction } from "@/lib/audit";
import { executeCampaignBuilder, unpackKeyMessage } from "@/lib/campaign-builder";
import {
  createCalendarAssistSuggestion,
  getCompany,
  getManagedDeliveryRun,
  getTenant,
  listCalendarAssistSuggestions,
  listCampaignDraftScheduleItems,
  listContent,
  listManagedDeliveryRuns,
  listOpenManagedDeliveryRuns,
  listScheduledPosts,
  createManagedDeliveryRun,
  updateCompany,
  updateContent,
  updateManagedDeliveryRun,
} from "@/lib/db";
import { surfaceCalendarAssistSuggestions } from "@/lib/ai/calendar-assist";
import { localDemoEnabled } from "@/lib/env";
import { defaultServiceLevel } from "@/lib/managed-service/authority";
import {
  generateDetailedMarketingStrategy,
  initialDetailedStrategyStatus,
  pushStrategyHistory,
  strategyChannelPlanFromDetailed,
  strategySummaryFromDetailed,
} from "@/lib/managed-service/detailed-strategy";
import { notifyClientException } from "@/lib/managed-service/exception-notify";
import { sendImplementationPlanEmail } from "@/lib/managed-service/implementation-plan-email";
import { applyQualityRoutingAfterDraft } from "@/lib/managed-service/quality-routing";
import {
  defaultPackageGuardrails,
  resolveCompanyPackage,
  resolveSelectionForPackage,
} from "@/lib/marketing-packages";
import {
  initialCompanyServiceBilling,
  refreshFailedPaymentPause,
  serviceOperationsAllowed,
} from "@/lib/managed-service-billing";
import {
  createManagedConceptBundle,
  ensureQuarterlyStrategyCycle,
} from "@/lib/managed-service/workflow-service";
import { now } from "@/lib/utils";
import type {
  ActingUser,
  Company,
  ManagedDeliveryEnqueueReason,
  ManagedDeliveryPhase,
  ManagedDeliveryRun,
  ManagedChannelKey,
  ManagedServiceLevel,
  ManagedServiceSettings,
  MarketingPackageId,
} from "@/lib/types";

const MAX_RUNS_PER_TICK = 5;
const MAX_PROMOTIONS_PER_TICK = 10;
/** Floor: do not generate before this many hours after signup/onboarding. */
export const STRATEGY_ELIGIBLE_HOURS = 6;
/** Ceiling: strategy should be ready within this many hours after signup/onboarding. */
export const STRATEGY_DUE_HOURS = 12;
const MAX_PLAN_SUGGESTIONS = 12;

const IN_PROGRESS: ReadonlySet<ManagedDeliveryPhase> = new Set([
  "queued",
  "validating",
  "analysing",
  "strategy",
  "calendar",
  "content",
]);

const PIPELINE_STATUSES = new Set([
  "ai_draft",
  "user_edited",
  "pending_approval",
  "approved",
  "scheduled",
]);

/** Map marketing-package channel slugs → campaign-builder channel labels. */
const PACKAGE_CHANNEL_TO_BUILDER: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  gbp: "Google Business Profile",
  email: "Email",
  tiktok: "TikTok",
  youtube: "YouTube / Shorts",
  youtube_shorts: "YouTube / Shorts",
  linkedin: "LinkedIn",
  threads: "Threads",
  x: "X",
  pinterest: "Pinterest",
  website: "Website / blog / CMS",
  cms: "Website / blog / CMS",
  sms: "SMS",
  whatsapp: "WhatsApp / RCS",
  seo: "Local and technical SEO",
  aeo: "AEO / GEO",
  analytics: "Analytics",
  paid_media: "Paid media",
};

const BUILDER_TO_MANAGED_CHANNEL: Record<string, ManagedChannelKey> = {
  Facebook: "facebook",
  Instagram: "instagram",
  TikTok: "tiktok",
  "YouTube / Shorts": "youtube_shorts",
  LinkedIn: "linkedin",
  Threads: "threads",
  X: "x",
  Pinterest: "pinterest",
  "Google Business Profile": "google_business_profile",
  "Website / blog / CMS": "website_blog_cms",
  Email: "email",
  SMS: "sms",
  "WhatsApp / RCS": "whatsapp_rcs",
  "Local and technical SEO": "local_technical_seo",
  "AEO / GEO": "aeo_geo",
  Analytics: "analytics",
  "Paid media": "paid_media",
};

/**
 * Promote awaiting_approval → active when enough campaign content has moved
 * forward: at least one scheduled post, OR a majority of pipeline items are
 * approved/scheduled. Never publishes — only advances run phase.
 */
export function shouldPromoteAwaitingApprovalToActive(args: {
  pipelineCount: number;
  approvedOrScheduledCount: number;
  scheduledPostCount: number;
}): boolean {
  if (args.scheduledPostCount >= 1) return true;
  if (args.pipelineCount <= 0) return false;
  return args.approvedOrScheduledCount >= Math.ceil(args.pipelineCount / 2);
}

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
}

/** True when generation may start (now >= strategyEligibleAt). */
export function isStrategyEligible(
  run: Pick<ManagedDeliveryRun, "strategyEligibleAt" | "onboardingCompletedAt">,
  atIso: string = now(),
): boolean {
  const eligibleAt =
    run.strategyEligibleAt ?? addHours(run.onboardingCompletedAt, STRATEGY_ELIGIBLE_HOURS);
  return new Date(atIso).getTime() >= new Date(eligibleAt).getTime();
}

function goalFromProfile(company: Company): string {
  const nature = company.profile.natureOfBusiness?.trim();
  const services = (company.profile.services ?? []).filter(Boolean).join(", ");
  const industry = company.profile.industry?.trim();
  if (nature && services) {
    return `Grow awareness and enquiries for ${nature} offering ${services}`;
  }
  if (nature) return `Grow awareness and enquiries for ${nature}`;
  if (services) return `Promote ${services} to local customers`;
  if (industry) return `Build a 30-day marketing plan for a ${industry} business`;
  return `Build a 30-day marketing plan for ${company.name}`;
}

function hasBusinessInfo(company: Company): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const p = company.profile;
  const hasNature = Boolean(p.natureOfBusiness?.trim());
  const hasServices = (p.services ?? []).some((s) => s.trim());
  const hasIndustry = Boolean(p.industry?.trim());
  const hasAreas = (p.serviceAreas ?? []).some((s) => s.trim());
  if (!hasNature && !hasServices && !hasIndustry) {
    missing.push("natureOfBusiness_or_services_or_industry");
  }
  if (!hasAreas && !hasNature && !hasServices) {
    missing.push("serviceAreas_or_business_description");
  }
  return { ok: missing.length === 0, missing };
}

function assumptionsFromProfile(company: Company): string[] {
  const p = company.profile;
  const out: string[] = [];
  if (p.natureOfBusiness) out.push(`Business: ${p.natureOfBusiness}`);
  if (p.services?.length) out.push(`Services: ${p.services.join(", ")}`);
  if (p.targetCustomers) out.push(`Audience: ${p.targetCustomers}`);
  if (p.serviceAreas?.length) out.push(`Areas: ${p.serviceAreas.join(", ")}`);
  if (p.brandVoice) out.push(`Voice: ${p.brandVoice}`);
  if (out.length === 0) out.push("Limited profile — using company name and defaults");
  return out;
}

function builderChannelsFromPackage(company: Company, tenantCatalog: Parameters<typeof resolveCompanyPackage>[1]): string[] {
  const pkg = resolveCompanyPackage(company, tenantCatalog);
  const mapped = pkg.channels
    .map((c) => PACKAGE_CHANNEL_TO_BUILDER[c.toLowerCase()] ?? null)
    .filter((c): c is string => Boolean(c));
  // Deduplicate preserving order
  return [...new Set(mapped)];
}

async function patchCompanyManaged(
  company: Company,
  patch: Partial<ManagedServiceSettings>,
): Promise<void> {
  const prev = company.profile.managedService ?? {
    serviceLevel: defaultServiceLevel(),
  };
  await updateCompany(company.id, {
    profile: {
      ...company.profile,
      managedService: { ...prev, ...patch },
    },
  });
}

/**
 * Surface implementation-plan milestones onto the client calendar as assist
 * suggestions (never scheduled_posts). Uses campaign draft-schedule dates when
 * available; otherwise seeds a light 4-week cadence from the package.
 */
async function surfaceImplementationPlanOnCalendar(args: {
  tenantId: string;
  companyId: string;
  campaignId: string | null;
  actorId: string;
  postsPerMonth: number;
}): Promise<number> {
  const existing = await listCalendarAssistSuggestions(
    args.tenantId,
    [args.companyId],
    "open",
  );
  const existingKeys = new Set(
    existing.map((s) => `${s.kind}|${s.proposedDate}|${s.title.toLowerCase()}`),
  );

  const drafts = args.campaignId
    ? await listCampaignDraftScheduleItems(args.campaignId)
    : [];

  type PlanRow = {
    date: string;
    title: string;
    brief: string;
    platform: string;
  };
  const rows: PlanRow[] = [];

  for (const d of drafts.slice(0, MAX_PLAN_SUGGESTIONS)) {
    rows.push({
      date: d.scheduledDate,
      title: d.title || "Planned campaign post",
      brief: `Implementation plan slot on ${d.platform}. Draft only — nothing publishes until approved.`,
      platform: d.platform || "Facebook",
    });
  }

  // If the builder produced few/no slots, seed clear plan milestones so the
  // client calendar is not empty for the first 4 weeks.
  if (rows.length < 4) {
    const today = new Date().toISOString().slice(0, 10);
    const cadence = Math.max(2, Math.round(args.postsPerMonth / 4)); // ~weekly bucket
    const platforms = ["Facebook", "Instagram"];
    for (let week = 0; week < 4 && rows.length < MAX_PLAN_SUGGESTIONS; week += 1) {
      for (let i = 0; i < Math.min(cadence, 2) && rows.length < MAX_PLAN_SUGGESTIONS; i += 1) {
        const day = new Date(today + "T12:00:00Z");
        day.setUTCDate(day.getUTCDate() + week * 7 + 2 + i * 3);
        const date = day.toISOString().slice(0, 10);
        const platform = platforms[i % platforms.length]!;
        rows.push({
          date,
          title: `Week ${week + 1} planned presence`,
          brief: `Package cadence placeholder for week ${week + 1}. Review and approve drafts in the portal before anything goes live.`,
          platform,
        });
      }
    }
  }

  let created = 0;
  for (const row of rows) {
    const key = `implementation_plan|${row.date}|${row.title.toLowerCase()}`;
    if (existingKeys.has(key)) continue;
    await createCalendarAssistSuggestion({
      tenantId: args.tenantId,
      companyId: args.companyId,
      kind: "implementation_plan",
      title: row.title,
      brief: row.brief,
      proposedDate: row.date,
      proposedTime: "11:00",
      platform: row.platform,
      requestType: "social_post",
      evidence: [
        {
          signal: "implementation_plan",
          observed: `delivery_run plan slot ${row.date}`,
        },
      ],
      priority: 75,
      status: "open",
      createdById: args.actorId,
      aiRunId: null,
    });
    existingKeys.add(key);
    created += 1;
  }
  return created;
}

async function maybeSendImplementationPlanEmail(
  run: ManagedDeliveryRun,
  company: Company,
): Promise<ManagedDeliveryRun> {
  if (run.implementationPlanEmailedAt) return run;
  if (!run.strategyCompletedAt || !run.calendarCompletedAt) return run;

  try {
    await sendImplementationPlanEmail({
      tenantId: run.tenantId,
      companyId: run.companyId,
      campaignId: run.campaignId,
      runId: run.id,
    });
  } catch {
    /* never abort the runner for email failures */
  }

  const stamped = now();
  const next = await advancePhase(run, { implementationPlanEmailedAt: stamped });
  await patchCompanyManaged(company, {
    implementationPlanEmailedAt: stamped,
    lastDeliveryRunId: run.id,
  });
  return next;
}

/**
 * After Add Client / New Client: ensure a marketing package (default Basic) and
 * enqueue strategy delivery when the tenant has finished workspace onboarding.
 * Local demo: if workspace onboarding stamp is missing, use now() so strategy
 * is not stuck idle; eligibility floor is skipped in enqueueManagedDeliveryForCompany.
 */
export async function ensureManagedDeliveryBootstrap(args: {
  actor: ActingUser;
  tenantId: string;
  companyId: string;
  /** ISO from tenant.onboardingCompletedAt — demo falls back to now() when missing. */
  onboardingCompletedAt: string | null | undefined;
  reason?: ManagedDeliveryEnqueueReason;
  /** When no package is set, assign this (default basic). */
  defaultPackageId?: MarketingPackageId;
}): Promise<ManagedDeliveryRun | null> {
  const onboardedAt =
    args.onboardingCompletedAt ?? (localDemoEnabled() ? now() : null);
  if (!onboardedAt) return null;
  const company = await getCompany(args.companyId);
  if (!company || company.status === "archived") return null;

  const tenant = await getTenant(args.tenantId);
  const prev = company.profile.managedService;
  let serviceLevel = prev?.serviceLevel;
  let marketingPackageId = prev?.marketingPackageId;

  if (!marketingPackageId) {
    const packageId = args.defaultPackageId ?? "starter";
    const selection = resolveSelectionForPackage(tenant, packageId);
    serviceLevel = selection.serviceLevel;
    marketingPackageId = packageId;
    // Quick-add / skip-checkout bootstrap: unpaid until demo mock or live settle.
    // Demo still enqueues; Strategy UI surfaces billing-pending for non-demo.
    await updateCompany(company.id, {
      profile: {
        ...company.profile,
        managedService: {
          ...(prev ?? { serviceLevel }),
          serviceLevel,
          marketingPackageId,
          serviceBilling: initialCompanyServiceBilling(packageId),
          ...(packageId === "custom" && selection.customModules
            ? { customModules: selection.customModules }
            : {}),
          ...(!localDemoEnabled() ? { packageChangePendingBilling: true } : {}),
        },
      },
    });
    await logAction(args.actor, "company.marketing_package_set", {
      targetType: "company",
      targetId: company.id,
      companyId: company.id,
      detail: `${packageId} · ${serviceLevel} (default on create)${
        localDemoEnabled() ? "" : " · packageChangePendingBilling"
      }`,
    });
  }

  const allRuns = await listManagedDeliveryRuns(args.tenantId, args.companyId);
  const open = allRuns.filter((r) => IN_PROGRESS.has(r.phase));
  if (open.length > 0) return open[0] ?? null;

  // Awaiting approval / active are not in listOpenManagedDeliveryRuns — do not
  // spawn a duplicate run on every Overview / Strategy page load.
  const settled = allRuns.find(
    (r) => r.phase === "awaiting_approval" || r.phase === "active",
  );
  if (settled) return settled;

  const stamped = await getCompany(args.companyId);
  if (!serviceOperationsAllowed(stamped?.profile.managedService?.serviceBilling)) {
    return null;
  }
  if (
    stamped?.profile.managedService?.strategySummary ||
    stamped?.profile.managedService?.strategyCompletedAt
  ) {
    return allRuns[0] ?? null;
  }

  // Prefer catalog default for the assigned package over a stale "approval"
  // stamp that would leave strategy idle after Overview shows Assigned.
  const catalogLevel = resolveSelectionForPackage(
    tenant,
    (marketingPackageId ?? args.defaultPackageId ?? "starter") as MarketingPackageId,
  ).serviceLevel;
  const level =
    serviceLevel && serviceLevel !== "approval" ? serviceLevel : catalogLevel;

  // Persist package default level when still on approval so Overview matches delivery.
  if (marketingPackageId && (!serviceLevel || serviceLevel === "approval") && level !== "approval") {
    const fresh = await getCompany(args.companyId);
    if (fresh) {
      const ms = fresh.profile.managedService;
      await updateCompany(fresh.id, {
        profile: {
          ...fresh.profile,
          managedService: {
            ...(ms ?? { serviceLevel: level }),
            serviceLevel: level,
            marketingPackageId,
          },
        },
      });
    }
  }

  const run = await enqueueManagedDeliveryForCompany({
    tenantId: args.tenantId,
    companyId: args.companyId,
    onboardingCompletedAt: onboardedAt,
    serviceLevel: level,
    reason: args.reason ?? "signup",
  });
  await logAction(args.actor, "managed_delivery.enqueued", {
    targetType: "managed_delivery_run",
    targetId: run.id,
    companyId: args.companyId,
    detail: `bootstrap eligible=${run.strategyEligibleAt} due=${run.strategyDueAt}`,
  });
  return run;
}

/**
 * Overview / Strategy on-read: ensure package + delivery run exist, then in
 * local demo advance (or force-unlock) so strategy is not left "Not started".
 */
export async function ensureAndKickManagedDeliveryForCompany(args: {
  actor: ActingUser;
  tenantId: string;
  companyId: string;
  reason?: ManagedDeliveryEnqueueReason;
  /** When true, process eligible run; in demo also force-unlock if still waiting. */
  process?: boolean;
  demoForceGenerate?: boolean;
}): Promise<ManagedDeliveryRun | null> {
  const tenant = await getTenant(args.tenantId);
  const run = await ensureManagedDeliveryBootstrap({
    actor: args.actor,
    tenantId: args.tenantId,
    companyId: args.companyId,
    onboardingCompletedAt: tenant?.onboardingCompletedAt,
    reason: args.reason ?? "signup",
  });
  if (!args.process && !args.demoForceGenerate) return run;

  let advanced = await maybeProcessEligibleDeliveryForCompany(
    args.tenantId,
    args.companyId,
    args.actor,
  );
  if (
    args.demoForceGenerate &&
    localDemoEnabled() &&
    (!advanced || !advanced.strategyCompletedAt)
  ) {
    const unlocked = await forceUnlockManagedStrategyForCompany(
      args.tenantId,
      args.companyId,
      args.actor,
    );
    if (unlocked) advanced = unlocked;
  }
  return advanced ?? run;
}

/**
 * Enqueue a managed delivery run.
 *
 * Timing by reason (see docs/MARKETING-PACKAGES.md):
 * - signup / onboarding / service_level / manual: eligibleAt = anchor+6h, dueAt = anchor+12h
 * - local demo: eligibleAt = now (skip 6h wait so demo can unlock without wall-clock)
 * - package_change: eligibleAt = now (no 6h delay), dueAt = now+12h
 */
export async function enqueueManagedDeliveryForCompany(args: {
  tenantId: string;
  companyId: string;
  onboardingCompletedAt: string;
  serviceLevel?: ManagedServiceLevel;
  reason?: ManagedDeliveryEnqueueReason;
}): Promise<ManagedDeliveryRun> {
  const company = await getCompany(args.companyId);
  if (
    !company ||
    company.tenantId !== args.tenantId ||
    !serviceOperationsAllowed(company.profile.managedService?.serviceBilling)
  ) {
    throw new Error("Managed delivery requires active billing or a valid payment grace period.");
  }
  const level =
    args.serviceLevel ??
    company?.profile.managedService?.serviceLevel ??
    defaultServiceLevel();
  const reason: ManagedDeliveryEnqueueReason = args.reason ?? "signup";
  const t = now();
  const demoSkipFloor = localDemoEnabled() && reason !== "package_change";
  const strategyEligibleAt =
    reason === "package_change" || demoSkipFloor
      ? t
      : addHours(args.onboardingCompletedAt, STRATEGY_ELIGIBLE_HOURS);
  const strategyDueAt =
    reason === "package_change" || demoSkipFloor
      ? addHours(t, STRATEGY_DUE_HOURS)
      : addHours(args.onboardingCompletedAt, STRATEGY_DUE_HOURS);

  const run = await createManagedDeliveryRun({
    tenantId: args.tenantId,
    companyId: args.companyId,
    phase: "queued",
    serviceLevel: level,
    onboardingCompletedAt: args.onboardingCompletedAt,
    strategyEligibleAt,
    strategyDueAt,
    strategyStartedAt: null,
    strategyCompletedAt: null,
    calendarCompletedAt: null,
    implementationPlanEmailedAt: null,
    enqueueReason: reason,
    campaignId: null,
    strategyVersion: 0,
    calendarVersion: 0,
    missingInfo: [],
    assumptions: [],
    errors: [],
    retryCount: 0,
    statusMessageKey: "strategy_preparing",
  });

  if (company) {
    const prev = company.profile.managedService;
    const nextMs: ManagedServiceSettings = {
      ...(prev ?? { serviceLevel: level }),
      serviceLevel: level,
      strategyEligibleAt,
      strategyDueAt,
      lastDeliveryRunId: run.id,
    };
    // Reset so the full implementation-plan email can send for the new run.
    if (reason === "package_change") {
      delete nextMs.implementationPlanEmailedAt;
    }
    await updateCompany(company.id, {
      profile: {
        ...company.profile,
        managedService: nextMs,
      },
    });
  }

  return run;
}

/** Mark open in-progress runs superseded without client exception email. */
export async function supersedeOpenManagedDeliveryRuns(
  tenantId: string,
  companyId: string,
  note = "superseded_by_package_change",
): Promise<number> {
  const open = (await listOpenManagedDeliveryRuns(tenantId)).filter(
    (r) => r.companyId === companyId,
  );
  for (const run of open) {
    await updateManagedDeliveryRun(run.id, {
      phase: "failed",
      errors: [...run.errors, note],
      statusMessageKey: "delivery_failed",
    });
  }
  return open.length;
}

async function advancePhase(
  run: ManagedDeliveryRun,
  patch: Partial<ManagedDeliveryRun>,
): Promise<ManagedDeliveryRun> {
  const updated = await updateManagedDeliveryRun(run.id, {
    ...patch,
    updatedAt: now(),
  });
  const next = updated ?? { ...run, ...patch, updatedAt: now() };

  // One call site: notify the client when a run becomes blocked or failed.
  if (next.phase === "blocked" || next.phase === "failed") {
    const kind = next.phase;
    const subject =
      next.phase === "blocked"
        ? "We need a bit more information to continue your marketing plan"
        : "We hit a snag preparing your marketing plan";
    const body =
      next.phase === "blocked"
        ? "Your marketing plan is on hold because some business details are missing or the account isn't ready. Please check in with your agency (or update your profile) so we can continue."
        : "We couldn't finish preparing your marketing plan this time. Your agency has been notified and will follow up — nothing has been published.";
    try {
      await notifyClientException({
        tenantId: next.tenantId,
        companyId: next.companyId,
        kind,
        subject,
        body,
      });
    } catch {
      /* never abort the runner for notify failures */
    }
  }

  return next;
}

/**
 * If a run is awaiting_approval and enough items are approved/scheduled,
 * transition to active and audit. Idempotent for other phases.
 */
export async function maybePromoteManagedDeliveryToActive(
  runId: string,
  actor: ActingUser,
): Promise<ManagedDeliveryRun | undefined> {
  const run = await getManagedDeliveryRun(runId);
  if (!run || run.phase !== "awaiting_approval") return run;
  const billedCompany = await getCompany(run.companyId);
  if (
    !billedCompany ||
    !serviceOperationsAllowed(billedCompany.profile.managedService?.serviceBilling)
  ) {
    return run;
  }

  const companyId = run.companyId;
  const campaignId = run.campaignId;
  const tenantId = run.tenantId;

  const content = (await listContent(tenantId)).filter((c) => {
    if (c.companyId !== companyId) return false;
    if (campaignId) return c.campaignId === campaignId;
    return true;
  });
  const pipeline = content.filter((c) => PIPELINE_STATUSES.has(c.status));
  const approvedOrScheduled = pipeline.filter(
    (c) => c.status === "approved" || c.status === "scheduled",
  );
  const pipelineIds = new Set(pipeline.map((c) => c.id));
  const scheduledPosts = (await listScheduledPosts(tenantId)).filter(
    (p) =>
      p.companyId === companyId &&
      pipelineIds.has(p.contentId) &&
      (p.status === "scheduled" ||
        p.status === "publishing" ||
        p.status === "delivery_unknown" ||
        p.status === "published"),
  );

  if (
    !shouldPromoteAwaitingApprovalToActive({
      pipelineCount: pipeline.length,
      approvedOrScheduledCount: approvedOrScheduled.length,
      scheduledPostCount: scheduledPosts.length,
    })
  ) {
    return run;
  }

  const next = await advancePhase(run, {
    phase: "active",
    statusMessageKey: "delivery_active",
  });
  await logAction(actor, "managed_delivery.activated", {
    targetType: "managed_delivery_run",
    targetId: run.id,
    companyId,
    detail: `pipeline=${pipeline.length} approved=${approvedOrScheduled.length} scheduledPosts=${scheduledPosts.length}`,
  });
  return next;
}

export async function processManagedDeliveryRun(
  runId: string,
  actor: ActingUser,
): Promise<ManagedDeliveryRun | undefined> {
  let run = await getManagedDeliveryRun(runId);
  if (!run) return undefined;
  if (run.phase === "awaiting_approval") {
    return maybePromoteManagedDeliveryToActive(runId, actor);
  }
  if (run.phase === "active") return run;
  if (run.phase === "failed" || run.phase === "blocked") return run;
  const billedCompany = await getCompany(run.companyId);
  if (
    !billedCompany ||
    billedCompany.tenantId !== run.tenantId ||
    !serviceOperationsAllowed(billedCompany.profile.managedService?.serviceBilling)
  ) {
    return advancePhase(run, {
      phase: "blocked",
      missingInfo: ["service_billing_inactive"],
      statusMessageKey: "delivery_blocked",
    });
  }

  try {
    // ---- validating --------------------------------------------------------
    if (run.phase === "queued" || run.phase === "validating") {
      run = await advancePhase(run, {
        phase: "validating",
        statusMessageKey: "strategy_preparing",
      });
      const company = await getCompany(run.companyId);
      if (!company || company.tenantId !== run.tenantId) {
        return advancePhase(run, {
          phase: "failed",
          errors: [...run.errors, "company_not_found"],
          statusMessageKey: "delivery_failed",
        });
      }
      if (company.status === "archived") {
        return advancePhase(run, {
          phase: "blocked",
          missingInfo: ["company_archived"],
          statusMessageKey: "delivery_blocked",
        });
      }
      if (
        !serviceOperationsAllowed(company.profile.managedService?.serviceBilling)
      ) {
        const managedService = company.profile.managedService;
        if (managedService?.serviceBilling?.status === "past_due_grace") {
          await updateCompany(company.id, {
            profile: {
              ...company.profile,
              managedService: {
                ...managedService,
                serviceBilling: refreshFailedPaymentPause(
                  managedService.serviceBilling,
                  now(),
                ),
              },
            },
          });
        }
        return advancePhase(run, {
          phase: "blocked",
          missingInfo: ["service_billing_paused"],
          statusMessageKey: "delivery_blocked",
        });
      }
      const info = hasBusinessInfo(company);
      if (!info.ok) {
        return advancePhase(run, {
          phase: "blocked",
          missingInfo: info.missing,
          statusMessageKey: "delivery_blocked",
        });
      }
      run = await advancePhase(run, { phase: "analysing" });
    }

    // ---- analysing ---------------------------------------------------------
    if (run.phase === "analysing") {
      const company = await getCompany(run.companyId);
      if (!company) {
        return advancePhase(run, {
          phase: "failed",
          errors: [...run.errors, "company_not_found"],
          statusMessageKey: "delivery_failed",
        });
      }
      const assumptions = assumptionsFromProfile(company);
      run = await advancePhase(run, {
        phase: "strategy",
        assumptions,
        strategyStartedAt: run.strategyStartedAt ?? now(),
        statusMessageKey: "strategy_preparing",
      });
      await patchCompanyManaged(company, {
        strategyStartedAt: run.strategyStartedAt ?? now(),
        lastDeliveryRunId: run.id,
      });
    }

    // ---- strategy (draft campaign only — never schedule) -------------------
    if (run.phase === "strategy") {
      const company = await getCompany(run.companyId);
      if (!company) {
        return advancePhase(run, {
          phase: "failed",
          errors: [...run.errors, "company_not_found"],
          statusMessageKey: "delivery_failed",
        });
      }

      const tenant = await getTenant(run.tenantId);
      const channels = builderChannelsFromPackage(company, tenant);
      const pkg = resolveCompanyPackage(company, tenant);

      const startDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      const profileGoal = goalFromProfile(company);
      const currentPackageId =
        company.profile.managedService?.serviceBilling?.activePackageId ??
        pkg.id;
      const seasonalInputs = [
        company.profile.localMarketNotes,
        company.profile.currentOffers,
        company.profile.tradingHours,
      ].filter((value): value is string => Boolean(value?.trim()));
      // Plan-seeded guardrails: package defaults first; profile services act as
      // an early override before Desk edits the strategy cycle.
      const packageDefaults = defaultPackageGuardrails({
        id: pkg.id,
        channels: pkg.channels,
        defaultServiceLevel: pkg.serviceLevel,
        serviceLevel: pkg.serviceLevel,
      });
      const strategyCycle = await ensureQuarterlyStrategyCycle({
        company,
        packageId: currentPackageId,
        goals: [profileGoal],
        seasonalInputs: seasonalInputs.length
          ? seasonalInputs
          : ["No seasonal constraints confirmed for this quarter"],
        profileConfirmedAt: company.updatedAt,
        channels: channels
          .map((channel) => BUILDER_TO_MANAGED_CHANNEL[channel])
          .filter((channel): channel is ManagedChannelKey => Boolean(channel)),
        themes: company.profile.services.length
          ? company.profile.services
          : packageDefaults.themes,
        publishWindows: packageDefaults.publishWindows,
      });
      const goal = [
        profileGoal,
        `Marketing package: ${pkg.name} (A$${pkg.priceAudMonthly}/mo).`,
        `Deliver ~${pkg.postsPerMonth} organic posts/month across ${channels.join(", ") || "default channels"}.`,
        `${pkg.campaignsPerMonth} campaign slot(s)/month; ${pkg.promosIncludedPerMonth} included promo(s)/month.`,
        pkg.adsManagementIncluded
          ? "Ads management included; media spend always extra."
          : "Ads management not included; media spend always extra.",
      ].join(" ");
      const exec = await executeCampaignBuilder({
        input: {
          company,
          goal,
          audience: company.profile.targetCustomers,
          channels,
          durationDays: 30,
          startDate,
          offer: null,
        },
        userId: actor.id,
        audience: company.profile.targetCustomers,
        durationDays: 30,
        channels,
        offer: null,
      });
      const scheduleItems = await listCampaignDraftScheduleItems(exec.campaign.id);
      const campaignContent = (await listContent(run.tenantId)).filter(
        (item) =>
          item.companyId === company.id &&
          item.campaignId === exec.campaign.id &&
          exec.spawnedContentIds.includes(item.id),
      );
      for (const [index, contentItem] of campaignContent.entries()) {
        const schedule = scheduleItems.find(
          (item) =>
            item.contentId === contentItem.id ||
            item.campaignItemId === contentItem.campaignItemId,
        );
        if (!schedule) continue;
        const channelKey =
          BUILDER_TO_MANAGED_CHANNEL[schedule.platform] ?? "facebook";
        const plannedPublishAt = new Date(
          `${schedule.scheduledDate}T${schedule.scheduledTime ?? "11:00"}:00.000Z`,
        ).toISOString();
        const concept = await createManagedConceptBundle({
          tenantId: run.tenantId,
          companyId: company.id,
          strategyCycleId: strategyCycle.id,
          campaignId: exec.campaign.id,
          packagePeriod: schedule.scheduledDate.slice(0, 7),
          unitKey:
            schedule.campaignItemId ??
            contentItem.campaignItemId ??
            `campaign-${exec.campaign.id}-${index + 1}`,
          title: contentItem.title,
          theme: contentItem.title,
          adaptations: [
            {
              channelKey,
              copy: contentItem.body,
              plannedPublishAt,
            },
          ],
        });
        await updateContent(contentItem.id, {
          managedConceptId: concept.id,
          managedChannelKey: channelKey,
        });
      }

      const nextVersion = run.strategyVersion + 1;
      const strategyStatus = initialDetailedStrategyStatus(
        run.serviceLevel ??
          company.profile.managedService?.serviceLevel ??
          defaultServiceLevel(),
      );
      const detailedStrategy = await generateDetailedMarketingStrategy({
        company,
        pkg,
        channels,
        version: nextVersion,
        status: strategyStatus,
      });
      const { strategy, meta } = unpackKeyMessage(exec.campaign.keyMessage);
      const strategySummary =
        strategySummaryFromDetailed(detailedStrategy) ||
        (exec.result.strategy || strategy).trim() ||
        `Package-led plan for ${company.name} on ${pkg.name}: ~${pkg.postsPerMonth}/mo across ${channels.join(", ") || "social"}.`;
      const strategyChannelPlan =
        strategyChannelPlanFromDetailed(detailedStrategy) ||
        (exec.result.channelPlan || meta?.channelPlan || "").trim() ||
        `Channels: ${channels.join(", ") || "per package"} · cadence ~${pkg.postsPerMonth}/mo.`;

      const msPrev = company.profile.managedService;
      const detailedStrategyHistory = pushStrategyHistory(
        msPrev?.detailedStrategy,
        msPrev?.detailedStrategyHistory,
      );

      // Draft schedules from the builder are proposal rows only — not live posts.
      const strategyCompletedAt = now();
      const assumptions = [
        ...run.assumptions,
        `Package: ${pkg.name} · channels=${channels.join(",") || "default"} · ~${pkg.postsPerMonth}/mo`,
        `Detailed strategy v${nextVersion} (${detailedStrategy.model})`,
      ];
      run = await advancePhase(run, {
        phase: "calendar",
        campaignId: exec.campaign.id,
        strategyCompletedAt,
        strategyVersion: nextVersion,
        assumptions,
        statusMessageKey: "strategy_ready",
      });
      await patchCompanyManaged(company, {
        strategyCompletedAt,
        strategySummary,
        strategyChannelPlan,
        strategyPackageName: pkg.name,
        detailedStrategy,
        detailedStrategyHistory,
        lastDeliveryRunId: run.id,
      });
      await logAction(actor, "managed_delivery.strategy_drafted", {
        targetType: "managed_delivery_run",
        targetId: run.id,
        companyId: company.id,
        detail: `campaign=${exec.campaign.id} drafts=${exec.spawnedContentIds.length} package=${pkg.id} strategy=v${nextVersion}`,
      });
    }

    // ---- calendar (suggestions only) ---------------------------------------
    if (run.phase === "calendar") {
      const company = await getCompany(run.companyId);
      if (!company) {
        return advancePhase(run, {
          phase: "failed",
          errors: [...run.errors, "company_not_found"],
          statusMessageKey: "delivery_failed",
        });
      }

      const tenant = await getTenant(run.tenantId);
      const pkg = resolveCompanyPackage(company, tenant);
      const assumptions = [...run.assumptions];
      try {
        const created = await surfaceCalendarAssistSuggestions(run.tenantId, actor.id, {
          companyIds: [run.companyId],
        });
        assumptions.push(
          created > 0
            ? `Calendar assist surfaced ${created} suggestion(s)`
            : "Calendar will be filled from campaign item planned dates",
        );
      } catch {
        assumptions.push(
          "Calendar assist unavailable — calendar will be filled from campaign item planned dates",
        );
      }

      try {
        const planSlots = await surfaceImplementationPlanOnCalendar({
          tenantId: run.tenantId,
          companyId: run.companyId,
          campaignId: run.campaignId ?? null,
          actorId: actor.id,
          postsPerMonth: pkg.postsPerMonth || 8,
        });
        assumptions.push(
          planSlots > 0
            ? `Implementation plan placed ${planSlots} milestone(s) on calendar`
            : "Implementation plan milestones already present",
        );
      } catch {
        assumptions.push("Implementation plan calendar seeding skipped");
      }

      const calendarCompletedAt = now();
      run = await advancePhase(run, {
        phase: "content",
        calendarCompletedAt,
        calendarVersion: run.calendarVersion + 1,
        assumptions,
        statusMessageKey: "calendar_updated",
      });
      await patchCompanyManaged(company, {
        calendarCompletedAt,
        lastDeliveryRunId: run.id,
      });
      await logAction(actor, "managed_delivery.calendar_suggested", {
        targetType: "managed_delivery_run",
        targetId: run.id,
        companyId: company.id,
        detail: "suggestions_only",
      });

      // Email after strategy + calendar succeed (before awaiting_approval).
      run = await maybeSendImplementationPlanEmail(run, company);
    }

    // ---- content → awaiting_approval ---------------------------------------
    if (run.phase === "content") {
      const company = await getCompany(run.companyId);
      if (!company) {
        return advancePhase(run, {
          phase: "failed",
          errors: [...run.errors, "company_not_found"],
          statusMessageKey: "delivery_failed",
        });
      }

      const companyId = run.companyId;
      const campaignId = run.campaignId;
      const tenantId = run.tenantId;
      const content = (await listContent(tenantId)).filter(
        (c) => c.companyId === companyId && c.campaignId === campaignId,
      );
      const drafts = content.filter((c) => c.status === "ai_draft" || c.status === "user_edited");

      // Safety: no live scheduled posts may have been created by this runner.
      const scheduled = (await listScheduledPosts(tenantId)).filter(
        (p) => p.companyId === companyId && drafts.some((d) => d.id === p.contentId),
      );
      if (scheduled.some((p) => p.status === "scheduled" || p.status === "published")) {
        return advancePhase(run, {
          phase: "failed",
          errors: [...run.errors, "unexpected_scheduled_post"],
          statusMessageKey: "delivery_failed",
        });
      }

      // Quality gate → client review or agency hold (never publish).
      const origin =
        process.env.APP_ORIGIN?.trim().replace(/\/+$/, "") ?? "http://localhost:3000";
      let routedClient = 0;
      let routedAgency = 0;
      const routeErrors: string[] = [];
      for (const draft of drafts) {
        try {
          const result = await applyQualityRoutingAfterDraft({
            contentId: draft.id,
            actor,
            origin,
          });
          if (result.decision === "auto_submit_client") routedClient += 1;
          else routedAgency += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          routeErrors.push(`quality_route:${draft.id}:${msg.slice(0, 120)}`);
        }
      }

      const statusMessageKey =
        routedClient > 0 ? "content_ready" : "approval_required";

      run = await advancePhase(run, {
        phase: "awaiting_approval",
        statusMessageKey:
          run.serviceLevel === "approval" ? "approval_required" : statusMessageKey,
        ...(routeErrors.length
          ? { errors: [...run.errors, ...routeErrors] }
          : {}),
      });
      await logAction(actor, "managed_delivery.awaiting_approval", {
        targetType: "managed_delivery_run",
        targetId: run.id,
        companyId: company.id,
        detail: `drafts=${drafts.length} client=${routedClient} agency=${routedAgency}`,
      });

      // Fallback email if calendar phase skipped stamp somehow.
      run = await maybeSendImplementationPlanEmail(run, company);
    }

    return run;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = await advancePhase(run, {
      phase: "failed",
      errors: [...run.errors, message.slice(0, 240)],
      retryCount: run.retryCount + 1,
      statusMessageKey: "delivery_failed",
    });
    await logAction(actor, "managed_delivery.failed", {
      targetType: "managed_delivery_run",
      targetId: run.id,
      companyId: run.companyId,
      detail: message.slice(0, 200),
    });
    return failed;
  }
}

export async function processDueManagedDeliveries(
  actor: ActingUser,
  tenantId: string,
  options: { signal?: AbortSignal; deadlineMs?: number } = {},
): Promise<number> {
  const at = now();
  const open = await listOpenManagedDeliveryRuns(tenantId);
  const due = open
    .filter((r) => IN_PROGRESS.has(r.phase))
    .filter((r) => isStrategyEligible(r, at))
    .sort((a, b) => a.strategyDueAt.localeCompare(b.strategyDueAt))
    .slice(0, MAX_RUNS_PER_TICK);

  let processed = 0;
  for (const run of due) {
    if (
      options.signal?.aborted ||
      (options.deadlineMs && Date.now() >= options.deadlineMs)
    ) break;
    await processManagedDeliveryRun(run.id, actor);
    processed += 1;
  }

  // awaiting_approval is not in listOpenManagedDeliveryRuns — promote separately.
  const awaiting = (await listManagedDeliveryRuns(tenantId))
    .filter((r) => r.phase === "awaiting_approval")
    .sort((a, b) => a.strategyDueAt.localeCompare(b.strategyDueAt))
    .slice(0, MAX_PROMOTIONS_PER_TICK);
  for (const run of awaiting) {
    if (
      options.signal?.aborted ||
      (options.deadlineMs && Date.now() >= options.deadlineMs)
    ) break;
    const before = run.phase;
    const after = await maybePromoteManagedDeliveryToActive(run.id, actor);
    if (after && after.phase !== before) processed += 1;
  }

  return processed;
}

/**
 * On-read catch-up: if a company's open delivery run is past strategyEligibleAt,
 * advance it once (covers demo / local without waiting for cron).
 */
export async function maybeProcessEligibleDeliveryForCompany(
  tenantId: string,
  companyId: string,
  actor: ActingUser,
): Promise<ManagedDeliveryRun | undefined> {
  const open = (await listOpenManagedDeliveryRuns(tenantId)).filter(
    (r) => r.companyId === companyId && IN_PROGRESS.has(r.phase),
  );
  const at = now();
  const due = open
    .filter((r) => isStrategyEligible(r, at))
    .sort((a, b) => a.strategyDueAt.localeCompare(b.strategyDueAt))[0];
  if (!due) return undefined;
  return processManagedDeliveryRun(due.id, actor);
}

/**
 * Agency/demo: unlock the 6h floor immediately and process the open run.
 * Prod-safe — still never publishes; only advances draft strategy pipeline.
 */
export async function forceUnlockManagedStrategyForCompany(
  tenantId: string,
  companyId: string,
  actor: ActingUser,
): Promise<ManagedDeliveryRun | undefined> {
  const open = (await listOpenManagedDeliveryRuns(tenantId)).filter(
    (r) => r.companyId === companyId && IN_PROGRESS.has(r.phase),
  );
  const run = open.sort((a, b) => a.strategyDueAt.localeCompare(b.strategyDueAt))[0];
  if (!run) return undefined;

  const unlockedAt = now();
  await updateManagedDeliveryRun(run.id, {
    strategyEligibleAt: unlockedAt,
    statusMessageKey: "strategy_preparing",
  });
  const company = await getCompany(companyId);
  if (company) {
    await patchCompanyManaged(company, {
      strategyEligibleAt: unlockedAt,
      lastDeliveryRunId: run.id,
    });
  }
  await logAction(actor, "managed_delivery.strategy_unlocked", {
    targetType: "managed_delivery_run",
    targetId: run.id,
    companyId,
    detail: "force_unlock",
  });
  return processManagedDeliveryRun(run.id, actor);
}

/** Test helper — list all runs for a tenant (including terminal). */
export async function listManagedDeliveryRunsForTenant(
  tenantId: string,
): Promise<ManagedDeliveryRun[]> {
  return listManagedDeliveryRuns(tenantId);
}
