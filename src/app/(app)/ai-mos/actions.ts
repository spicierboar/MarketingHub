"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAiMosOpportunity } from "@/lib/db";
import { assertCompanyAccess, requireUser } from "@/lib/auth/rbac";
import {
  convertOpportunityToDraft,
  dismissOpportunity,
  surfaceTenantOpportunities,
} from "@/lib/ai-mos";
import { logAction } from "@/lib/audit";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

export async function scanAiMosAction(formData: FormData) {
  const user = await requireUser();
  const companyId = text(formData, "companyId");
  const created = await surfaceTenantOpportunities(
    user.tenantId,
    user.id,
    companyId ? { companyIds: [companyId] } : undefined,
  );
  await logAction(user, "ai_mos.scanned", {
    companyId: companyId || undefined,
    detail: `${created} opportunity card(s) surfaced`,
  });
  revalidatePath("/ai-mos");
  revalidatePath("/dashboard");
}

export async function acceptAiMosOpportunityAction(formData: FormData) {
  const oppId = text(formData, "oppId");
  const opp = await getAiMosOpportunity(oppId);
  if (!opp) throw new Error("Opportunity not found");
  const user = await assertCompanyAccess(opp.companyId);
  if (opp.status !== "open") throw new Error("Opportunity is no longer open");

  const result = await convertOpportunityToDraft(opp, user);

  revalidatePath("/ai-mos");
  revalidatePath("/dashboard");
  revalidatePath("/campaigns");
  revalidatePath("/content");

  if (result.resultType === "campaign") {
    redirect(`/campaigns/${result.resultId}`);
  }

  const action = opp.suggestedAction;
  const p = new URLSearchParams({
    company: opp.companyId,
    type: action.requestType ?? "social_post",
    topic: action.topic ?? opp.title,
    objective: action.objective ?? opp.diagnosis,
    aimos: oppId,
  });
  redirect(`/requests/new?${p.toString()}`);
}

export async function dismissAiMosOpportunityAction(formData: FormData) {
  const oppId = text(formData, "oppId");
  const dismissReason = text(formData, "dismissReason");
  const opp = await getAiMosOpportunity(oppId);
  if (!opp) throw new Error("Opportunity not found");
  const user = await assertCompanyAccess(opp.companyId);
  if (opp.status !== "open") throw new Error("Opportunity is no longer open");

  await dismissOpportunity(opp, user, dismissReason || undefined);
  revalidatePath("/ai-mos");
  revalidatePath("/dashboard");
}
