// V1 module 12 — agency ops slice (Phase 15).
//
// Overdue-approval alerts, portfolio workload summary, and reusable tenant-wide
// content templates (stored in existing prompt_templates — no migration).
// Wires health-scores companiesNeedingAttention + approval backlog from repos.

import {
  listCompanies,
  listContent,
  listPromptTemplates,
  listRequests,
  getTenant,
} from "@/lib/db";
import {
  buildTenantHealthScores,
  companiesNeedingAttention,
  DEFAULT_ATTENTION_THRESHOLD,
  type CompanyHealthScore,
} from "@/lib/health-scores";
import { resolveQueueClock } from "@/lib/tenant-timezone";
import type { ContentItem, MarketingRequest, PromptTemplate, RequestType } from "@/lib/types";

// ---- constants ---------------------------------------------------------------

/** Days in pending_approval before surfacing an overdue alert. */
export const DEFAULT_OVERDUE_APPROVAL_DAYS = 3;

/** Days awaiting client sign-off before surfacing an overdue alert. */
export const DEFAULT_OVERDUE_CLIENT_REVIEW_DAYS = 5;

// ---- types -------------------------------------------------------------------

export type AgencyAlertKind =
  | "overdue_approval"
  | "overdue_client_review"
  | "health_attention";

export type AgencyAlertSeverity = "warning" | "danger";

export interface AgencyAlert {
  id: string;
  kind: AgencyAlertKind;
  severity: AgencyAlertSeverity;
  companyId: string;
  companyName: string;
  title: string;
  detail: string;
  href: string;
  daysOverdue: number;
}

export interface AgencyCompanyWorkload {
  companyId: string;
  companyName: string;
  pendingApprovals: number;
  overdueApprovals: number;
  pendingClientReviews: number;
  openRequests: number;
  healthScore?: number;
  needsAttention: boolean;
}

export interface AgencyWorkloadSummary {
  pendingApprovals: number;
  overdueApprovals: number;
  pendingClientReviews: number;
  openRequests: number;
  clientsNeedingAttention: number;
  byCompany: AgencyCompanyWorkload[];
}

export interface AgencyOpsBundle {
  alerts: AgencyAlert[];
  workload: AgencyWorkloadSummary;
  templates: PromptTemplate[];
  needsAttention: CompanyHealthScore[];
  computedAt: string;
}

/** Tenant-wide reusable brief — backed by prompt_templates (companyId null). */
export type AgencyContentTemplate = PromptTemplate;

// ---- date helpers ------------------------------------------------------------

function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso.slice(0, 10) + "T12:00:00Z").getTime();
  const end = new Date(endIso.slice(0, 10) + "T12:00:00Z").getTime();
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

// ---- pure detectors (testable) -----------------------------------------------

export function isApprovalOverdue(
  content: Pick<ContentItem, "status" | "updatedAt">,
  todayIso: string,
  thresholdDays = DEFAULT_OVERDUE_APPROVAL_DAYS,
): boolean {
  if (content.status !== "pending_approval") return false;
  return daysBetween(content.updatedAt, todayIso) >= thresholdDays;
}

export function isClientReviewOverdue(
  content: Pick<ContentItem, "clientReview">,
  todayIso: string,
  thresholdDays = DEFAULT_OVERDUE_CLIENT_REVIEW_DAYS,
): boolean {
  const review = content.clientReview;
  if (!review || review.status !== "pending") return false;
  return daysBetween(review.sharedAt, todayIso) >= thresholdDays;
}

export function detectOverdueApprovalAlerts(args: {
  content: ContentItem[];
  companiesById: Map<string, { id: string; name: string }>;
  todayIso: string;
  thresholdDays?: number;
}): AgencyAlert[] {
  const { content, companiesById, todayIso, thresholdDays = DEFAULT_OVERDUE_APPROVAL_DAYS } = args;
  const alerts: AgencyAlert[] = [];

  for (const item of content) {
    const company = companiesById.get(item.companyId);
    if (!company) continue;

    if (isApprovalOverdue(item, todayIso, thresholdDays)) {
      const daysOverdue = daysBetween(item.updatedAt, todayIso) - thresholdDays + 1;
      alerts.push({
        id: `overdue-approval:${item.id}`,
        kind: "overdue_approval",
        severity: daysOverdue >= 4 ? "danger" : "warning",
        companyId: company.id,
        companyName: company.name,
        title: item.title,
        detail: `Awaiting approval for ${daysBetween(item.updatedAt, todayIso)} day(s) — unblock to keep publishing on track.`,
        href: `/content/${item.id}`,
        daysOverdue,
      });
    }

    if (isClientReviewOverdue(item, todayIso)) {
      const sharedAt = item.clientReview!.sharedAt;
      const waiting = daysBetween(sharedAt, todayIso);
      const daysOverdue = waiting - DEFAULT_OVERDUE_CLIENT_REVIEW_DAYS + 1;
      alerts.push({
        id: `overdue-client-review:${item.id}`,
        kind: "overdue_client_review",
        severity: daysOverdue >= 3 ? "danger" : "warning",
        companyId: company.id,
        companyName: company.name,
        title: item.title,
        detail: `Client sign-off pending for ${waiting} day(s) (${item.clientReview!.email}).`,
        href: `/content/${item.id}`,
        daysOverdue,
      });
    }
  }

  return alerts.sort(
    (a, b) => b.daysOverdue - a.daysOverdue || a.companyName.localeCompare(b.companyName),
  );
}

export function buildWorkloadSummary(args: {
  companies: { id: string; name: string }[];
  content: ContentItem[];
  requests: MarketingRequest[];
  healthScores: CompanyHealthScore[];
  todayIso: string;
  attentionThreshold?: number;
}): AgencyWorkloadSummary {
  const {
    companies,
    content,
    requests,
    healthScores,
    todayIso,
    attentionThreshold = DEFAULT_ATTENTION_THRESHOLD,
  } = args;

  const healthByCompany = new Map(healthScores.map((h) => [h.companyId, h]));
  const openStatuses = new Set([
    "submitted",
    "needs_more_information",
    "ai_drafting",
    "draft_ready",
    "pending_approval",
    "changes_required",
    "approved",
    "scheduled",
  ]);

  const byCompany: AgencyCompanyWorkload[] = companies.map((company) => {
    const companyContent = content.filter((c) => c.companyId === company.id);
    const pendingApprovals = companyContent.filter((c) => c.status === "pending_approval").length;
    const overdueApprovals = companyContent.filter((c) =>
      isApprovalOverdue(c, todayIso),
    ).length;
    const pendingClientReviews = companyContent.filter(
      (c) => c.clientReview?.status === "pending",
    ).length;
    const openRequests = requests.filter(
      (r) => r.companyId === company.id && openStatuses.has(r.status),
    ).length;
    const health = healthByCompany.get(company.id);

    return {
      companyId: company.id,
      companyName: company.name,
      pendingApprovals,
      overdueApprovals,
      pendingClientReviews,
      openRequests,
      healthScore: health?.score,
      needsAttention: (health?.score ?? 100) < attentionThreshold,
    };
  });

  return {
    pendingApprovals: byCompany.reduce((s, c) => s + c.pendingApprovals, 0),
    overdueApprovals: byCompany.reduce((s, c) => s + c.overdueApprovals, 0),
    pendingClientReviews: byCompany.reduce((s, c) => s + c.pendingClientReviews, 0),
    openRequests: byCompany.reduce((s, c) => s + c.openRequests, 0),
    clientsNeedingAttention: byCompany.filter((c) => c.needsAttention).length,
    byCompany: byCompany.sort(
      (a, b) =>
        b.overdueApprovals - a.overdueApprovals ||
        b.pendingApprovals - a.pendingApprovals ||
        a.companyName.localeCompare(b.companyName),
    ),
  };
}

export function healthAttentionAlerts(
  scores: CompanyHealthScore[],
  opts?: { limit?: number },
): AgencyAlert[] {
  const attention = companiesNeedingAttention(scores, opts);
  return attention.map((h) => {
    const backlog = h.factors.find((f) => f.id === "approval_backlog");
    const detail =
      backlog && backlog.score < 70
        ? backlog.evidence
        : `Marketing health score ${h.score}/100 — review publishing, paid, and lead signals.`;
    return {
      id: `health-attention:${h.companyId}`,
      kind: "health_attention",
      severity: h.score < 45 ? "danger" : "warning",
      companyId: h.companyId,
      companyName: h.companyName,
      title: `${h.companyName} needs attention`,
      detail,
      href: `/companies/${h.companyId}`,
      daysOverdue: Math.max(1, DEFAULT_ATTENTION_THRESHOLD - h.score),
    };
  });
}

export function mergeAgencyAlerts(
  overdue: AgencyAlert[],
  health: AgencyAlert[],
  opts?: { limit?: number },
): AgencyAlert[] {
  const merged = [...overdue, ...health].sort(
    (a, b) =>
      (b.severity === "danger" ? 1 : 0) - (a.severity === "danger" ? 1 : 0) ||
      b.daysOverdue - a.daysOverdue ||
      a.companyName.localeCompare(b.companyName),
  );
  return opts?.limit ? merged.slice(0, opts.limit) : merged;
}

// ---- templates -------------------------------------------------------------

/** Tenant-wide agency templates only (not platform library or per-company studio saves). */
export function filterAgencyContentTemplates(
  templates: PromptTemplate[],
  tenantId: string,
): AgencyContentTemplate[] {
  return templates.filter((t) => t.active && t.tenantId === tenantId && t.companyId === null);
}

export function templateToRequestParams(
  template: Pick<
    AgencyContentTemplate,
    "contentType" | "topic" | "objective" | "audience" | "channel"
  >,
  companyId: string,
  templateId?: string,
): URLSearchParams {
  const p = new URLSearchParams({
    company: companyId,
    type: template.contentType,
    topic: template.topic,
    objective: template.objective,
  });
  if (template.audience) p.set("audience", template.audience);
  if (template.channel) p.set("platform", template.channel);
  if (templateId) p.set("template", templateId);
  return p;
}

export function agencyTemplateInput(args: {
  tenantId: string;
  createdById: string;
  name: string;
  contentType: RequestType;
  topic: string;
  objective: string;
  audience?: string;
  channel?: string;
}): Omit<AgencyContentTemplate, "id" | "createdAt"> {
  return {
    tenantId: args.tenantId,
    companyId: null,
    name: args.name,
    contentType: args.contentType,
    topic: args.topic,
    objective: args.objective,
    audience: args.audience,
    channel: args.channel,
    tone: "brand_default",
    active: true,
    createdById: args.createdById,
  };
}

// ---- tenant loader -----------------------------------------------------------

export async function buildAgencyOpsBundle(
  tenantId: string,
  opts?: { alertLimit?: number; attentionLimit?: number },
): Promise<AgencyOpsBundle> {
  const tenant = await getTenant(tenantId);
  const clock = resolveQueueClock(tenant);
  const [companies, content, requests, templates, healthScores] = await Promise.all([
    listCompanies(tenantId),
    listContent(tenantId),
    listRequests(tenantId),
    listPromptTemplates(tenantId),
    buildTenantHealthScores(tenantId),
  ]);

  const companiesById = new Map(companies.map((c) => [c.id, c]));
  const needsAttention = companiesNeedingAttention(healthScores, {
    limit: opts?.attentionLimit ?? 6,
  });
  const overdueAlerts = detectOverdueApprovalAlerts({
    content,
    companiesById,
    todayIso: clock.today,
  });
  const alerts = mergeAgencyAlerts(
    overdueAlerts,
    healthAttentionAlerts(needsAttention),
    { limit: opts?.alertLimit ?? 12 },
  );
  const workload = buildWorkloadSummary({
    companies,
    content,
    requests,
    healthScores,
    todayIso: clock.today,
  });

  return {
    alerts,
    workload,
    templates: filterAgencyContentTemplates(templates, tenantId),
    needsAttention,
    computedAt: new Date().toISOString(),
  };
}

/** Convenience export for dashboards that only need templates. */
export async function listAgencyContentTemplates(tenantId: string): Promise<AgencyContentTemplate[]> {
  return filterAgencyContentTemplates(await listPromptTemplates(tenantId), tenantId);
}
