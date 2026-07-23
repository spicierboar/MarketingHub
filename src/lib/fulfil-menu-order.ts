/**
 * Fulfil an Extras catalogue (Add-ons → Buy) order:
 * MarketingRequest → AI draft → quality route → client Approvals →
 * schedule/post after approve only when applicable (never live-publish here).
 */

import { draftContent } from "@/lib/ai/draft";
import { assertAiBudget } from "@/lib/ai/budget";
import { checkCompliance, auditClaims } from "@/lib/ai/compliance";
import { recordAiUsage } from "@/lib/ai/metering";
import { logAction } from "@/lib/audit";
import { routeContent } from "@/lib/routing";
import { applyQualityRoutingAfterDraft } from "@/lib/managed-service/quality-routing";
import {
  serialiseBrief,
  validateContentRecipe,
  type ContentTypeId,
  type OptimiseForId,
  type RecipeChannelId,
} from "@/lib/content-recipe";
import {
  advanceRequest,
  createContent,
  createRequest,
  getCompany,
} from "@/lib/db";
import { assertAiRateLimit } from "@/lib/ratelimit";
import type { ClientMenuSku } from "@/lib/client-order-menu";
import { buildMenuOrderNotes } from "@/lib/client-order-menu";
import type {
  ActingUser,
  ClaimAuditEntry,
  GroundingLabel,
  RequestType,
} from "@/lib/types";

export type FulfilMenuOrderInput = {
  user: ActingUser;
  companyId: string;
  sku: ClientMenuSku;
  topic: string;
  /** Human-readable structured brief (client-facing display, request notes). */
  clientNotes?: string;
  /** Tightly structured [EXTRAS BRIEF] block for the drafting model — takes priority over clientNotes. */
  cookBrief?: string;
  preferredDate?: string;
  /** Absolute site origin for client approval links (APP_ORIGIN / request host). */
  origin?: string;
};

export type FulfilMenuOrderResult = {
  requestId: string;
  contentId?: string;
  draftStatus: "created" | "skipped" | "failed";
  draftDetail?: string;
};

export async function fulfilClientMenuOrder(
  input: FulfilMenuOrderInput,
): Promise<FulfilMenuOrderResult> {
  const { user, companyId, sku } = input;
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  const req = await createRequest({
    companyId,
    requesterId: user.id,
    requestType: sku.requestType,
    objective: `Extras: ${sku.title}`,
    platform: sku.primaryChannel,
    topic: input.topic,
    offer: `Extras · ${sku.title} · From $${sku.priceFromAud}`,
    preferredDate: input.preferredDate,
    urgency: "normal",
    notes: buildMenuOrderNotes({ sku, clientNotes: input.clientNotes }),
    consent: {
      customerNamed: false,
      customerInPhotos: false,
      consentObtained: false,
      mentionsPricing: false,
      mentionsOffer: false,
      performanceClaims: false,
    },
    uploads: [],
    assignedReviewerId: null,
  });

  await logAction(user, "menu_order.placed", {
    targetType: "request",
    targetId: req.id,
    companyId,
    detail: `${sku.id} · From $${sku.priceFromAud} · ${input.topic}`.slice(0, 200),
  });

  // Soft-skip draft when company not AI-ready — request still lands in Client asks.
  if (company.status !== "ai_ready" && company.status !== "approved") {
    return {
      requestId: req.id,
      draftStatus: "skipped",
      draftDetail: "Company not AI-ready — request queued for agency draft.",
    };
  }

  try {
    await assertAiBudget(user.tenantId);
    await assertAiRateLimit(user.tenantId);
  } catch (e) {
    return {
      requestId: req.id,
      draftStatus: "skipped",
      draftDetail: e instanceof Error ? e.message : "AI budget unavailable",
    };
  }

  const optimiseFor = (sku.optimiseFor ?? []) as OptimiseForId[];
  const discoveryNeeded = optimiseFor.some(
    (o) =>
      o === "seo" ||
      o === "ai_discovery" ||
      o === "aeo" ||
      o === "geo" ||
      o === "llmo",
  );

  const validated = validateContentRecipe({
    createFor: "client",
    contentType: sku.contentType as ContentTypeId,
    topic: input.topic,
    subject: { kind: "client", companyId },
    channels: [sku.primaryChannel as RecipeChannelId],
    primaryChannel: sku.primaryChannel as RecipeChannelId,
    optimiseFor: optimiseFor.length ? optimiseFor : undefined,
    discoveryTargets: discoveryNeeded
      ? optimiseFor.includes("aeo") ||
        optimiseFor.includes("geo") ||
        optimiseFor.includes("llmo") ||
        optimiseFor.includes("ai_discovery")
        ? ["ai_answers", "organic_search"]
        : ["organic_search"]
      : undefined,
    // cookBrief leads — it's the structured, machine-parseable brief the
    // model should ground on; clientNotes/dish line are supporting context.
    notes: [
      input.cookBrief?.trim(),
      `Extras dish: ${sku.dishLabel}`,
      input.clientNotes?.trim(),
    ]
      .filter(Boolean)
      .join("\n\n"),
  });

  if (!validated.ok || !validated.recipe) {
    const msg =
      validated.issues.map((i) => i.message).join("; ") ||
      "Recipe validation failed";
    await logAction(user, "menu_order.draft_failed", {
      targetType: "request",
      targetId: req.id,
      companyId,
      detail: msg.slice(0, 200),
    });
    return { requestId: req.id, draftStatus: "failed", draftDetail: msg };
  }

  const recipe = validated.recipe;
  const brief = serialiseBrief(recipe);

  try {
    await advanceRequest(req.id, "ai_drafting", user.id);
    const draft = await draftContent({
      company,
      // Brand & motion creative jobs (logo/GIF/animation) draft as creative briefs;
      // short ads / films stay video scripts. Recipe type remains video_script for legality.
      requestType:
        sku.categoryId === "brand_motion" && sku.requestType === "creative_request"
          ? "creative_request"
          : (recipe.contentType as RequestType),
      topic: recipe.topic,
      objective: brief,
      platform: recipe.primaryChannel,
      notes: [
        sku.categoryId === "brand_motion"
          ? "STUDIO FULFILMENT: Deliver creative brief/script now. Final rendered file (logo/GIF/MP4/animation) is produced after client approval — do not claim the finished visual is attached yet."
          : null,
        recipe.notes,
      ]
        .filter(Boolean)
        .join("\n\n"),
      dishLabel: sku.dishLabel,
      cookFamily: sku.cookFamily || recipe.family,
      optimiseFor: recipe.optimiseFor,
      briefMode: sku.contentType === "landing_page" && /brief/i.test(sku.dishLabel),
    });

    const compliance = await checkCompliance(draft.body, company);
    const claimAudit = await auditClaims(draft.body, company);
    const groundingLabel: GroundingLabel = claimAudit.some(
      (c: ClaimAuditEntry) => c.status === "unsupported",
    )
      ? "requires_evidence"
      : draft.sourceRefs.length > 0
        ? "grounded"
        : "suggested_by_ai";
    const routedTo = routeContent({
      type: recipe.contentType as RequestType,
      compliance,
      claimAudit,
    });

    const sourcesUsed = [
      ...draft.sources,
      `Extras: ${sku.dishLabel}`,
      `recipe:${recipe.family}/${recipe.contentType}`,
      sku.categoryId === "brand_motion"
        ? "pipeline:studio_fulfilment"
        : "pipeline:extras_buy",
    ];
    const aiRun = await recordAiUsage({
      tenantId: user.tenantId,
      companyId,
      userId: user.id,
      kind: "content_draft",
      model: draft.model,
      promptSummary: `Extras · ${sku.dishLabel}`.slice(0, 120),
      outputChars: draft.body.length,
      sourcesUsed,
      contextChars: draft.body.length + brief.length,
    });

    const content = await createContent({
      companyId,
      requestId: req.id,
      type: recipe.contentType as RequestType,
      title: draft.title,
      body: draft.body,
      status: "ai_draft",
      createdById: user.id,
      compliance,
      claimAudit,
      routedTo,
      groundingLabel,
      sourceRefs: draft.sourceRefs,
      brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
      aiModel: draft.model,
      aiPrompt: brief.slice(0, 2000),
      sourcesUsed,
      aiRunId: aiRun.id,
      estCostUsd: aiRun.estCostUsd,
      recipe,
    });

    await advanceRequest(
      req.id,
      "draft_ready",
      user.id,
      `Extras draft ${content.id} created`,
    );
    await logAction(user, "content.ai_drafted", {
      targetType: "content",
      targetId: content.id,
      companyId,
      detail: `Extras · ${recipe.family}/${sku.dishLabel} · risk ${compliance.riskLevel}`,
    });

    // Same gate as Hub / promo / custom: generate → quality route → client Approvals
    // (auto-submit never publishes; schedule/post runs only after client approve when applicable).
    try {
      await applyQualityRoutingAfterDraft({
        contentId: content.id,
        actor: user,
        origin: input.origin?.trim() || "http://localhost:3000",
        platform: sku.primaryChannel,
        clientEmail: user.email,
      });
    } catch (err) {
      console.error("quality routing after extras menu order", err);
    }

    return {
      requestId: req.id,
      contentId: content.id,
      draftStatus: "created",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Draft failed";
    await logAction(user, "menu_order.draft_failed", {
      targetType: "request",
      targetId: req.id,
      companyId,
      detail: msg.slice(0, 200),
    });
    return { requestId: req.id, draftStatus: "failed", draftDetail: msg };
  }
}
