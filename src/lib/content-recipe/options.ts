/**
 * Progressive UI helpers — nextOptions(partial) returns only legal choices.
 */

import {
  CREATE_FOR_TO_AUDIENCES,
  CREATE_FOR_TO_TYPES,
  FUNNEL_TO_OBJECTIVES,
  LENGTH_BAND,
  TYPE_TO_CATEGORY,
  TYPE_TO_FAMILY,
  channelsForType,
  optimiseForForType,
  typeAllowedForCreateFor,
} from "./graph";
import type {
  AudienceTypeId,
  ContentCategoryId,
  ContentRecipePartial,
  ContentTypeId,
  CookFamilyId,
  CreateForId,
  DiscoveryTargetId,
  FunnelStageId,
  LengthId,
  ObjectiveId,
  OptimiseForId,
  RecipeChannelId,
  ToneId,
} from "./types";
import {
  CREATE_FOR_IDS,
  DISCOVERY_TARGET_IDS,
  FUNNEL_STAGE_IDS,
  TONE_IDS,
} from "./types";

export interface RecipeNextOptions {
  createFor: CreateForId[];
  contentTypes: ContentTypeId[];
  categories: ContentCategoryId[];
  channels: RecipeChannelId[];
  optimiseFor: OptimiseForId[];
  discoveryTargets: DiscoveryTargetId[];
  audienceTypes: AudienceTypeId[];
  funnelStages: FunnelStageId[];
  objectives: ObjectiveId[];
  tones: ToneId[];
  lengths: LengthId[];
  /** Derived family when contentType known; else null. */
  family: CookFamilyId | null;
  /** Human-readable empty-state when a step has zero options. */
  emptyReason?: string;
}

function uniqueCategories(types: readonly ContentTypeId[]): ContentCategoryId[] {
  const seen = new Set<ContentCategoryId>();
  const out: ContentCategoryId[] = [];
  for (const t of types) {
    const c = TYPE_TO_CATEGORY[t];
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

/**
 * Given a partial recipe, return legal options for the next composer steps.
 * Earlier axes filter later ones; missing createFor returns all createFor ids
 * and empty downstream lists (except tones which are always available).
 */
export function nextOptions(partial: ContentRecipePartial): RecipeNextOptions {
  const createForOpts = [...CREATE_FOR_IDS];
  const tones = [...TONE_IDS];
  const funnelStages = [...FUNNEL_STAGE_IDS];

  if (!partial.createFor) {
    return {
      createFor: createForOpts,
      contentTypes: [],
      categories: [],
      channels: [],
      optimiseFor: [],
      discoveryTargets: [],
      audienceTypes: [],
      funnelStages,
      objectives: [],
      tones,
      lengths: [],
      family: null,
      emptyReason: "Pick Create for to unlock content types.",
    };
  }

  const createFor = partial.createFor;
  let contentTypes = [...CREATE_FOR_TO_TYPES[createFor]];

  if (partial.category) {
    contentTypes = contentTypes.filter(
      (t) => TYPE_TO_CATEGORY[t] === partial.category,
    );
  }

  if (
    partial.contentType &&
    !typeAllowedForCreateFor(createFor, partial.contentType)
  ) {
    return {
      createFor: createForOpts,
      contentTypes,
      categories: uniqueCategories(CREATE_FOR_TO_TYPES[createFor]),
      channels: [],
      optimiseFor: [],
      discoveryTargets: [],
      audienceTypes: [...CREATE_FOR_TO_AUDIENCES[createFor]],
      funnelStages,
      objectives: partial.funnelStage
        ? [...FUNNEL_TO_OBJECTIVES[partial.funnelStage]]
        : [],
      tones,
      lengths: [],
      family: null,
      emptyReason: `Content type ${partial.contentType} is not available for ${createFor}.`,
    };
  }

  const type = partial.contentType;
  const family = type ? TYPE_TO_FAMILY[type] : null;
  const channels = type ? [...channelsForType(type)] : [];
  const selectedChannels =
    partial.channels?.filter((c) => channels.includes(c)) ?? [];

  const optimiseFor = type
    ? optimiseForForType(
        type,
        selectedChannels.length ? selectedChannels : channels,
      )
    : [];

  const needsDiscovery = (partial.optimiseFor ?? []).some(
    (o) =>
      o === "seo" ||
      o === "ai_discovery" ||
      o === "aeo" ||
      o === "geo" ||
      o === "llmo",
  );
  const discoveryTargets = needsDiscovery ? [...DISCOVERY_TARGET_IDS] : [];

  const audienceTypes = [...CREATE_FOR_TO_AUDIENCES[createFor]];
  const objectives = partial.funnelStage
    ? [...FUNNEL_TO_OBJECTIVES[partial.funnelStage]]
    : [];

  const lengths = family ? [...LENGTH_BAND[family]] : [];

  let emptyReason: string | undefined;
  if (type && channels.length === 0) {
    emptyReason = `No channels available for type ${type}.`;
  } else if (
    type &&
    partial.primaryChannel &&
    !channels.includes(partial.primaryChannel)
  ) {
    emptyReason = `Primary channel ${partial.primaryChannel} is not valid for ${type} — change type or channel.`;
  } else if (type && optimiseFor.length === 0) {
    emptyReason = `No optimise-for options for ${type} with current channels.`;
  }

  return {
    createFor: createForOpts,
    contentTypes,
    categories: uniqueCategories(CREATE_FOR_TO_TYPES[createFor]),
    channels,
    optimiseFor,
    discoveryTargets,
    audienceTypes,
    funnelStages,
    objectives,
    tones,
    lengths,
    family,
    emptyReason,
  };
}
