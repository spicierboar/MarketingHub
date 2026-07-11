"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  createContent,
  createPromptTemplate,
  getCompany,
  getContent,
} from "@/lib/db";
import { assertCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { draftContent } from "@/lib/ai/draft";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { duplicateWarning } from "@/lib/ai/similarity";
import { assertAiBudget } from "@/lib/ai/budget";
import { recordAiUsage } from "@/lib/ai/metering";
import { assertAiRateLimit } from "@/lib/ratelimit";
import { applyQualityRoutingAfterDraft } from "@/lib/managed-service/quality-routing";
import { resolveOrigin } from "@/lib/origin";
import {
  canRepurposeSource,
  normalizePlatformKey,
  repurposeForPlatforms,
  V1_REPURPOSE_PLATFORMS,
} from "@/lib/content-repurposing";
import { id } from "@/lib/utils";
import type { DraftTone, GroundingLabel, RepurposePlatform, RequestType } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  return resolveOrigin((k) => h.get(k));
}

// Content Studio (Phase 5): direct generation of any content type, with
// optional 3-variant draft comparison (§24) and reusable prompt templates.
export async function generateStudioDraftAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  if (company.status !== "ai_ready" && company.status !== "approved") {
    throw new Error("Company is not AI-ready. Complete onboarding first.");
  }
  await assertAiBudget(user.tenantId);

  const rawType = text(formData, "contentType");
  const briefMode = rawType === "landing_page_brief";
  const contentType = (briefMode ? "landing_page" : rawType) as RequestType;
  const topic = text(formData, "topic");
  const objective = text(formData, "objective");
  if (!topic || !objective) throw new Error("Topic and objective are required");
  const audience = text(formData, "audience") || undefined;
  const channel = text(formData, "channel") || undefined;
  const tone = (text(formData, "tone") || "brand_default") as DraftTone;
  const compare = formData.get("compare") === "on";

  // Save as reusable prompt template if requested.
  if (formData.get("saveTemplate") === "on") {
    const name = text(formData, "templateName") || `${topic} (${contentType})`;
    await createPromptTemplate({
      tenantId: user.tenantId,
      companyId,
      name,
      contentType,
      topic,
      objective,
      audience,
      channel,
      tone,
      active: true,
      createdById: user.id,
    });
    await logAction(user, "template.saved", {
      targetType: "prompt_template",
      companyId,
      detail: name,
    });
  }

  // Draft comparison (§24): the chosen tone plus two contrasting variants —
  // always 3 total, whichever tone was chosen.
  const CONTRAST_POOL: DraftTone[] = [
    "professional",
    "short_punchy",
    "friendly",
    "urgent",
  ];
  const tones: { tone: DraftTone; label: string }[] = compare
    ? [
        { tone, label: titleFor(tone) },
        ...CONTRAST_POOL.filter((t) => t !== tone)
          .slice(0, 2)
          .map((t) => ({ tone: t, label: titleFor(t) })),
      ]
    : [{ tone, label: titleFor(tone) }];

  // Charge the per-tenant burst limiter for EVERY generation this action runs
  // (compare mode makes 3), atomically before any of them — a single hit per
  // action would let a tenant exceed the plan's AI-per-minute ceiling ~3x.
  await assertAiRateLimit(user.tenantId, tones.length);

  const variantGroupId = tones.length > 1 ? id("vg") : null;
  let firstId: string | null = null;
  const origin = await requestOrigin();

  for (const v of tones) {
    const draft = await draftContent({
      company,
      requestType: contentType,
      topic,
      objective,
      platform: channel,
      audience,
      tone: v.tone,
      briefMode,
    });
    const compliance = await checkCompliance(draft.body, company);
    const claimAudit = await auditClaims(draft.body, company);
    const groundingLabel: GroundingLabel = claimAudit.some(
      (c) => c.status === "unsupported",
    )
      ? "requires_evidence"
      : draft.sourceRefs.length > 0
        ? "grounded"
        : "suggested_by_ai";

    const dupWarn = await duplicateWarning(companyId, draft.body, {
      excludeGroupId: variantGroupId,
    });
    const aiRun = await recordAiUsage({
      tenantId: user.tenantId,
      companyId,
      userId: user.id,
      kind: "content_draft",
      model: draft.model,
      promptSummary: `${topic} [${v.label}]`.slice(0, 120),
      outputChars: draft.body.length,
      sourcesUsed: draft.sources,
      contextChars: draft.body.length + objective.length,
    });

    const content = await createContent({
      companyId,
      requestId: null,
      type: contentType,
      title:
        tones.length > 1 ? `${draft.title} [${v.label}]` : draft.title,
      body: draft.body,
      status: "ai_draft",
      createdById: user.id,
      compliance,
      claimAudit,
      groundingLabel,
      sourceRefs: draft.sourceRefs,
      brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
      aiModel: draft.model,
      aiPrompt: `${objective} — ${topic} [${v.label}]`,
      sourcesUsed: draft.sources,
      variantGroupId,
      variantLabel: v.label,
      duplicateWarning: dupWarn,
      aiRunId: aiRun.id,
      estCostUsd: aiRun.estCostUsd,
    });
    if (!firstId) firstId = content.id;

    await logAction(user, "content.ai_drafted", {
      targetType: "content",
      targetId: content.id,
      companyId,
      detail: `Studio · ${contentType} · ${v.label} · risk ${compliance.riskLevel}`,
    });

    try {
      await applyQualityRoutingAfterDraft({
        contentId: content.id,
        actor: user,
        origin,
        platform: channel || "facebook",
      });
    } catch (err) {
      // Draft is saved; routing failure must not lose the generation.
      console.error("quality routing after studio draft", err);
    }
  }

  redirect(`/content/${firstId}`);
}

function titleFor(tone: DraftTone): string {
  const map: Record<DraftTone, string> = {
    brand_default: "Brand voice",
    friendly: "Friendly",
    professional: "Professional",
    urgent: "Urgent",
    short_punchy: "Short & punchy",
  };
  return map[tone];
}

// Repurpose one source content item into v1 platform variants (FB/IG/GBP/TikTok).
// Creates linked child content rows — ai_draft only, never auto-published.
export async function repurposeForPlatformsAction(formData: FormData) {
  const sourceId = text(formData, "sourceContentId");
  if (!sourceId) throw new Error("Source content is required");

  const source = await getContent(sourceId);
  if (!source) throw new Error("Source content not found");

  const user = await assertCompanyAccess(source.companyId);
  const company = await getCompany(source.companyId);
  if (!company) throw new Error("Company not found");
  if (company.status !== "ai_ready" && company.status !== "approved") {
    throw new Error("Company is not AI-ready. Complete onboarding first.");
  }
  if (!canRepurposeSource(source)) {
    throw new Error(
      "Only draft or approved content can be repurposed for platforms (not published, archived, or rejected).",
    );
  }

  const rawPlatforms = formData.getAll("platforms").map(String).filter(Boolean);
  const platforms = rawPlatforms
    .map((p) => normalizePlatformKey(p) ?? (V1_REPURPOSE_PLATFORMS.includes(p as RepurposePlatform) ? (p as RepurposePlatform) : null))
    .filter((p): p is RepurposePlatform => p !== null);
  if (platforms.length === 0) {
    throw new Error("Select at least one platform (Facebook, Instagram, Google Business Profile, or TikTok).");
  }

  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId, platforms.length);

  const variants = await repurposeForPlatforms({ company, source, platforms });
  const variantGroupId = variants.length > 1 ? id("rp") : null;
  let firstId: string | null = null;

  for (const v of variants) {
    const compliance = await checkCompliance(v.body, company);
    const claimAudit = await auditClaims(v.body, company);
    const groundingLabel: GroundingLabel = claimAudit.some(
      (c) => c.status === "unsupported",
    )
      ? "requires_evidence"
      : v.sourceRefs.length > 0
        ? "grounded"
        : "suggested_by_ai";

    const dupWarn = await duplicateWarning(company.id, v.body, {
      excludeGroupId: variantGroupId,
    });
    const aiRun = await recordAiUsage({
      tenantId: user.tenantId,
      companyId: company.id,
      userId: user.id,
      kind: "content_draft",
      model: v.model,
      promptSummary: `Repurpose → ${v.platform}: ${source.title}`.slice(0, 120),
      outputChars: v.body.length,
      sourcesUsed: v.sources,
      contextChars: v.body.length + source.body.length,
    });

    const created = await createContent({
      companyId: company.id,
      requestId: source.requestId ?? null,
      type: "social_post",
      title: v.title,
      body: v.body,
      status: "ai_draft",
      createdById: user.id,
      compliance,
      claimAudit,
      groundingLabel,
      sourceRefs: v.sourceRefs,
      brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
      aiModel: v.model,
      aiPrompt: `Repurpose for ${v.platform} — ${v.formatHint}`,
      sourcesUsed: v.sources,
      repurposedFromId: source.id,
      variantGroupId,
      variantLabel: v.platform,
      duplicateWarning: dupWarn,
      aiRunId: aiRun.id,
      estCostUsd: aiRun.estCostUsd,
    });
    if (!firstId) firstId = created.id;

    await logAction(user, "content.repurposed", {
      targetType: "content",
      targetId: created.id,
      companyId: company.id,
      detail: `platform ${v.platform} from ${source.id}`,
    });
  }

  redirect(`/content/${firstId}`);
}
