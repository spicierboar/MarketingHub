"use server";

import { revalidatePath } from "next/cache";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { getCompany, updateCompany } from "@/lib/db";
import { markPromoOnCalendar } from "@/lib/promo-requests";
import { logAction } from "@/lib/audit";

export async function markPromoOnCalendarAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "").trim();
  const selectionId = String(formData.get("selectionId") || "").trim();
  const user = await assertAdminCompanyAccess(companyId);
  await markPromoOnCalendar({ companyId, selectionId, user });
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/client");
  revalidatePath("/client/calendar");
  revalidatePath("/client/promos");
}

export async function savePromoMarkupAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "").trim();
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  const pct = Number(formData.get("promoMarkupPercent") || 15);
  const markupPercent = Math.min(100, Math.max(0, pct)) / 100;
  const prev = company.profile.managedService;
  await updateCompany(companyId, {
    profile: {
      ...company.profile,
      managedService: {
        ...(prev ?? { serviceLevel: "approval" }),
        promoMarkupPercent: markupPercent,
      },
    },
  });
  await logAction(user, "promo.markup_saved", {
    companyId,
    detail: `${Math.round(markupPercent * 100)}%`,
  });
  revalidatePath(`/companies/${companyId}`);
}
