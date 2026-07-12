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
import {
  filterServiceLabels,
  inferRetailServicesFromContext,
  isProductSellerContext,
  isWeakNatureText,
  isWeakTargetCustomers,
  partitionServicesAndProductCategories,
  synthesizeNatureOfBusiness,
  synthesizeTargetCustomers,
  type AutoOnboardingExtractedFields,
  type AutoOnboardingFieldKey,
  type AutoOnboardingFieldPreview,
  type AutoOnboardingScrapeResult,
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
      | AutoOnboardingFieldKey
      | "localMarketNotes"
      | "businessAddress"
      | "phone"
      | "email"
      | "productCategories"
      | "approvedClaims"
      | "prohibitedClaims"
      | "requiredDisclaimers",
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
  // tradingNames / currentOffers / legalName: only from scrape or ABR — never invent
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
  return isWeakNatureText(value);
}

function weakServices(value: string | undefined, contextSignal?: string): boolean {
  if (!value?.trim()) return true;
  const parts = filterServiceLabels(
    value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (parts.length === 0) return true;
  // Retail: category-looking lists (Rice, Snacks…) are not real services
  if (isProductSellerContext(contextSignal)) {
    const { services, productCategories } = partitionServicesAndProductCategories(
      parts,
      contextSignal,
    );
    if (productCategories.length > 0 && services.length === 0) return true;
    if (productCategories.length >= services.length && productCategories.length >= 2) {
      return true;
    }
  }
  const placeholder = /^(core service|premium package|consultation|core services|enquir(?:y|ies))$/i;
  const placeholderCount = parts.filter((p) => placeholder.test(p)).length;
  return placeholderCount >= Math.min(2, parts.length);
}

function weakTargetCustomers(value: string | undefined): boolean {
  return isWeakTargetCustomers(value);
}

function templateEnrich(
  company: Company,
  preview: AutoOnboardingScrapeResult,
  contacts: OnboardingContactSignals,
): OnboardingAiEnrichment {
  const map = scrapeMap(preview);
  const industry = map.get("industry") || company.profile.industry;
  const natureHint = map.get("natureOfBusiness");
  const titleHint = preview.sources.find((s) => s.kind === "website")?.title;
  const areasRaw = map.get("serviceAreas");
  const areas = areasRaw
    ? areasRaw.split(/,\s*/).map((s) => s.trim()).filter(Boolean)
    : company.profile.serviceAreas;
  const typeSignal = [industry, natureHint, titleHint, company.name]
    .filter(Boolean)
    .join(" · ");
  const businessType: BusinessType = inferBusinessTypeFromIndustry(typeSignal);
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
    const synthesized = synthesizeNatureOfBusiness({
      title: titleHint,
      metaDescription: nature,
      tradingName: company.name,
      industry,
    });
    fields.natureOfBusiness = synthesized || suggestions.natureOfBusiness;
    inferredKeys.push("natureOfBusiness");
  }
  if (weakTargetCustomers(map.get("targetCustomers"))) {
    fields.targetCustomers =
      synthesizeTargetCustomers({
        natureOfBusiness: (fields.natureOfBusiness as string) || nature,
        industry,
        tradingName: company.name,
        serviceAreas: areas,
        title: titleHint,
      }) || suggestions.targetCustomers;
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
  const scrapedServices = map.get("services");
  const contextSignal = [industry, natureHint, titleHint, company.name]
    .filter(Boolean)
    .join(" · ");
  const scrapedParts = scrapedServices
    ? scrapedServices.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean)
    : [];
  const partitioned = partitionServicesAndProductCategories(scrapedParts, contextSignal);
  const previewCats = preview.extras?.productCategories ?? [];
  const productCategories = [
    ...new Set([...previewCats, ...partitioned.productCategories]),
  ];
  let cleanedServices = partitioned.services;
  if (cleanedServices.length === 0 && productCategories.length > 0) {
    cleanedServices = inferRetailServicesFromContext(contextSignal);
  }
  if (
    weakServices(scrapedServices, contextSignal) ||
    (scrapedServices && cleanedServices.length === 0 && productCategories.length === 0)
  ) {
    fields.services = suggestions.services;
    inferredKeys.push("services");
  } else if (
    scrapedServices &&
    (cleanedServices.join(", ") !== scrapedServices || productCategories.length > 0)
  ) {
    fields.services =
      cleanedServices.length > 0 ? cleanedServices : suggestions.services;
    inferredKeys.push("services");
  }
  if (productCategories.length) {
    fields.productCategories = productCategories;
    inferredKeys.push("productCategories");
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

  // Compliance: prefer real scrape lines; otherwise industry starters (owner wants text).
  const scrapedApproved = preview.extras?.approvedClaims ?? [];
  const scrapedDisclaimers = preview.extras?.requiredDisclaimers ?? [];
  if (scrapedApproved.length) {
    fields.approvedClaims = scrapedApproved;
  } else {
    fields.approvedClaims = suggestions.approvedClaims;
    inferredKeys.push("approvedClaims");
  }
  fields.prohibitedClaims = suggestions.prohibitedClaims;
  inferredKeys.push("prohibitedClaims");
  if (scrapedDisclaimers.length) {
    fields.requiredDisclaimers = scrapedDisclaimers;
  } else {
    fields.requiredDisclaimers = suggestions.requiredDisclaimers;
    inferredKeys.push("requiredDisclaimers");
  }

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
services (string[]), productCategories (string[]), targetCustomers, brandVoice, callsToAction (string[]),
currentOffers, localMarketNotes, businessAddress, phone, email,
approvedClaims (string[]), prohibitedClaims (string[]), requiredDisclaimers (string[]).

Rules:
- Prefer scrape facts over invention, but REWRITE polluted scrape text into clean marketing copy.
- Strip UI/nav chrome from any field: "Toggle menu", "Welcome to X!", "Skip to content", Register/Login/Cart, breadcrumbs.
- natureOfBusiness: 1–2 clean sentences (what they do, for whom, where). Example: "Online Indian grocery store delivering across Australia."
- For retail / grocery / wholesale / e-commerce product sellers: nav category labels (Rice, Lentils, Indian Snacks, Gravies, Oil/Ghee) belong in productCategories — NEVER in services.
- services: only real fulfilment or ops offerings when evident — e.g. online delivery, nationwide shipping, click & collect, wholesale supply, online ordering. Never SKU or category lists.
- If scrape only has product categories and context shows delivery/online grocery, put categories in productCategories and set services to delivery-related offerings (or leave empty).
- targetCustomers: specific audience with common sense from context (e.g. Indian diaspora grocery shoppers across Australia) — NEVER tautologies like "people who need what X offers".
- Infer natureOfBusiness, targetCustomers, brandVoice, services, CTAs logically from name + industry + area when scrape is thin or generic.
- If signals say Indian grocery / online store / retail, treat as specialty retail (not vague "other").
- NEVER invent phone, email, or street address — only copy when present in contactSignals or scrape snippets.
- NEVER invent currentOffers — omit unless an explicit promo is visible in scrape.
- For approvedClaims / prohibitedClaims / requiredDisclaimers: prefer real disclaimer or trust lines from scrape when present. If missing, supply short industry-standard Brand Brain starters (e.g. grocery: no unverified health claims; specials while stocks last) — not fake product-specific claims.
- tradingNames: brand/trading name only (e.g. "Viya Imports") — NEVER SEO titles like "Online Indian Grocery Store in Australia". Prefer companyName or og:site_name.
- legalName: only when a real registered entity name is evident — never invent "X Pty Ltd".
- Use Australian English. Be concrete and marketing-useful.
- serviceAreas: suburbs/towns/regions only (not full street).
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
  // tradingNames / legalName / currentOffers: never invent SEO titles, Pty Ltd, or offers.
  {
    const t = asString(parsed.tradingNames);
    if (
      t &&
      t.split(/\s+/).length < 6 &&
      !/\b(online\s+indian\s+grocery|grocery\s+store\s+in)\b/i.test(t)
    ) {
      fields.tradingNames = t;
    }
  }
  {
    const legal = asString(parsed.legalName);
    const hadLegal = !!map.get("legalName")?.trim();
    if (
      legal &&
      (hadLegal ||
        /\b(pty\.?\s*ltd|limited|trust|incorporated)\b/i.test(legal)) &&
      !/\b(online|grocery store in)\b/i.test(legal)
    ) {
      fields.legalName = legal;
    }
  }
  setList("serviceAreas");
  {
    const contextSignal = [
      map.get("industry"),
      map.get("natureOfBusiness"),
      asString(parsed.industry),
      asString(parsed.natureOfBusiness),
      company.name,
      preview.sources.find((s) => s.kind === "website")?.title,
    ]
      .filter(Boolean)
      .join(" · ");
    const v = asStringList(parsed.services) ?? [];
    const catsFromClaude = asStringList(parsed.productCategories) ?? [];
    const partitioned = partitionServicesAndProductCategories(
      [...v, ...(map.get("services")?.split(/[,;\n]/).map((s) => s.trim()) ?? [])],
      contextSignal,
    );
    const productCategories = [
      ...new Set([
        ...(preview.extras?.productCategories ?? []),
        ...catsFromClaude,
        ...partitioned.productCategories,
      ]),
    ];
    let cleaned = partitioned.services;
    if (cleaned.length === 0 && productCategories.length > 0) {
      cleaned = inferRetailServicesFromContext(contextSignal);
    }
    if (cleaned.length === 0 && isProductSellerContext(contextSignal)) {
      // Fall through — template merge may still fill from suggestions via weakServices
      const existing = map.get("services");
      if (!existing?.trim() || weakServices(existing, contextSignal)) {
        // leave services unset so merge keeps empty / later template path
      }
    }
    if (cleaned.length) {
      fields.services = cleaned;
      const existing = map.get("services");
      if (!existing?.trim() || weakServices(existing, contextSignal)) {
        inferredKeys.push("services");
      }
    } else if (productCategories.length && weakServices(map.get("services"), contextSignal)) {
      // Clear category dump from services preview
      fields.services = [];
      inferredKeys.push("services");
    }
    if (productCategories.length) {
      fields.productCategories = productCategories;
      inferredKeys.push("productCategories");
    }
  }
  setStr("targetCustomers", true);
  setStr("brandVoice", true);
  setList("callsToAction");
  // currentOffers only when scrape already had an offer signal
  if (map.get("currentOffers")?.trim()) {
    const offer = asString(parsed.currentOffers) || map.get("currentOffers");
    if (offer) fields.currentOffers = offer;
  }
  setStr("localMarketNotes", true);

  {
    const scrapedApproved = preview.extras?.approvedClaims ?? [];
    const scrapedDisclaimers = preview.extras?.requiredDisclaimers ?? [];
    const approved =
      asStringList(parsed.approvedClaims) ??
      (scrapedApproved.length ? scrapedApproved : undefined);
    if (approved?.length) {
      fields.approvedClaims = approved;
      if (!scrapedApproved.length) inferredKeys.push("approvedClaims");
    }
    const prohibited = asStringList(parsed.prohibitedClaims);
    if (prohibited?.length) {
      fields.prohibitedClaims = prohibited;
      inferredKeys.push("prohibitedClaims");
    }
    const disclaimers =
      asStringList(parsed.requiredDisclaimers) ??
      (scrapedDisclaimers.length ? scrapedDisclaimers : undefined);
    if (disclaimers?.length) {
      fields.requiredDisclaimers = disclaimers;
      if (!scrapedDisclaimers.length) inferredKeys.push("requiredDisclaimers");
    }
  }

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
    opts?: { allowEmpty?: boolean },
  ) => {
    if (!value.trim() && !opts?.allowEmpty) return;
    const existing = byKey.get(key);
    const inferred = enrichment.inferredKeys.includes(key);
    const contextSignal = [
      byKey.get("industry")?.value,
      byKey.get("natureOfBusiness")?.value,
      enrichment.fields.industry,
      enrichment.fields.natureOfBusiness,
    ]
      .filter(Boolean)
      .join(" · ");
    // Prefer enrichment when existing is weak nature/services or missing
    if (
      !existing ||
      (key === "natureOfBusiness" && weakNature(existing.value)) ||
      (key === "services" && weakServices(existing.value, contextSignal)) ||
      (key === "targetCustomers" && weakTargetCustomers(existing.value)) ||
      inferred ||
      (opts?.allowEmpty && key === "services" && inferred)
    ) {
      if (!value.trim() && key === "services") {
        byKey.delete(key);
        return;
      }
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
    upsert(key, value, "medium", {
      allowEmpty: key === "services" && Array.isArray(raw) && raw.length === 0,
    });
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

  const productCategories = asStringList(enrichment.fields.productCategories);

  return {
    ...preview,
    fields: [...byKey.values()],
    extras: {
      ...preview.extras,
      ...(productCategories?.length ? { productCategories } : {}),
    },
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
  const cats = asStringList(enrichment.fields.productCategories);
  if (cats?.length && !(next.retail?.productCategories?.length)) {
    next.retail = {
      productCategories: cats,
      heroProducts: next.retail?.heroProducts ?? [],
      promotions: next.retail?.promotions ?? [],
      seasons: next.retail?.seasons ?? [],
      pricePositioning: next.retail?.pricePositioning,
    };
    if (!next.businessType || next.businessType === "other") {
      next.businessType = "retail";
    }
  }
  const approved = asStringList(enrichment.fields.approvedClaims);
  if (approved?.length && next.approvedClaims.length === 0) {
    next.approvedClaims = approved;
  }
  const prohibited = asStringList(enrichment.fields.prohibitedClaims);
  if (prohibited?.length && next.prohibitedClaims.length === 0) {
    next.prohibitedClaims = prohibited;
  }
  const disclaimers = asStringList(enrichment.fields.requiredDisclaimers);
  if (disclaimers?.length && next.requiredDisclaimers.length === 0) {
    next.requiredDisclaimers = disclaimers;
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
  const template = templateEnrich(input.company, input.preview, contacts);
  if (!enrichment) {
    enrichment = template;
  } else {
    // Fill compliance starters when Claude omitted them (never overwrite scrape extras).
    for (const key of [
      "approvedClaims",
      "prohibitedClaims",
      "requiredDisclaimers",
    ] as const) {
      if (!asStringList(enrichment.fields[key])?.length) {
        const fromTemplate = asStringList(template.fields[key]);
        if (fromTemplate?.length) {
          enrichment.fields[key] = fromTemplate;
          if (template.inferredKeys.includes(key)) {
            enrichment.inferredKeys.push(key);
          }
        }
      }
    }
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
        productCategories: asStringList(enrichment.fields.productCategories) ??
          input.preview.extras?.productCategories,
        approvedClaims:
          asStringList(enrichment.fields.approvedClaims) ??
          input.preview.extras?.approvedClaims,
        requiredDisclaimers:
          asStringList(enrichment.fields.requiredDisclaimers) ??
          input.preview.extras?.requiredDisclaimers,
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
  if (asStringList(f.productCategories)) out.productCategories = asStringList(f.productCategories);
  if (asString(f.targetCustomers)) out.targetCustomers = asString(f.targetCustomers);
  if (asString(f.brandVoice)) out.brandVoice = asString(f.brandVoice);
  if (asStringList(f.callsToAction)) out.callsToAction = asStringList(f.callsToAction);
  if (asString(f.currentOffers)) out.currentOffers = asString(f.currentOffers);
  return out;
}
