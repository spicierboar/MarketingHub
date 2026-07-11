// Managed delivery runner — post-onboarding strategy + calendar + draft content.
//
// HARD RULES:
//   • Creates draft campaigns / ai_draft content / calendar SUGGESTIONS only
//   • NEVER calls scheduleOne, publishDuePosts, or any go-live path
//   • Critique gate and approval policies remain the only publish path

import { logAction } from "@/lib/audit";
import { executeCampaignBuilder } from "@/lib/campaign-builder";
import {
  getCompany,
  getManagedDeliveryRun,
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
import { applyQualityRoutingAfterDraft } from "@/lib/managed-service/quality-routing";
import { now } from "@/lib/utils";
import type {
  ActingUser,
  Company,
  ManagedDeliveryPhase,
  ManagedDeliveryRun,
  ManagedServiceLevel,
  ManagedServiceSettings,
} from "@/lib/types";

const MAX_RUNS_PER_TICK = 5;

const IN_PROGRESS: ReadonlySet<ManagedDeliveryPhase> = new Set([
  "queued",
  "validating",
  "analysing",
  "strategy",
  "calendar",
  "content",
]);

function addHours(iso: string, hours: number): string {
  return new Date(new Date(iso).getTime() + hours * 3_600_000).toISOString();
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

export async function enqueueManagedDeliveryForCompany(args: {
  tenantId: string;
  companyId: string;
  onboardingCompletedAt: string;
  serviceLevel?: ManagedServiceLevel;
}): Promise<ManagedDeliveryRun> {
  const company = await getCompany(args.companyId);
  const level =
    args.serviceLevel ??
    company?.profile.managedService?.serviceLevel ??
    defaultServiceLevel();
  const strategyDueAt = addHours(args.onboardingCompletedAt, 24);
  const t = now();

  const run = await createManagedDeliveryRun({
    tenantId: args.tenantId,
    companyId: args.companyId,
    phase: "queued",
    serviceLevel: level,
    onboardingCompletedAt: args.onboardingCompletedAt,
    strategyDueAt,
    strategyStartedAt: null,
    strategyCompletedAt: null,
    calendarCompletedAt: null,
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
    await patchCompanyManaged(company, {
      serviceLevel: level,
      strategyDueAt,
      lastDeliveryRunId: run.id,
    });
  }

  return run;
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

export async function processManagedDeliveryRun(
  runId: string,
  actor: ActingUser,
): Promise<ManagedDeliveryRun | undefined> {
  let run = await getManagedDeliveryRun(runId);
  if (!run) return undefined;
  if (run.phase === "awaiting_approval" || run.phase === "active") return run;
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

      const startDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      const goal = goalFromProfile(company);
      const exec = await executeCampaignBuilder({
        input: {
          company,
          goal,
          audience: company.profile.targetCustomers,
          channels: [],
          durationDays: 30,
          startDate,
          offer: null,
        },
        userId: actor.id,
        audience: company.profile.targetCustomers,
        durationDays: 30,
        channels: [],
        offer: null,
      });

      // Draft schedules from the builder are proposal rows only — not live posts.
      const strategyCompletedAt = now();
      run = await advancePhase(run, {
        phase: "calendar",
        campaignId: exec.campaign.id,
        strategyCompletedAt,
        strategyVersion: run.strategyVersion + 1,
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
        detail: `campaign=${exec.campaign.id} drafts=${exec.spawnedContentIds.length}`,
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
  const open = await listOpenManagedDeliveryRuns(tenantId);
  const due = open
    .filter((r) => IN_PROGRESS.has(r.phase))
    .sort((a, b) => a.strategyDueAt.localeCompare(b.strategyDueAt))
    .slice(0, MAX_RUNS_PER_TICK);

  let processed = 0;
  for (const run of due) {
    await processManagedDeliveryRun(run.id, actor);
    processed += 1;
  }
  return processed;
}

/** Test helper — list all runs for a tenant (including terminal). */
export async function listManagedDeliveryRunsForTenant(
  tenantId: string,
): Promise<ManagedDeliveryRun[]> {
  return listManagedDeliveryRuns(tenantId);
}
