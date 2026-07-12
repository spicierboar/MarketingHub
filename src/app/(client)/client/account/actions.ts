"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePortalUser } from "@/lib/auth/rbac";
import {
  requestClientCustomWork,
  requestClientPromo,
} from "@/lib/promo-requests";
import { resolveCustomWorkFeeAud } from "@/lib/promo-allowance";
import { getCompany, getTenant } from "@/lib/db";

/** One-tap ready-made promo from Account — template defaults, no DIY packaging. */
export async function requestExtraPromoAction(formData: FormData) {
  const { user, companyId } = await requirePortalUser();
  const templateId = String(formData.get("templateId") || "").trim();
  if (!templateId) throw new Error("Choose a promotion");
  const notes = String(formData.get("notes") || "").trim() || undefined;

  const result = await requestClientPromo({
    companyId,
    user,
    templateId,
    notes,
    // Automation-first: dates, channels, price from template.
  });

  revalidatePath("/client");
  revalidatePath("/client/account");
  revalidatePath("/client/requests");
  revalidatePath("/client/approvals");
  revalidatePath("/client/calendar");
  revalidatePath("/client/promos");
  revalidatePath("/campaigns");
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/requests");

  redirect(`/client/requests/${result.requestId}`);
}

/** Plain-language custom work ask + optional AI draft kick. */
export async function requestCustomWorkAction(formData: FormData) {
  const { user, companyId } = await requirePortalUser();
  const topic = String(formData.get("topic") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  if (!notes) throw new Error("A short description is required");

  const company = await getCompany(companyId);
  const tenant = company ? await getTenant(company.tenantId) : null;
  const fee = company ? resolveCustomWorkFeeAud(company, tenant) : null;

  const result = await requestClientCustomWork({
    companyId,
    user,
    topic:
      topic ||
      notes.slice(0, 80).replace(/\s+/g, " ") ||
      "Custom work request",
    notes,
    expectedFeeAud: fee,
    kickAiDraft: true,
  });

  revalidatePath("/client");
  revalidatePath("/client/account");
  revalidatePath("/client/requests");
  revalidatePath("/client/approvals");
  revalidatePath("/requests");

  redirect(`/client/requests/${result.requestId}`);
}
