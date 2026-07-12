// Managed delivery runner — post-onboarding strategy + calendar + draft content.
//
// HARD RULES:
//   • Creates draft campaigns / ai_draft content / calendar SUGGESTIONS only
//   • May promote awaiting_approval → active when enough items are approved/scheduled
//   • NEVER calls scheduleOne, publishDuePosts, or any go-live path
//   • Critique gate and approval policies remain the only publish path
//
// Timing:
//   • signup / onboarding: strategyEligibleAt = onboard+6h, strategyDueAt = onboard+24h
//   • package_change: strategyEligibleAt = now (no 6h delay), strategyDueAt = now+24h
// processDueManagedDeliveries must not start generating until now >= strategyEligibleAt.

import { logAction } from "@/lib/audit";
import { executeCampaignBuilder } from "@/lib/campaign-builder";
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
  updateManagedDeliveryRun,
} from "@/lib/db";
import { surfaceCalendarAssistSuggestions } from "@/lib/ai/calendar-assist";
import { defaultServiceLevel } from "@/lib/managed-service/authority";
import { notifyClientException } from "@/lib/managed-service/exception-notify";
import { sendImplementationPlanEmail } from "@/lib/managed-service/implementation-plan-email";
import { applyQualityRoutingAfterDraft } from "@/lib/managed-service/quality-routing";
import { resolveCompanyPackage } from "@/lib/marketing-packages";
import { now } from "@/lib/utils";
import type {
  ActingUser,
  Company,
  ManagedDeliveryEnqueueReason,
  ManagedDeliveryPhase,
  ManagedDeliveryRun,
  ManagedServiceLevel,
  ManagedServiceSettings,
} from "@/lib/types";

const MAX_RUNS_PER_TICK = 5;
const MAX_PROMOTIONS_PER_TICK = 10;
const STRATEGY_ELIGIBLE_HOURS = 6;
const STRATEGY_DUE_HOURS = 24;
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
  // tiktok not in builder supported set — omitted intentionally
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
 * Enqueue a managed delivery run.
 *
 * Timing by reason (see docs/MARKETING-PACKAGES.md):
 * - signup / onboarding / service_level / manual: eligibleAt = anchor+6h, dueAt = anchor+24h
 * - package_change: eligibleAt = now (no 6h delay), dueAt = now+24h
 */
export async function enqueueManagedDeliveryForCompany(args: {
  tenantId: string;
  companyId: string;
  onboardingCompletedAt: string;
  serviceLevel?: ManagedServiceLevel;
  reason?: ManagedDeliveryEnqueueReason;
}): Promise<ManagedDeliveryRun> {
  const company = await getCompany(args.companyId);
  const level =
    args.serviceLevel ??
    company?.profile.managedService?.serviceLevel ??
    defaultServiceLevel();
  const reason: ManagedDeliveryEnqueueReason = args.reason ?? "signup";
  const t = now();
  const strategyEligibleAt =
    reason === "package_change"
      ? t
      : addHours(args.onboardingCompletedAt, STRATEGY_ELIGIBLE_HOURS);
  const strategyDueAt =
    reason === "package_change"
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
      const goal = goalFromProfile(company);
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

      // Draft schedules from the builder are proposal rows only — not live posts.
      const strategyCompletedAt = now();
      const assumptions = [
        ...run.assumptions,
        `Package: ${pkg.name} · channels=${channels.join(",") || "default"} · ~${pkg.postsPerMonth}/mo`,
      ];
      run = await advancePhase(run, {
        phase: "calendar",
        campaignId: exec.campaign.id,
        strategyCompletedAt,
        strategyVersion: run.strategyVersion + 1,
        assumptions,
        statusMessageKey: "strategy_ready",
      });
      await patchCompanyManaged(company, {
        strategyCompletedAt,
        lastDeliveryRunId: run.id,
      });
      await logAction(actor, "managed_delivery.strategy_drafted", {
        targetType: "managed_delivery_run",
        targetId: run.id,
        companyId: company.id,
        detail: `campaign=${exec.campaign.id} drafts=${exec.spawnedContentIds.length} package=${pkg.id}`,
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
        routedClient > 0
          ? "content_ready"
          : drafts.length > 0
            ? "approval_required"
            : "approval_required";

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
    await processManagedDeliveryRun(run.id, actor);
    processed += 1;
  }

  // awaiting_approval is not in listOpenManagedDeliveryRuns — promote separately.
  const awaiting = (await listManagedDeliveryRuns(tenantId))
    .filter((r) => r.phase === "awaiting_approval")
    .sort((a, b) => a.strategyDueAt.localeCompare(b.strategyDueAt))
    .slice(0, MAX_PROMOTIONS_PER_TICK);
  for (const run of awaiting) {
    const before = run.phase;
    const after = await maybePromoteManagedDeliveryToActive(run.id, actor);
    if (after && after.phase !== before) processed += 1;
  }

  return processed;
}

/** Test helper — list all runs for a tenant (including terminal). */
export async function listManagedDeliveryRunsForTenant(
  tenantId: string,
): Promise<ManagedDeliveryRun[]> {
  return listManagedDeliveryRuns(tenantId);
}
