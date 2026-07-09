// Self-test helpers for V1 agency ops (Module 12).

import {
  agencyTemplateInput,
  buildWorkloadSummary,
  DEFAULT_OVERDUE_APPROVAL_DAYS,
  detectOverdueApprovalAlerts,
  isApprovalOverdue,
  templateToRequestParams,
} from "@/lib/agency-ops";
import { computeCompanyHealthScore } from "@/lib/health-scores";
import { stubHealthCompany } from "@/lib/selftest/health-scores";
import type { ContentItem, MarketingRequest } from "@/lib/types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function stubContent(
  overrides: Partial<ContentItem> & Pick<ContentItem, "id" | "companyId" | "title">,
): ContentItem {
  const today = todayIso();
  return {
    type: "social_post",
    body: "Test body",
    status: "pending_approval",
    createdById: "u_stub",
    createdAt: today,
    updatedAt: addDays(today, -5),
    versions: [],
    ...overrides,
  } as ContentItem;
}

export async function checkOverdueApprovalDetected(): Promise<{ ok: boolean; detail: string }> {
  const today = todayIso();
  const staleUpdated = addDays(today, -(DEFAULT_OVERDUE_APPROVAL_DAYS + 2));
  const freshUpdated = addDays(today, -1);
  const stale = stubContent({
    id: "cnt_overdue",
    companyId: "co_a",
    title: "Winter promo",
    updatedAt: staleUpdated,
  });
  const fresh = stubContent({
    id: "cnt_fresh",
    companyId: "co_a",
    title: "Summer promo",
    updatedAt: freshUpdated,
  });

  const overdueOnly = isApprovalOverdue(stale, today) && !isApprovalOverdue(fresh, today);
  const alerts = detectOverdueApprovalAlerts({
    content: [stale, fresh],
    companiesById: new Map([["co_a", { id: "co_a", name: "Alpha Co" }]]),
    todayIso: today,
  });
  const ok = overdueOnly && alerts.length === 1 && alerts[0]?.kind === "overdue_approval";
  return {
    ok,
    detail: `overdueOnly=${overdueOnly} alerts=${alerts.length}`,
  };
}

export async function checkWorkloadSummaryTotals(): Promise<{ ok: boolean; detail: string }> {
  const today = todayIso();
  const company = stubHealthCompany({ id: "co_work", name: "Workload Test Co" });
  const health = computeCompanyHealthScore({
    company,
    todayIso: today,
    posts: [],
    content: [
      { companyId: company.id, status: "pending_approval" },
      { companyId: company.id, status: "pending_approval" },
    ],
    campaigns: [],
    leads: [],
  });
  const content: ContentItem[] = [
    stubContent({
      id: "cnt_w1",
      companyId: company.id,
      title: "Post A",
      updatedAt: addDays(today, -6),
    }),
    stubContent({
      id: "cnt_w2",
      companyId: company.id,
      title: "Post B",
      updatedAt: addDays(today, -1),
    }),
  ];
  const requests: MarketingRequest[] = [
    {
      id: "req_open",
      companyId: company.id,
      requesterId: "u_stub",
      requestType: "social_post",
      objective: "Drive bookings",
      topic: "Open request",
      urgency: "normal",
      consent: {
        customerNamed: false,
        customerInPhotos: false,
        consentObtained: false,
        mentionsPricing: false,
        mentionsOffer: false,
        performanceClaims: false,
      },
      uploads: [],
      status: "submitted",
      statusHistory: [],
      createdAt: today,
      updatedAt: today,
    },
  ];

  const summary = buildWorkloadSummary({
    companies: [{ id: company.id, name: company.name }],
    content,
    requests,
    healthScores: [health],
    todayIso: today,
  });

  const row = summary.byCompany[0];
  const ok =
    summary.pendingApprovals === 2 &&
    summary.overdueApprovals === 1 &&
    summary.openRequests === 1 &&
    row?.pendingApprovals === 2 &&
    row?.overdueApprovals === 1;
  return {
    ok,
    detail: `pending=${summary.pendingApprovals} overdue=${summary.overdueApprovals} openReq=${summary.openRequests}`,
  };
}

export async function checkTemplateApplyPrefill(): Promise<{ ok: boolean; detail: string }> {
  const input = agencyTemplateInput({
    tenantId: "tn_stub",
    createdById: "u_stub",
    name: "Monthly newsletter",
    contentType: "email_newsletter",
    topic: "March member update",
    objective: "Re-engage past clients with approved offers only",
    audience: "Lapsed members",
    channel: "Email",
  });
  const params = templateToRequestParams(input, "co_target", "pt_stub");
  const ok =
    params.get("company") === "co_target" &&
    params.get("type") === "email_newsletter" &&
    params.get("topic") === "March member update" &&
    params.get("objective")?.includes("Re-engage") &&
    params.get("audience") === "Lapsed members" &&
    params.get("platform") === "Email" &&
    params.get("template") === "pt_stub";
  return {
    ok: !!ok,
    detail: params.toString(),
  };
}
