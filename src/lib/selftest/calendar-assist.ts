// Self-test helpers for M22 calendar assist.

import {
  createCalendarAssistSuggestion,
  getCalendarAssistSuggestion,
  getContent,
  listAiRuns,
  listScheduledPosts,
} from "@/lib/db";
import { listAudit } from "@/lib/audit";
import {
  acceptCalendarAssistSuggestion,
  assistAcceptedContentNotScheduled,
  buildAdAlignmentDrafts,
  buildCalendarAssistDrafts,
  dismissCalendarAssistSuggestion,
} from "@/lib/ai/calendar-assist";
import type { AdCampaign, Company, User } from "@/lib/types";

export function stubCalendarAssistCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_calast_stub",
    tenantId: "tn_calast_stub",
    name: "Riverside Cafe",
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      industry: "cafe",
      serviceAreas: ["Riverside"],
      services: ["Breakfast"],
      callsToAction: ["Book a table"],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
      targetCustomers: "local brunch crowd",
    },
    documents: [],
    ...overrides,
  } as Company;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkBuildCalendarAssistDrafts(): Promise<{ ok: boolean; detail: string }> {
  const company = stubCalendarAssistCompany();
  const today = todayIso();
  const drafts = buildCalendarAssistDrafts({
    company,
    todayIso: today,
    posts: [],
    windows: [],
  });
  const ok = drafts.length >= 1 && drafts.every((d) => d.brief.length > 10 && d.platform.length > 0);
  return { ok, detail: `drafts=${drafts.length} kinds=${drafts.map((d) => d.kind).join(",")}` };
}

export function checkBuildAdAlignmentDrafts(): { ok: boolean; detail: string } {
  const company = stubCalendarAssistCompany({ id: "co_ad_align" });
  const today = todayIso();
  const ad: AdCampaign = {
    id: "adc_test",
    companyId: company.id,
    adAccountId: "ad_test",
    platform: "meta_ads",
    name: "Weekend Brunch Push",
    objective: "leads",
    dailyBudgetUsd: 25,
    status: "active",
    startDate: today,
    createdById: "u_stub",
    createdAt: today,
    updatedAt: today,
  };
  const drafts = buildAdAlignmentDrafts({
    company,
    ads: [ad],
    todayIso: today,
    windows: [],
  });
  const ok =
    drafts.length >= 1 &&
    drafts.every((d) => d.kind === "ad_alignment" && /Weekend Brunch/i.test(d.title));
  return { ok, detail: `adAlignment=${drafts.length} titles=${drafts.map((d) => d.title).join(" | ")}` };
}

export async function checkAcceptCreatesDraftOnly(
  companyId: string,
  userId: string,
  tenantId: string,
): Promise<{ ok: boolean; detail: string }> {
  const today = todayIso();
  const suggestion = await createCalendarAssistSuggestion({
    tenantId,
    companyId,
    kind: "calendar_gap",
    title: "Self-test gap",
    brief: "Fixture suggestion for accept governance.",
    proposedDate: today,
    platform: "Facebook",
    requestType: "social_post",
    evidence: [{ signal: "calendar_gap", observed: "0/2 in 14d" }],
    priority: 85,
    status: "open",
    createdById: userId,
  });

  const user = { id: userId, email: "selftest@example.com", tenantId } as User;
  const contentId = await acceptCalendarAssistSuggestion(suggestion, user);
  const content = await getContent(contentId);
  const updated = await getCalendarAssistSuggestion(suggestion.id);
  const notScheduled = await assistAcceptedContentNotScheduled(tenantId, contentId);
  const scheduled = await listScheduledPosts(tenantId);

  const ok =
    content?.status === "ai_draft" &&
    updated?.status === "accepted" &&
    updated.resultContentId === contentId &&
    notScheduled &&
    !scheduled.some((p) => p.contentId === contentId);
  return {
    ok,
    detail: `status=${content?.status} accepted=${updated?.status} notScheduled=${notScheduled}`,
  };
}

export async function checkDismissAudited(
  companyId: string,
  userId: string,
  tenantId: string,
): Promise<{ ok: boolean; detail: string }> {
  const today = todayIso();
  const suggestion = await createCalendarAssistSuggestion({
    tenantId,
    companyId,
    kind: "seasonal_prompt",
    title: "Self-test dismiss",
    brief: "Fixture for dismiss audit.",
    proposedDate: today,
    platform: "Instagram",
    requestType: "social_post",
    evidence: [{ signal: "seasonal_prompt", observed: "test" }],
    priority: 70,
    status: "open",
    createdById: userId,
  });

  const user = { id: userId, email: "selftest@example.com", tenantId };
  const reason = "Not this month";
  await dismissCalendarAssistSuggestion(suggestion, user, reason);

  const updated = await getCalendarAssistSuggestion(suggestion.id);
  const audit = await listAudit(tenantId, [companyId]);
  const dismissedAudit = audit.some(
    (e) => e.action === "calendar_assist.dismissed" && e.targetId === suggestion.id,
  );
  const aiRuns = await listAiRuns(tenantId, [companyId]);
  const dismissRun = aiRuns.some((r) => r.kind === "calendar_assist_dismiss");

  const ok =
    updated?.status === "dismissed" &&
    updated.dismissReason === reason &&
    dismissedAudit &&
    dismissRun;
  return {
    ok,
    detail: `status=${updated?.status} audit=${dismissedAudit} aiRun=${dismissRun}`,
  };
}
