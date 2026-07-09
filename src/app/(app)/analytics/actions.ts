"use server";

import { revalidatePath } from "next/cache";
import { createUtmLink, getCompany, getTenant, logAiRun } from "@/lib/db";
import { requireAdmin, assertCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { buildReport } from "@/lib/analytics";
import { summariseReport } from "@/lib/ai/summary";
import { assertAiBudget } from "@/lib/ai/budget";
import { assertAiRateLimit } from "@/lib/ratelimit";
import { buildUtmUrl } from "@/lib/utm";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

// AI management summary (§41). Tenant-wide (admin only). Returned to the client
// component via useActionState; the run is logged in the AI Control Centre.
export async function generateSummaryAction(_prev: unknown, _formData: FormData) {
  const user = await requireAdmin();
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);
  const report = await buildReport(user.tenantId);
  const tenant = await getTenant(user.tenantId);
  const { text: summary, model } = await summariseReport(report, tenant?.name ?? "your organisation");
  await logAiRun({
    tenantId: user.tenantId,
    userId: user.id,
    kind: "management_summary",
    model,
    promptSummary: "Group performance summary",
    outputChars: summary.length,
    sourcesUsed: ["Analytics report"],
    estCostUsd: model.startsWith("claude")
      ? Number(((summary.length / 4 / 1e6) * 15).toFixed(4))
      : 0,
  });
  await logAction(user, "analytics.summary_generated", { detail: model });
  return { text: summary, model };
}

// UTM builder (§42). Admin builds a trackable link for one of their companies.
export async function createUtmLinkAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  // Admin-only page, but assert company access defensively.
  await requireAdmin();
  const user = await assertCompanyAccess(companyId);
  const destinationUrl = text(formData, "destinationUrl");
  if (!destinationUrl) throw new Error("Destination URL is required");

  const link = await createUtmLink({
    companyId,
    destinationUrl,
    source: text(formData, "source") || "facebook",
    medium: text(formData, "medium") || "social",
    campaign: text(formData, "campaign") || "general",
    contentType: text(formData, "contentType") || undefined,
    campaignId: null,
    contentId: null,
    requestId: text(formData, "requestId") || null,
    createdById: user.id,
  });
  await logAction(user, "utm.created", {
    targetType: "utm_link",
    targetId: link.id,
    companyId,
    detail: `${(await getCompany(companyId))?.name}: ${buildUtmUrl(link)}`,
  });
  revalidatePath("/analytics/utm");
}
