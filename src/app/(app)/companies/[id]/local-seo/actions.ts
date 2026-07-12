"use server";

import { revalidatePath } from "next/cache";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { getCompany } from "@/lib/db";
import { buildLocalSeoQaDrafts, spawnLocalSeoQaDraft } from "@/lib/local-seo";

export async function spawnLocalSeoQaDraftAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "").trim();
  const draftId = String(formData.get("draftId") || "").trim();
  if (!companyId || !draftId) throw new Error("Missing company or draft id");

  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  const drafts = buildLocalSeoQaDrafts(company);
  const draft = drafts.find((d) => d.id === draftId);
  if (!draft) throw new Error("Draft spec not found");

  const content = await spawnLocalSeoQaDraft({
    company,
    draft,
    userId: user.id,
  });

  await logAction(user, "content.ai_drafted", {
    targetType: "content",
    targetId: content.id,
    companyId: company.id,
    detail: `local-seo-qa:${draftId}`,
  });

  revalidatePath(`/companies/${companyId}/local-seo`);
  revalidatePath("/content");
  revalidatePath("/studio");
}
