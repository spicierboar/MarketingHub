// Self-test helpers for CRM (W3 M30).
import { createCrmContact, createCrmInteraction, createCrmSegment, listCrmContacts, purgeTenant, updateCompany } from "@/lib/db";
import { countAttributedLeads, crmApiKey, findDuplicateContacts, importContactsExternal, resolveSegmentMembers } from "@/lib/crm";
import { crmLive } from "@/lib/crm-connectors";
import type { CrmContact, CrmSegment } from "@/lib/types";

export function checkCrmSimulatedWhenLiveOff() { return { ok: !crmLive(), detail: `CRM_LIVE=${crmLive()}` }; }
export async function checkCrmDedupFindsEmail() {
  const contacts: CrmContact[] = [{ id: "x", companyId: "c", email: "a@b.com", firstName: "A", tags: [], consentStatus: "pending", source: "manual", createdById: "u", createdAt: "t", updatedAt: "t" }];
  return { ok: findDuplicateContacts(contacts, "A@b.com").length === 1, detail: "email match" };
}
export async function checkCrmSegmentResolvesMembers() {
  const contacts: CrmContact[] = [
    { id: "1", companyId: "c", firstName: "S", tags: [], consentStatus: "subscribed", source: "manual", createdById: "u", createdAt: "t", updatedAt: "t" },
    { id: "2", companyId: "c", firstName: "P", tags: [], consentStatus: "pending", source: "manual", createdById: "u", createdAt: "t", updatedAt: "t" },
  ];
  const seg: CrmSegment = { id: "s", companyId: "c", name: "Subs", ruleType: "consent", ruleConfig: { consentStatus: "subscribed" }, createdById: "u", createdAt: "t", updatedAt: "t" };
  const m = resolveSegmentMembers(seg, contacts);
  return { ok: m.length === 1 && m[0]!.id === "1", detail: `members=${m.length}` };
}
export async function checkCrmImportSimulated() { const r = await importContactsExternal("t", "c", "u"); return { ok: r.mode === "simulated", detail: r.detail }; }
export async function checkCrmApiKeyOptional() { return { ok: true, detail: crmApiKey() ? "set" : "unset" }; }

export async function runCrmSelfTest() {
  const start = Date.now();
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const purgeFailed: string[] = [];
  async function expect(name: string, fn: () => Promise<{ ok: boolean; detail?: string }> | { ok: boolean; detail?: string }) {
    try { const r = await fn(); checks.push({ name, ok: r.ok, detail: r.detail }); }
    catch (e) { checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) }); }
  }
  await expect("crm.simulatedWhenLiveOff", () => checkCrmSimulatedWhenLiveOff());
  await expect("crm.dedupFindsEmail", () => checkCrmDedupFindsEmail());
  await expect("crm.segmentResolvesMembers", () => checkCrmSegmentResolvesMembers());
  await expect("crm.importSimulated", () => checkCrmImportSimulated());
  await expect("crm.apiKeyOptional", () => checkCrmApiKeyOptional());
  const { createTenant, createUser, addMembership, createCompany } = await import("@/lib/db");
  const t = await createTenant({ name: "CRM Test", kind: "agency", plan: "starter", status: "active", timezone: "Australia/Sydney" });
  const user = await createUser({ email: `crm-${Date.now()}@example.dev`, name: "CRM Tester", role: "admin" });
  await addMembership({ tenantId: t.id, userId: user.id, role: "owner" });
  const company = await createCompany({ tenantId: t.id, name: "CRM Co", createdBy: user.id });
  await updateCompany(company.id, { status: "approved" });
  const contact = await createCrmContact({ companyId: company.id, firstName: "T", email: "t@example.dev", tags: ["selftest"], consentStatus: "subscribed", source: "manual", createdById: user.id });
  await createCrmInteraction({ companyId: company.id, contactId: contact.id, channel: "form", direction: "inbound", summary: "Self-test", occurredAt: new Date().toISOString(), createdById: user.id, metadata: { source: "facebook", contentId: "ct_selftest" } });
  checks.push({ name: "crm.contactPersisted", ok: (await listCrmContacts(t.id, company.id)).some((c) => c.id === contact.id) });
  checks.push({ name: "crm.attributionCount", ok: (await countAttributedLeads(t.id, { companyId: company.id, source: "facebook", contentId: "ct_selftest" })) >= 1 });
  await createCrmSegment({ companyId: company.id, name: "Tag seg", ruleType: "tag", ruleConfig: { tags: ["selftest"] }, createdById: user.id });
  try { await purgeTenant(t.id); } catch { purgeFailed.push(t.id); }
  const failed = checks.filter((c) => !c.ok).length;
  return { ok: failed === 0 && !purgeFailed.length, passed: checks.length - failed, failed, purgeFailed, durationMs: Date.now() - start, checks };
}
