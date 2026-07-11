// AI onboarding enrich — after HTML scrape, fill gaps and infer marketing
// fields logically. Claude when keyed; otherwise deterministic templates.
// Never invent phone / email / street address without a scrape signal.

import { AI_MODEL, aiConfigured, callClaudeDetailed } from "@/lib/ai/claude";
import { assertAiBudget } from "@/lib/ai/budget";
import { recordAiUsage } from "@/lib/ai/metering";
import {
  suggestProfileFields,
  type ProfileSuggestions,
} from "@/lib/profile-suggestions";
import { inferBusinessTypeFromIndustry } from "@/lib/business-profiles";
import { sanitizeAiUserInput } from "@/lib/security-slice";
import type {
  AutoOnboardingExtractedFields,
  AutoOnboardingFieldKey,
  AutoOnboardingFieldPreview,
  AutoOnboardingScrapeResult,
} from "@/lib/auto-onboarding";
import type { BusinessType, Company } from "@/lib/types";

export interface OnboardingContactSignals {
  businessAddress?: string;
  phone?: string;
  email?: string;
}

export interface OnboardingAiEnrichment {
  fields: Partial<
    Record<
      AutoOnboardingFieldKey | "localMarketNotes" | "businessAddress" | "phone" | "email",
      string | string[]
    >
  >;
  /** Keys the model filled by inference (not copied from scrape). */
  inferredKeys: string[];
  mode: "claude" | "template";
}

const INFERABLE_KEYS: AutoOnboardingFieldKey[] = [
  "natureOfBusiness",
  "industry",
  "serviceAreas",
  "services",
  "targetCustomers",
  "brandVoice",
  "callsToAction",
  "currentOffers",
  "tradingNames",
];

function asString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

function asStringList(v: unknown): string[] | undefined {
  if (Array.isArray(v)) {
    const list = v.map((x) => String(x).trim()).filter(Boolean);
    return list.length ? list : undefined;
  }
  if (typeof v === "string") {
    const list = v
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return list.length ? list : undefined;
  }
  return undefined;
}

function scrapeMap(preview: AutoOnboardingScrapeResult): Map<string, string> {
  return new Map(preview.fields.map((f) => [f.key, f.value]));
}

function weakNature(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  const v = value.trim();
  if (v.length < 40) return true;
  // Simulated / generic hash fluff
  if (/serves \w+ with friendly, professional/i.test(v)) return true;
  if (/^Locals and visitors in /i.test(v) && v.length < 80) return true;
  return false;
}

function templateEnrich(
  company: Company,
  preview: AutoOnboardingScrapeResult,
  contacts: OnboardingContactSignals,
): OnboardingAiEnrichment {
  const map = scrapeMap(preview);
  const industry = map.get("industry") || company.profile.industry;
  const areasRaw = map.get("serviceAreas");
  const areas = areasRaw
    ? areasRaw.split(/,\s*/).map((s) => s.trim()).filter(Boolean)
    : company.profile.serviceAreas;
  const businessType: BusinessType = inferBusinessTypeFromIndustry(industry);
  const suggestions: ProfileSuggestions = suggestProfileFields({
    businessType,
    companyName: company.name,
    industry,
    areas,
  });

  const fields: OnboardingAiEnrichment["fields"] = {};
  const inferredKeys: string[] = [];

  const nature = map.get("natureOfBusiness");
  if (weakNature(nature)) {
    fields.natureOfBusiness = suggestions.natureOfBusiness;
    inferredKeys.push("natureOfBusiness");
  }
  if (!map.get("targetCustomers")?.trim()) {
    fields.targetCustomers = suggestions.targetCustomers;
    inferredKeys.push("targetCustomers");
  }
  if (!map.get("brandVoice")?.trim()) {
    fields.brandVoice = suggestions.brandVoice;
    inferredKeys.push("brandVoice");
  }
  if (!map.get("callsToAction")?.trim()) {
    fields.callsToAction = suggestions.callsToAction;
    inferredKeys.push("callsToAction");
  }
  if (!map.get("services")?.trim()) {
    fields.services = suggestions.services;
    inferredKeys.push("services");
  }
  if (!map.get("serviceAreas")?.trim() || map.get("serviceAreas") === "Local area") {
    if (areas.length && areas[0] !== "Local area") {
      fields.serviceAreas = areas;
    } else {
      fields.serviceAreas = areas.length ? areas : ["Local area"];
      inferredKeys.push("serviceAreas");
    }
  }

  fields.localMarketNotes = suggestions.localMarketNotes;
  inferredKeys.push("localMarketNotes");

  if (contacts.businessAddress) fields.businessAddress = contacts.businessAddress;
  if (contacts.phone) fields.phone = contacts.phone;
  if (contacts.email) fields.email = contacts.email;

  return { fields, inferredKeys, mode: "template" };
}

function parseClaudeJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

async function claudeEnrich(
  company: Company,
  preview: AutoOnboardingScrapeResult,
  contacts: OnboardingContactSignals,
  actorId: string,
): Promise<OnboardingAiEnrichment | null> {
  try {
    await assertAiBudget(company.tenantId);
  } catch {
    return null;
  }

  const scraped = preview.fields.map((f) => ({
    key: f.key,
    label: f.label,
    value: f.value,
    confidence: f.confidence,
  }));
  const snippets = preview.sources.map((s) => ({
    url: s.url,
    title: s.title,
    snippet: s.snippet?.slice(0, 280),
  }));

  const system = `You enrich a marketing company onboarding profile from public scrape signals.
Return ONLY valid JSON (no markdown) with keys:
natureOfBusiness, industry, tradingNames, legalName, serviceAreas (string[]),
services (string[]), targetCustomers, brandVoice, callsToAction (string[]),
currentOffers, localMarketNotes, businessAddress, phone, email.

Rules:
- Prefer scrape facts over invention.
- Infer natureOfBusiness, targetCustomers, brandVoice, services, CTAs logically from name + industry + area when scrape is thin or generic.
- NEVER invent phone, email, or street address — only copy when present in contactSignals or scrape snippets.
- Use Australian English. Be concrete and marketing-useful.
- serviceAreas: suburbs/towns only (not full street).
- businessAddress: full street address only if known from signals.`;

  const user = sanitizeAiUserInput(
    JSON.stringify(
      {
        companyName: company.name,
        website: preview.urls.website,
        scrapedFields: scraped,
        pageSnippets: snippets,
        contactSignals: contacts,
      },
      null,
      2,
    ),
  ).text;

  const result = await callClaudeDetailed(system, user, 1200);
  if (!result?.text) return null;

  await recordAiUsage({
    tenantId: company.tenantId,
    companyId: company.id,
    userId: actorId,
    kind: "onboarding_enrich",
    model: AI_MODEL,
    promptSummary: `onboarding enrich ${company.name}`,
    sourcesUsed: preview.sources.map((s) => s.url).slice(0, 5),
    outputChars: result.text.length,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
  });

  const parsed = parseClaudeJson(result.text);
  if (!parsed) return null;

  const fields: OnboardingAiEnrichment["fields"] = {};
  const inferredKeys: string[] = [];
  const map = scrapeMap(preview);

  const setStr = (key: string, preferInfer: boolean) => {
    const v = asString(parsed[key]);
    if (!v) return;
    fields[key as keyof typeof fields] = v;
    const existing = map.get(key as AutoOnboardingFieldKey);
    if (preferInfer || !existing || (key === "natureOfBusiness" && weakNature(existing))) {
      inferredKeys.push(key);
    }
  };
  const setList = (key: string) => {
    const v = asStringList(parsed[key]);
    if (!v) return;
    fields[key as keyof typeof fields] = v;
    if (!map.get(key as AutoOnboardingFieldKey)?.trim()) inferredKeys.push(key);
  };

  setStr("natureOfBusiness", true);
  setStr("industry", false);
  setStr("tradingNames", false);
  setStr("legalName", false);
  setList("serviceAreas");
  setList("services");
  setStr("targetCustomers", true);
  setStr("brandVoice", true);
  setList("callsToAction");
  setStr("currentOffers", false);
  setStr("localMarketNotes", true);

  // Contact: only when Claude returns AND we had a signal, or Claude mirrors signal
  const addr = asString(parsed.businessAddress);
  if (addr && (contacts.businessAddress || /street|st\b|rd\b|ave\b|\d/i.test(addr))) {
    if (contacts.businessAddress || snippets.some((s) => s.snippet?.includes(addr.slice(0, 12)))) {
      fields.businessAddress = contacts.businessAddress || addr;
    } else if (contacts.businessAddress) {
      fields.businessAddress = contacts.businessAddress;
    }
  } else if (contacts.businessAddress) {
    fields.businessAddress = contacts.businessAddress;
  }

  if (contacts.phone) fields.phone = contacts.phone;
  else {
    const phone = asString(parsed.phone);
    if (phone && snippets.some((s) => (s.snippet || "").includes(phone.slice(0, 6)))) {
      fields.phone = phone;
    }
  }

  if (contacts.email) fields.email = contacts.email;
  else {
    const email = asString(parsed.email);
    if (email && email.includes("@")) fields.email = email;
  }

  return { fields, inferredKeys: [...new Set(inferredKeys)], mode: "claude" };
}

/** Merge AI/template enrichment into a scrape preview (field list for UI + apply). */
export function mergeEnrichmentIntoPreview(
  preview: AutoOnboardingScrapeResult,
  enrichment: OnboardingAiEnrichment,
): AutoOnboardingScrapeResult {
  const byKey = new Map(preview.fields.map((f) => [f.key, f]));

  const upsert = (
    key: AutoOnboardingFieldKey,
    value: string,
    confidence: AutoOnboardingFieldPreview["confidence"],
  ) => {
    if (!value.trim()) return;
    const existing = byKey.get(key);
    const inferred = enrichment.inferredKeys.includes(key);
    // Prefer enrichment when existing is weak nature or missing
    if (
      !existing ||
      (key === "natureOfBusiness" && weakNature(existing.value)) ||
      inferred
    ) {
      byKey.set(key, {
        key,
        label: existing?.label ?? key,
        value,
        confidence: inferred ? "medium" : confidence,
        sourceUrl: existing?.sourceUrl,
        alreadySet: existing?.alreadySet ?? false,
      });
    }
  };

  for (const key of INFERABLE_KEYS) {
    const raw = enrichment.fields[key];
    if (raw == null) continue;
    const value = Array.isArray(raw) ? raw.join(key === "callsToAction" ? " · " : ", ") : String(raw);
    upsert(key, value, "medium");
  }

  // Ensure labels for known keys
  const LABEL: Partial<Record<AutoOnboardingFieldKey, string>> = {
    natureOfBusiness: "Nature of business",
    industry: "Industry",
    serviceAreas: "Service areas",
    services: "Services",
    targetCustomers: "Target customers",
    brandVoice: "Brand voice",
    callsToAction: "Calls to action",
    currentOffers: "Current offers",
    tradingNames: "Trading name",
    legalName: "Legal name",
  };
  for (const [key, field] of byKey) {
    if (LABEL[key] && field.label === key) {
      byKey.set(key, { ...field, label: LABEL[key]! });
    }
  }

  return {
    ...preview,
    fields: [...byKey.values()],
  };
}

export function applyContactAndNotesToProfile(
  profile: Company["profile"],
  enrichment: OnboardingAiEnrichment,
): Company["profile"] {
  const next = { ...profile };
  const notes = asString(enrichment.fields.localMarketNotes);
  if (notes && !next.localMarketNotes?.trim()) next.localMarketNotes = notes;
  const addr = asString(enrichment.fields.businessAddress);
  if (addr) next.businessAddress = next.businessAddress || addr;
  const phone = asString(enrichment.fields.phone);
  if (phone) next.phone = next.phone || phone;
  const email = asString(enrichment.fields.email);
  if (email) next.email = next.email || email;
  // Prefer approval contact from email if empty
  if (!next.approvalContact?.trim() && (email || phone)) {
    next.approvalContact = [email, phone].filter(Boolean).join(" · ");
  }
  return next;
}

export function extractContactSignalsFromPreview(
  preview: AutoOnboardingScrapeResult,
): OnboardingContactSignals {
  const out: OnboardingContactSignals = {};
  for (const s of preview.sources) {
    const snip = s.snippet || "";
    const tel = snip.match(/Telephone:\s*([^·\n]+)/i);
    if (tel && !out.phone) out.phone = tel[1].trim();
    const mail = snip.match(/(?:Email|mailto):\s*([^\s·]+@[^\s·]+)/i);
    if (mail && !out.email) out.email = mail[1].trim();
    const addr = snip.match(/Address:\s*([^·\n]+)/i);
    if (addr && !out.businessAddress) out.businessAddress = addr[1].trim();
  }
  return out;
}

/**
 * Enrich scrape preview with Claude (or templates). Safe when AI budget/key missing.
 */
export async function enrichOnboardingPreview(input: {
  company: Company;
  preview: AutoOnboardingScrapeResult;
  actorId: string;
  contacts?: OnboardingContactSignals;
}): Promise<{
  preview: AutoOnboardingScrapeResult;
  enrichment: OnboardingAiEnrichment;
}> {
  const contacts =
    input.contacts ?? extractContactSignalsFromPreview(input.preview);

  let enrichment: OnboardingAiEnrichment | null = null;
  if (aiConfigured()) {
    enrichment = await claudeEnrich(
      input.company,
      input.preview,
      contacts,
      input.actorId,
    );
  }
  if (!enrichment) {
    enrichment = templateEnrich(input.company, input.preview, contacts);
  }

  return {
    preview: {
      ...mergeEnrichmentIntoPreview(input.preview, enrichment),
      extras: {
        localMarketNotes: asString(enrichment.fields.localMarketNotes),
        businessAddress: asString(enrichment.fields.businessAddress),
        phone: asString(enrichment.fields.phone),
        email: asString(enrichment.fields.email),
        enrichMode: enrichment.mode,
      },
    },
    enrichment,
  };
}

/** For tests / callers that already have extracted bag. */
export function enrichmentToExtractedPatch(
  enrichment: OnboardingAiEnrichment,
): AutoOnboardingExtractedFields {
  const out: AutoOnboardingExtractedFields = {};
  const f = enrichment.fields;
  if (asString(f.legalName)) out.legalName = asString(f.legalName);
  if (asString(f.tradingNames)) out.tradingNames = asString(f.tradingNames);
  if (asString(f.industry)) out.industry = asString(f.industry);
  if (asString(f.natureOfBusiness)) out.natureOfBusiness = asString(f.natureOfBusiness);
  if (asStringList(f.serviceAreas)) out.serviceAreas = asStringList(f.serviceAreas);
  if (asStringList(f.services)) out.services = asStringList(f.services);
  if (asString(f.targetCustomers)) out.targetCustomers = asString(f.targetCustomers);
  if (asString(f.brandVoice)) out.brandVoice = asString(f.brandVoice);
  if (asStringList(f.callsToAction)) out.callsToAction = asStringList(f.callsToAction);
  if (asString(f.currentOffers)) out.currentOffers = asString(f.currentOffers);
  return out;
}
