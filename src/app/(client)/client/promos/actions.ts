"use server";

import { revalidatePath } from "next/cache";
import { requirePortalUser } from "@/lib/auth/rbac";
import { requestClientPromo } from "@/lib/promo-requests";

/** Legacy DIY form on /client/promos — still accepted; Account one-tap preferred. */
export async function requestPromoAction(formData: FormData) {
  const { user, companyId } = await requirePortalUser();
  const templateId = String(formData.get("templateId") || "").trim();
  const startDate = String(formData.get("startDate") || "").trim() || undefined;
  const endDate = String(formData.get("endDate") || "").trim() || undefined;
  const budgetRaw = formData.get("budgetUsd");
  const budgetUsd =
    budgetRaw != null && String(budgetRaw).trim() !== ""
      ? Number(budgetRaw)
      : undefined;
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
    channels: channels.length > 0 ? channels : undefined,
    notes,
  });

  revalidatePath("/client");
  revalidatePath("/client/account");
  revalidatePath("/client/calendar");
  revalidatePath("/client/promos");
  revalidatePath("/client/requests");
  revalidatePath("/campaigns");
  revalidatePath(`/companies/${companyId}`);
}
