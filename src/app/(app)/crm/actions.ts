"use server";
import { revalidatePath } from "next/cache";
import { createCrmContact, createCrmSegment, listCrmContacts } from "@/lib/db";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { findDuplicateContacts, importContactsExternal, normaliseEmail, normalisePhone } from "@/lib/crm";
import type { CrmConsentStatus, CrmSegmentRuleType } from "@/lib/types";
export async function createContactAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  const firstName = String(formData.get("firstName") ?? "").trim();
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  const dupes = findDuplicateContacts(await listCrmContacts(user.tenantId, companyId), email);
  if (dupes.length) throw new Error("Duplicate");
  await createCrmContact({ companyId, firstName, email, tags: [], consentStatus: "pending", source: "manual", createdById: user.id });
  revalidatePath(`/crm?company=${companyId}`);
}
export async function createSegmentAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  await createCrmSegment({ companyId, name: String(formData.get("name") ?? ""), ruleType: "consent" as CrmSegmentRuleType, ruleConfig: { consentStatus: "subscribed" as CrmConsentStatus }, createdById: user.id });
  revalidatePath(`/crm?company=${companyId}`);
}
export async function importContactsAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  await importContactsExternal(user.tenantId, companyId, user.id);
  revalidatePath(`/crm?company=${companyId}`);
}
