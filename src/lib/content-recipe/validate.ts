/**
 * Zod ContentRecipeSchema + illegal-combo superRefine (design §§6, 8.2).
 */

import { z } from "zod";
import {
  CHANNEL_LENGTH_HINT,
  CREATE_FOR_TO_AUDIENCES,
  FAMILY_DEFAULT_LENGTH,
  FUNNEL_TO_OBJECTIVES,
  LENGTH_BAND,
  TYPE_TO_CATEGORY,
  TYPE_TO_FAMILY,
  channelAllowedForType,
  channelsForType,
  optimiseAllowed,
  typeAllowedForCreateFor,
} from "./graph";
import { applyDefaults } from "./derive";
import type {
  ContentRecipe,
  ContentRecipePartial,
  ContentTypeId,
  CreateForId,
  RecipeErrorCode,
  RecipeIssue,
  RecipeValidationResult,
} from "./types";
import {
  AWARENESS_IDS,
  AUDIENCE_TYPE_IDS,
  COMPONENT_IDS,
  CONTENT_CATEGORY_IDS,
  CONTENT_TYPE_IDS,
  COOK_FAMILY_IDS,
  CREATE_FOR_IDS,
  DECISION_ROLE_IDS,
  DISCOVERY_TARGET_IDS,
  EVIDENCE_POLICY_IDS,
  FUNNEL_STAGE_IDS,
  LENGTH_IDS,
  OBJECTIVE_IDS,
  OPTIMISE_FOR_IDS,
  RECIPE_CHANNEL_IDS,
  STRUCTURE_IDS,
  TONE_IDS,
} from "./types";

const SubjectSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("client"),
      companyId: z.string().trim().min(1).max(200),
    })
    .strict(),
  z
    .object({
      kind: z.literal("industry"),
      industryId: z.string().trim().min(1).max(200),
    })
    .strict(),
  z.object({ kind: z.literal("general") }).strict(),
]);

export const ContentRecipeSchema = z
  .object({
    schemaVersion: z.literal("1.1"),
    createFor: z.enum(CREATE_FOR_IDS),
    subject: SubjectSchema,
    category: z.enum(CONTENT_CATEGORY_IDS),
    contentType: z.enum(CONTENT_TYPE_IDS),
    family: z.enum(COOK_FAMILY_IDS),
    channels: z.array(z.enum(RECIPE_CHANNEL_IDS)).min(1).max(20),
    primaryChannel: z.enum(RECIPE_CHANNEL_IDS),
    objective: z.enum(OBJECTIVE_IDS),
    audience: z
      .object({
        type: z.enum(AUDIENCE_TYPE_IDS),
        awareness: z.enum(AWARENESS_IDS).optional(),
        decisionRole: z.enum(DECISION_ROLE_IDS).optional(),
      })
      .strict(),
    funnelStage: z.enum(FUNNEL_STAGE_IDS),
    optimiseFor: z.array(z.enum(OPTIMISE_FOR_IDS)).min(1).max(10),
    discoveryTargets: z.array(z.enum(DISCOVERY_TARGET_IDS)).max(10).optional(),
    tone: z.enum(TONE_IDS),
    length: z.enum(LENGTH_IDS),
    structure: z.enum(STRUCTURE_IDS).optional(),
    requiredComponents: z.array(z.enum(COMPONENT_IDS)).max(20),
    evidence: z.enum(EVIDENCE_POLICY_IDS),
    brandControls: z
      .object({
        useBrandVoice: z.boolean(),
        useApprovedClaimsOnly: z.boolean(),
        useApprovedOffersOnly: z.boolean(),
      })
      .strict(),
    compliance: z
      .object({
        humanReviewRequired: z.boolean(),
        performanceClaimsAllowed: z.boolean(),
        customerNamedRequiresConsent: z.boolean(),
      })
      .strict(),
    restricted: z
      .object({
        noInventedStats: z.boolean(),
        noMedicalAdvice: z.boolean(),
        noGuaranteedResults: z.boolean(),
      })
      .strict(),
    output: z
      .object({
        mode: z.enum(["single_draft", "variants"]),
        variantCount: z.number().int().min(2).max(10).optional(),
      })
      .strict(),
    topic: z.string().trim().min(1).max(500),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .superRefine((recipe, ctx) => {
    const add = (
      code: RecipeErrorCode,
      message: string,
      path?: (string | number)[],
    ) => {
      ctx.addIssue({
        code: "custom",
        message: `${code}: ${message}`,
        path: path ?? [],
        params: { recipeCode: code },
      });
    };

    // Subject ↔ createFor
    if (recipe.createFor === "client" && recipe.subject.kind !== "client") {
      add(
        "RECIPE_INCOMPATIBLE",
        "createFor client requires subject.kind client",
        ["subject"],
      );
    }
    if (recipe.createFor === "industry" && recipe.subject.kind !== "industry") {
      add(
        "RECIPE_INCOMPATIBLE",
        "createFor industry requires subject.kind industry",
        ["subject"],
      );
    }
    if (recipe.createFor === "general" && recipe.subject.kind !== "general") {
      add(
        "RECIPE_INCOMPATIBLE",
        "createFor general requires subject.kind general",
        ["subject"],
      );
    }

    // createFor → type
    if (!typeAllowedForCreateFor(recipe.createFor, recipe.contentType)) {
      add(
        "RECIPE_INCOMPATIBLE",
        `contentType ${recipe.contentType} not allowed for createFor ${recipe.createFor}`,
        ["contentType"],
      );
    }

    // category / family derived consistency
    const expectedFamily = TYPE_TO_FAMILY[recipe.contentType];
    const expectedCategory = TYPE_TO_CATEGORY[recipe.contentType];
    if (recipe.family !== expectedFamily) {
      add(
        "FAMILY_UNSUPPORTED",
        `family must be ${expectedFamily} for ${recipe.contentType}, got ${recipe.family}`,
        ["family"],
      );
    }
    if (recipe.category !== expectedCategory) {
      add(
        "RECIPE_INCOMPATIBLE",
        `category must be ${expectedCategory} for ${recipe.contentType}`,
        ["category"],
      );
    }

    // channels unique
    if (new Set(recipe.channels).size !== recipe.channels.length) {
      add("CHANNEL_MISMATCH", "channels must be unique", ["channels"]);
    }

    // primary ∈ channels
    if (!recipe.channels.includes(recipe.primaryChannel)) {
      add(
        "CHANNEL_MISMATCH",
        "primaryChannel must be included in channels",
        ["primaryChannel"],
      );
    }

    // type → channels
    for (const ch of recipe.channels) {
      if (!channelAllowedForType(recipe.contentType, ch)) {
        add(
          "CHANNEL_MISMATCH",
          `channel ${ch} not allowed for ${recipe.contentType}`,
          ["channels"],
        );
      }
    }

    // optimise-for
    for (const opt of recipe.optimiseFor) {
      if (!optimiseAllowed(recipe.contentType, opt, recipe.channels)) {
        add(
          "RECIPE_INCOMPATIBLE",
          `optimiseFor ${opt} not allowed for ${recipe.contentType} / channels`,
          ["optimiseFor"],
        );
      }
    }

    // discovery targets required when seo | ai_discovery
    const needsDiscovery = recipe.optimiseFor.some(
      (o) => o === "seo" || o === "ai_discovery",
    );
    if (needsDiscovery && (!recipe.discoveryTargets || recipe.discoveryTargets.length === 0)) {
      add(
        "RECIPE_INCOMPATIBLE",
        "discoveryTargets required when optimiseFor includes seo or ai_discovery",
        ["discoveryTargets"],
      );
    }
    if (
      !needsDiscovery &&
      recipe.discoveryTargets &&
      recipe.discoveryTargets.length > 0
    ) {
      add(
        "RECIPE_INCOMPATIBLE",
        "discoveryTargets only allowed with seo or ai_discovery",
        ["discoveryTargets"],
      );
    }

    // audience × createFor
    const allowedAud = CREATE_FOR_TO_AUDIENCES[recipe.createFor];
    if (!allowedAud.includes(recipe.audience.type)) {
      add(
        "RECIPE_INCOMPATIBLE",
        `audience.type ${recipe.audience.type} not allowed for createFor ${recipe.createFor}`,
        ["audience", "type"],
      );
    }
    // Internal-only audience + client + public social
    if (
      recipe.audience.type === "employees" &&
      recipe.createFor === "client"
    ) {
      add(
        "RECIPE_INCOMPATIBLE",
        "employees audience incompatible with client createFor",
        ["audience", "type"],
      );
    }

    // funnel × objective
    const objs = FUNNEL_TO_OBJECTIVES[recipe.funnelStage];
    if (!objs.includes(recipe.objective)) {
      add(
        "RECIPE_INCOMPATIBLE",
        `objective ${recipe.objective} not allowed for funnel ${recipe.funnelStage}`,
        ["objective"],
      );
    }

    // length band
    const band = LENGTH_BAND[recipe.family];
    if (!band.includes(recipe.length)) {
      add(
        "RECIPE_INCOMPATIBLE",
        `length ${recipe.length} outside band for family ${recipe.family}`,
        ["length"],
      );
    }

    // evidence vs AI discovery / GEO claims
    if (
      recipe.optimiseFor.includes("ai_discovery") &&
      recipe.evidence === "no_sources"
    ) {
      add(
        "RECIPE_INCOMPATIBLE",
        "ai_discovery requires evidence other than no_sources",
        ["evidence"],
      );
    }

    // output variants
    if (recipe.output.mode === "variants" && !recipe.output.variantCount) {
      add(
        "RECIPE_INCOMPATIBLE",
        "variantCount required when output.mode is variants",
        ["output", "variantCount"],
      );
    }
    if (recipe.output.mode === "single_draft" && recipe.output.variantCount) {
      add(
        "RECIPE_INCOMPATIBLE",
        "variantCount not allowed for single_draft",
        ["output", "variantCount"],
      );
    }

    // Compliance: high-risk families should flag human review (soft warn as block if false for ad performance)
    if (
      recipe.family === "ad" &&
      recipe.compliance.performanceClaimsAllowed &&
      !recipe.compliance.humanReviewRequired
    ) {
      add(
        "COMPLIANCE_BLOCK",
        "performance-claim ads require humanReviewRequired",
        ["compliance"],
      );
    }
  });

function issuesFromZod(err: z.ZodError): RecipeIssue[] {
  return err.issues.map((issue) => {
    const raw = issue.message ?? "invalid";
    const codeMatch = raw.match(
      /^(RECIPE_INCOMPATIBLE|CHANNEL_MISMATCH|FAMILY_UNSUPPORTED|COMPLIANCE_BLOCK|RECIPE_INVALID):/,
    );
    const code = (codeMatch?.[1] ??
      (issue.path.length ? "RECIPE_INCOMPATIBLE" : "RECIPE_INVALID")) as RecipeErrorCode;
    const message = codeMatch ? raw.slice(codeMatch[0].length).trim() : raw;
    return {
      code,
      path: issue.path as (string | number)[],
      message: message || raw,
    };
  });
}

/** Parse unknown input; returns issues on failure. */
export function parseContentRecipe(input: unknown): RecipeValidationResult {
  const parsed = ContentRecipeSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, recipe: parsed.data as ContentRecipe, issues: [] };
  }
  return { ok: false, issues: issuesFromZod(parsed.error) };
}

/**
 * Validate a partial by applying defaults then parsing.
 * Useful for composer submit paths.
 */
export function validateContentRecipe(
  partial: ContentRecipePartial & {
    createFor: CreateForId;
    contentType: ContentTypeId;
    topic: string;
  },
): RecipeValidationResult {
  try {
    const recipe = applyDefaults(partial);
    return parseContentRecipe(recipe);
  } catch (e) {
    return {
      ok: false,
      issues: [
        {
          code: "RECIPE_INCOMPATIBLE",
          message: e instanceof Error ? e.message : String(e),
        },
      ],
    };
  }
}

/** Assert parse or throw with first issue. */
export function assertContentRecipe(input: unknown): ContentRecipe {
  const result = parseContentRecipe(input);
  if (!result.ok || !result.recipe) {
    const first = result.issues[0];
    const err = new Error(
      first
        ? `${first.code}: ${first.message}`
        : "RECIPE_INVALID: unknown validation failure",
    );
    (err as Error & { issues: RecipeIssue[] }).issues = result.issues;
    throw err;
  }
  return result.recipe;
}

/** Re-export length helpers used by options. */
export { FAMILY_DEFAULT_LENGTH, CHANNEL_LENGTH_HINT, channelsForType };
