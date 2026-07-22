/** ContentRecipe V1.1 — barrel export (design §12). */

export * from "./types";
export {
  TYPE_TO_CATEGORY,
  TYPE_TO_FAMILY,
  CREATE_FOR_TO_TYPES,
  FAMILY_TO_CHANNELS,
  CREATE_FOR_TO_AUDIENCES,
  FUNNEL_TO_OBJECTIVES,
  FAMILY_DEFAULT_LENGTH,
  LENGTH_BAND,
  FAMILY_DEFAULT_STRUCTURE,
  FAMILY_DEFAULT_COMPONENTS,
  CHANNEL_LENGTH_HINT,
  channelsForType,
  optimiseForForType,
  typeAllowedForCreateFor,
  channelAllowedForType,
  optimiseAllowed,
  isKnownCreateFor,
  isKnownContentType,
  isKnownChannel,
  isKnownFamily,
  isKnownOptimise,
  isKnownFunnel,
  isKnownObjective,
} from "./graph";
export { deriveFromPartial, applyDefaults } from "./derive";
export type { DerivedRecipeFields } from "./derive";

import { TYPE_TO_FAMILY } from "./graph";
import type { ContentTypeId, CookFamilyId } from "./types";

/** Engine cook-module key for a V1 content type (derived, never free-picked). */
export function deriveFamily(contentType: ContentTypeId): CookFamilyId {
  return TYPE_TO_FAMILY[contentType];
}

export {
  ContentRecipeSchema,
  parseContentRecipe,
  validateContentRecipe,
  assertContentRecipe,
  parseContentRecipe as parse,
  validateContentRecipe as validate,
} from "./validate";
export { serialiseBrief } from "./serialise-brief";
export { nextOptions } from "./options";
export type { RecipeNextOptions } from "./options";
export { runGoldens } from "./run-goldens";
export type { GoldenRunResult } from "./run-goldens";
