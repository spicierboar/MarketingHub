"use server";

import { revalidatePath } from "next/cache";
import { requirePortalUser } from "@/lib/auth/rbac";
import { requestClientPromo } from "@/lib/promo-requests";

export async function requestPromoAction(formData: FormData) {
  const { user, companyId } = await requirePortalUser();
  const templateId = String(formData.get("templateId") || "").trim();
  const startDate = String(formData.get("startDate") || "").trim();
  const endDate = String(formData.get("endDate") || "").trim() || undefined;
  const budgetUsd = Number(formData.get("budgetUsd") || 0);
  const notes = String(formData.get("notes") || "").trim() || undefined;
  const channels = formData
    .getAll("channels")
    .map((v) => String(v).trim())
    .filter(Boolean);

  await requestClientPromo({
    companyId,
    user,
    templateId,
    startDate,
    endDate,
    budgetUsd,
    channels,
    notes,
  });

  revalidatePath("/client");
  revalidatePath("/client/calendar");
  revalidatePath("/client/promos");
  revalidatePath("/campaigns");
  revalidatePath(`/companies/${companyId}`);
}
