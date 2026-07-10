// CRM program management engine (W3 M30).
import { createCrmContact, createCrmInteraction, getCrmContact, listCrmContacts, listCrmInteractions, updateCrmContact } from "@/lib/db";
import { crmLive } from "@/lib/crm-connectors";
import type { CrmConsentStatus, CrmContact, CrmInteraction, CrmSegment, Lead, ScheduledPost } from "@/lib/types";
export { crmLive, crmApiKey } from "@/lib/crm-connectors";
export function normaliseEmail(email?: string) { const t = email?.trim().toLowerCase(); return t || undefined; }
export function normalisePhone(phone?: string) { const digits = phone?.replace(/\D/g, ""); return digits || undefined; }
export function contactDisplayName(c: Pick<CrmContact, "firstName" | "lastName">) { return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.firstName; }
export function findDuplicateContacts(contacts: CrmContact[], email?: string, phone?: string) {
  const e = normaliseEmail(email); const p = normalisePhone(phone); if (!e && !p) return [];
  return contacts.filter((c) => (e && normaliseEmail(c.email) === e) || (p && normalisePhone(c.phone) === p));
}
export function resolveSegmentMembers(segment: CrmSegment, contacts: CrmContact[]) {
  const cfg = segment.ruleConfig ?? {};
  if (segment.ruleType === "manual") return contacts.filter((c) => (cfg.contactIds ?? []).includes(c.id));
  if (segment.ruleType === "tag") { const tags = new Set((cfg.tags ?? []).map((t) => t.toLowerCase())); return contacts.filter((c) => c.tags.some((t) => tags.has(t.toLowerCase()))); }
  return contacts.filter((c) => c.consentStatus === (cfg.consentStatus ?? "subscribed"));
}
export async function importContactsExternal(tenantId: string, companyId: string, createdById: string) {
  if (!crmLive()) return { mode: "simulated" as const, imported: 0, skipped: 0, detail: "CRM_LIVE off" };
  const email = `import+${companyId.slice(-6)}@example.com`;
  if (findDuplicateContacts(await listCrmContacts(tenantId, companyId), email).length) return { mode: "live" as const, imported: 0, skipped: 1, detail: "duplicate" };
  await createCrmContact({ companyId, firstName: "Imported", email, tags: ["imported"], consentStatus: "pending", source: "import", createdById });
  return { mode: "live" as const, imported: 1, skipped: 0, detail: "live import stub" };
}
export async function mergeContacts(tenantId: string, primaryId: string, secondaryId: string, actorId: string) {
  const primary = await getCrmContact(primaryId); const secondary = await getCrmContact(secondaryId);
  if (!primary || !secondary || primary.companyId !== secondary.companyId) return undefined;
  return updateCrmContact(primaryId, { email: primary.email ?? secondary.email, phone: primary.phone ?? secondary.phone, tags: [...new Set([...primary.tags, ...secondary.tags])], leadId: primary.leadId ?? secondary.leadId });
}
export async function upsertContactFromAdLead(lead: Lead, createdById: string) {
  const parts = lead.contact.trim().split(/\s+/);
  const created = await createCrmContact({ companyId: lead.companyId, firstName: parts[0] ?? "Lead", lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined, tags: ["ad-lead", lead.platform], consentStatus: "pending", source: "ad_lead", leadId: lead.id, createdById });
  await createCrmInteraction({ companyId: lead.companyId, contactId: created.id, channel: "ad_lead", direction: "inbound", summary: `Captured via ${lead.source}`, occurredAt: lead.capturedAt, createdById, metadata: { leadId: lead.id, platform: lead.platform } });
  return created;
}
export async function countAttributedLeads(tenantId: string, query: { companyId: string; source?: string; since?: string; contentId?: string }) {
  const interactions = await listCrmInteractions(tenantId, query.companyId);
  const sinceMs = query.since ? Date.parse(query.since) : NaN;
  return interactions.filter((ix) => {
    if (Number.isFinite(sinceMs) && Date.parse(ix.occurredAt) < sinceMs) return false;
    if (query.source) { const ms = typeof ix.metadata?.source === "string" ? ix.metadata.source : undefined; const pl = typeof ix.metadata?.platform === "string" ? ix.metadata.platform : undefined; if (ms !== query.source && pl !== query.source) return false; }
    if (query.contentId && ix.metadata?.contentId !== query.contentId) return false;
    return ix.channel === "ad_lead" || ix.channel === "form" || ix.channel === "order";
  }).length;
}
export function consentLabel(status: CrmConsentStatus) { return status === "subscribed" ? "Subscribed" : status === "unsubscribed" ? "Unsubscribed" : "Pending consent"; }
export function interactionChannelLabel(channel: CrmInteraction["channel"]) { return ({ email: "Email", sms: "SMS", call: "Call", form: "Form", ad_lead: "Ad lead", order: "Order", social: "Social", note: "Note" } as const)[channel]; }
