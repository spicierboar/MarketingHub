/**
 * Derive family + defaults from partial recipe input (design §4 derived fields).
 */

import {
  CHANNEL_LENGTH_HINT,
  CREATE_FOR_TO_AUDIENCES,
  FAMILY_DEFAULT_COMPONENTS,
  FAMILY_DEFAULT_LENGTH,
  FAMILY_DEFAULT_STRUCTURE,
  FUNNEL_TO_OBJECTIVES,
  TYPE_TO_CATEGORY,
  TYPE_TO_FAMILY,
  channelsForType,
  optimiseForForType,
  typeAllowedForCreateFor,
} from "./graph";
import type {
  BrandControlFlags,
  ComplianceFlags,
  ContentRecipe,
  ContentRecipePartial,
  ContentTypeId,
  CookFamilyId,
  CreateForId,
  LengthId,
  OutputOptions,
  RecipeSubject,
  RestrictedFlags,
} from "./types";

const DEFAULT_BRAND: BrandControlFlags = {
  useBrandVoice: true,
  useApprovedClaimsOnly: true,
  useApprovedOffersOnly: true,
};

const DEFAULT_RESTRICTED: RestrictedFlags = {
  noInventedStats: true,
  noMedicalAdvice: true,
  noGuaranteedResults: true,
};

const DEFAULT_OUTPUT: OutputOptions = { mode: "single_draft" };

function defaultCompliance(family: CookFamilyId): ComplianceFlags {
  const highRisk = family === "ad" || family === "sales_doc";
  return {
    humanReviewRequired: highRisk,
    performanceClaimsAllowed: false,
    customerNamedRequiresConsent: true,
  };
}

function defaultSubject(createFor: CreateForId): RecipeSubject {
  if (createFor === "client") return { kind: "client", companyId: "" };
  if (createFor === "industry") return { kind: "industry", industryId: "" };
  return { kind: "general" };
}

function defaultLength(
  family: CookFamilyId,
  primaryChannel?: string,
): LengthId {
  if (primaryChannel && CHANNEL_LENGTH_HINT[primaryChannel as never]) {
    // Prefer channel hint for short_social / email when present
    if (family === "short_social" || family === "email") {
      return CHANNEL_LENGTH_HINT[primaryChannel as never]!;
    }
  }
  return FAMILY_DEFAULT_LENGTH[family];
}

export interface DerivedRecipeFields {
  family: CookFamilyId;
  category: ContentRecipe["category"];
  length: LengthId;
  structure?: ContentRecipe["structure"];
  requiredComponents: ContentRecipe["requiredComponents"];
  brandControls: BrandControlFlags;
  compliance: ComplianceFlags;
  restricted: RestrictedFlags;
  evidence: ContentRecipe["evidence"];
  /** Suggested (not forced) when missing on partial. */
  suggested: {
    channels: ContentRecipe["channels"];
    primaryChannel?: ContentRecipe["primaryChannel"];
    optimiseFor: ContentRecipe["optimiseFor"];
    audienceType?: ContentRecipe["audience"]["type"];
    funnelStage: ContentRecipe["funnelStage"];
    objective: ContentRecipe["objective"];
    tone: ContentRecipe["tone"];
    output: OutputOptions;
  };
}

/**
 * Derive cook family + defaults from a partial. Throws if contentType missing
 * or incompatible with createFor when both present.
 */
export function deriveFromPartial(
  partial: ContentRecipePartial,
): DerivedRecipeFields {
  const type = partial.contentType;
  if (!type) {
    throw new Error("contentType is required to derive family");
  }

  const createFor = partial.createFor;
  if (createFor && !typeAllowedForCreateFor(createFor, type)) {
    throw new Error(
      `contentType ${type} is not allowed for createFor ${createFor}`,
    );
  }

  const family = TYPE_TO_FAMILY[type as ContentTypeId];
  const category = TYPE_TO_CATEGORY[type as ContentTypeId];
  const allowedChannels = channelsForType(type as ContentTypeId);
  const primary =
    partial.primaryChannel &&
    allowedChannels.includes(partial.primaryChannel)
      ? partial.primaryChannel
      : allowedChannels[0];

  const length =
    partial.length ?? defaultLength(family, primary);

  const funnelStage = partial.funnelStage ?? "consideration";
  const objectives = FUNNEL_TO_OBJECTIVES[funnelStage];
  const objective =
    partial.objective && objectives.includes(partial.objective)
      ? partial.objective
      : objectives[0];

  const audiences = createFor
    ? CREATE_FOR_TO_AUDIENCES[createFor]
    : CREATE_FOR_TO_AUDIENCES.client;

  return {
    family,
    category,
    length,
    structure: partial.structure ?? FAMILY_DEFAULT_STRUCTURE[family],
    requiredComponents: [
      ...(partial.requiredComponents ?? FAMILY_DEFAULT_COMPONENTS[family]),
    ],
    brandControls: { ...DEFAULT_BRAND, ...partial.brandControls },
    compliance: {
      ...defaultCompliance(family),
      ...partial.compliance,
    },
    restricted: { ...DEFAULT_RESTRICTED, ...partial.restricted },
    evidence: partial.evidence ?? "brand_sources",
    suggested: {
      channels: partial.channels?.length
        ? [...partial.channels]
        : primary
          ? [primary]
          : [],
      primaryChannel: primary,
      optimiseFor: partial.optimiseFor?.length
        ? [...partial.optimiseFor]
        : (() => {
            const opts = optimiseForForType(
              type as ContentTypeId,
              partial.channels ?? (primary ? [primary] : undefined),
            );
            return opts[0] ? [opts[0]] : [];
          })(),
      audienceType: partial.audience?.type ?? audiences[0],
      funnelStage,
      objective,
      tone: partial.tone ?? "brand_default",
      output: partial.output ?? DEFAULT_OUTPUT,
    },
  };
}

/**
 * Fill derived + missing defaults into a nearly-complete partial.
 * Does not validate legality — call validate/parse after.
 */
export function applyDefaults(
  partial: ContentRecipePartial & {
    createFor: CreateForId;
    contentType: ContentTypeId;
    topic: string;
  },
): ContentRecipe {
  const d = deriveFromPartial(partial);
  const subject =
    partial.subject ?? defaultSubject(partial.createFor);

  const channels =
    partial.channels?.length
      ? [...partial.channels]
      : d.suggested.channels;
  const primaryChannel =
    partial.primaryChannel && channels.includes(partial.primaryChannel)
      ? partial.primaryChannel
      : (d.suggested.primaryChannel ?? channels[0]);

  const discoveryNeeded = (partial.optimiseFor ?? d.suggested.optimiseFor).some(
    (o) => o === "seo" || o === "ai_discovery",
  );

  return {
    schemaVersion: "1.1",
    createFor: partial.createFor,
    subject,
    category: d.category,
    contentType: partial.contentType,
    family: d.family,
    channels,
    primaryChannel: primaryChannel!,
    objective: partial.objective ?? d.suggested.objective,
    audience: {
      type: partial.audience?.type ?? d.suggested.audienceType!,
      awareness: partial.audience?.awareness,
      decisionRole: partial.audience?.decisionRole,
    },
    funnelStage: partial.funnelStage ?? d.suggested.funnelStage,
    optimiseFor: partial.optimiseFor?.length
      ? [...partial.optimiseFor]
      : [...d.suggested.optimiseFor],
    discoveryTargets: discoveryNeeded
      ? partial.discoveryTargets ?? ["organic_search"]
      : partial.discoveryTargets,
    tone: partial.tone ?? d.suggested.tone,
    length: partial.length ?? d.length,
    structure: partial.structure ?? d.structure,
    requiredComponents: d.requiredComponents,
    evidence: d.evidence,
    brandControls: d.brandControls,
    compliance: d.compliance,
    restricted: d.restricted,
    output: partial.output ?? d.suggested.output,
    topic: partial.topic,
    notes: partial.notes,
  };
}
