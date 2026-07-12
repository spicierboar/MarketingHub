"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createContent,
  createPhotoShoot,
  getCompany,
  getContent,
  getPhotoShoot,
  getTenant,
  updatePhotoShoot,
} from "@/lib/db";
import { assertCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { assertAiBudget } from "@/lib/ai/budget";
import { recordAiUsage } from "@/lib/ai/metering";
import { assertAiRateLimit } from "@/lib/ratelimit";
import { assertCompanyAddon } from "@/lib/entitlements";
import { assertVisualsGeneration } from "@/lib/visuals-allowance";
import { generateImage } from "@/lib/ai/imagegen";
import { generateVideo } from "@/lib/ai/videogen";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { routeContent } from "@/lib/routing";
import { persistGeneratedAsset } from "@/lib/visuals";
import {
  ALL_VIDEO_CHANNELS,
  buildChannelVariants,
  buildScriptFromPack,
  getScriptPack,
  getVideoTemplate,
} from "@/lib/video-studio";
import type { VideoStudioChannel, VideoStudioTemplateId } from "@/lib/types";
import {
  assertPhotoShootTransition,
  photoShootStatusLabel,
} from "@/lib/photo-shoot";
import { tryReleasePhotographerPayout } from "@/lib/photo-marketplace";
import type { PhotoShootStatus } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}
function lines(fd: FormData, key: string): string[] {
  // Checkboxes (name=key, multiple) or legacy comma/newline text.
  return fd
    .getAll(key)
    .flatMap((v) => String(v).split(/[\n,]/))
    .map((s) => s.trim())
    .filter(Boolean);
}

async function assertAiReadyCompany(companyId: string) {
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  if (company.status !== "ai_ready" && company.status !== "approved") {
    throw new Error("Company is not AI-ready. Complete onboarding first.");
  }
  return company;
}

export async function generateAiImageAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  const company = await assertAiReadyCompany(companyId);
  const tenant = await getTenant(user.tenantId);
  await assertVisualsGeneration(company, "image", 1, tenant);
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);

  const topic = text(formData, "topic");
  const objective = text(formData, "objective");
  if (!topic || !objective) throw new Error("Topic and objective are required");
  const channel = text(formData, "channel") || undefined;
  const format = text(formData, "format") as "square" | "vertical" | "landscape" | "";
  const targetContentId = text(formData, "contentId") || undefined;
  if (targetContentId) {
    const content = await getContent(targetContentId);
    if (!content || content.companyId !== companyId) {
      throw new Error("Linked content not found for this company.");
    }
  }

  const result = await generateImage({
    company,
    topic,
    objective,
    channel,
    format: format || "square",
  });

  const aiRun = await recordAiUsage({
    tenantId: user.tenantId,
    companyId,
    userId: user.id,
    kind: "image_gen",
    model: result.model,
    promptSummary: result.prompt.slice(0, 120),
    outputChars: result.bytes.length,
    sourcesUsed: ["Brand Brain: company profile"],
    contextChars: result.prompt.length,
  });

  const asset = await persistGeneratedAsset({
    tenantId: user.tenantId,
    companyId,
    userId: user.id,
    name: result.name,
    description: result.description,
    assetType: "image",
    mimeType: result.mimeType,
    bytes: result.bytes,
    channels: channel ? [channel] : [],
    targetContentId,
    aiModel: result.model,
    aiPrompt: result.prompt,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
    sourcesUsed: ["Brand Brain: company profile"],
  });

  await logAction(user, "visuals.image_generated", {
    targetType: "asset",
    targetId: asset.id,
    companyId,
    detail: topic,
  });
  redirect(`/assets/${asset.id}`);
}

export async function generateAiVideoAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  const company = await assertAiReadyCompany(companyId);
  const tenant = await getTenant(user.tenantId);
  await assertVisualsGeneration(company, "video", 1, tenant);
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId, 2);

  const topic = text(formData, "topic");
  const script = text(formData, "script");
  if (!topic || !script) throw new Error("Topic and script are required");
  const channel = text(formData, "channel") || undefined;
  const targetContentId = text(formData, "contentId") || undefined;
  if (targetContentId) {
    const content = await getContent(targetContentId);
    if (!content || content.companyId !== companyId) {
      throw new Error("Linked content not found for this company.");
    }
  }

  const result = await generateVideo({ company, topic, script, channel });

  const aiRun = await recordAiUsage({
    tenantId: user.tenantId,
    companyId,
    userId: user.id,
    kind: "video_gen",
    model: result.model,
    promptSummary: result.prompt.slice(0, 120),
    outputChars: result.bytes.length,
    sourcesUsed: ["Brand Brain: company profile"],
    contextChars: result.prompt.length,
  });

  const asset = await persistGeneratedAsset({
    tenantId: user.tenantId,
    companyId,
    userId: user.id,
    name: result.name,
    description: result.description,
    assetType: "video",
    mimeType: result.mimeType,
    bytes: result.bytes,
    channels: channel ? [channel] : [],
    targetContentId,
    aiModel: result.model,
    aiPrompt: result.prompt,
    aiRunId: aiRun.id,
    estCostUsd: aiRun.estCostUsd,
    sourcesUsed: ["Brand Brain: company profile"],
  });

  await logAction(user, "visuals.video_generated", {
    targetType: "asset",
    targetId: asset.id,
    companyId,
    detail: topic,
  });
  redirect(`/assets/${asset.id}`);
}

export async function requestPhotoShootAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "photo");
  await assertAiReadyCompany(companyId);

  const brief = text(formData, "brief");
  if (!brief) throw new Error("A shoot brief is required");
  const location = text(formData, "location") || undefined;
  const targetContentId = text(formData, "contentId") || undefined;
  const targetChannels = lines(formData, "targetChannels");

  const shoot = await createPhotoShoot({
    companyId,
    brief,
    location,
    status: "requested",
    deliverableAssetIds: [],
    targetContentId,
    targetChannels,
    createdById: user.id,
  });
  await logAction(user, "visuals.photo_shoot_requested", {
    targetType: "photo_shoot",
    targetId: shoot.id,
    companyId,
    detail: brief.slice(0, 80),
  });
  revalidatePath("/visuals");
}

export async function advancePhotoShootAction(formData: FormData) {
  const shootId = text(formData, "shootId");
  const to = text(formData, "to") as PhotoShootStatus;
  const shoot = await getPhotoShoot(shootId);
  if (!shoot) throw new Error("Photo shoot not found");
  const user = await requireAdmin();
  await assertCompanyAccess(shoot.companyId);
  await assertCompanyAddon(shoot.companyId, "photo");
  assertPhotoShootTransition(shoot.status, to);

  const patch: Parameters<typeof updatePhotoShoot>[1] = { status: to };
  if (to === "scheduled") {
    const scheduledAt = text(formData, "scheduledAt");
    if (!scheduledAt) throw new Error("A scheduled date/time is required.");
    patch.scheduledAt = new Date(scheduledAt).toISOString();
  }
  if (to === "in_progress" || to === "delivered") {
    const notes = text(formData, "photographerNotes");
    if (notes) patch.photographerNotes = notes;
  }

  await updatePhotoShoot(shootId, patch);
  if (to === "completed" && shoot.marketplaceBookingId) {
    await tryReleasePhotographerPayout(shoot.marketplaceBookingId);
  }
  await logAction(user, "visuals.photo_shoot_advanced", {
    targetType: "photo_shoot",
    targetId: shootId,
    companyId: shoot.companyId,
    detail: `${photoShootStatusLabel(shoot.status)} → ${photoShootStatusLabel(to)}`,
  });
  revalidatePath("/visuals");
}

function parseChannels(formData: FormData): VideoStudioChannel[] {
  const selected = ALL_VIDEO_CHANNELS.filter((ch) => formData.get(`channel_${ch}`) === "on");
  return selected.length ? selected : ALL_VIDEO_CHANNELS;
}

export async function draftVideoStudioScriptAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  // Script drafts are text content — no video quota / add-on required.
  const company = await assertAiReadyCompany(companyId);
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);

  const templateId = text(formData, "templateId") as VideoStudioTemplateId;
  const scriptPackId = text(formData, "scriptPackId");
  const topic = text(formData, "topic");
  if (!templateId || !scriptPackId || !topic) {
    throw new Error("Template, script pack, and topic are required.");
  }
  const template = getVideoTemplate(templateId);
  const pack = getScriptPack(scriptPackId);
  if (!template || !pack) throw new Error("Invalid template or script pack.");
  const scriptOverride = text(formData, "script");
  const body =
    scriptOverride || buildScriptFromPack(company, pack, topic);

  const compliance = await checkCompliance(body, company);
  const claimAudit = await auditClaims(body, company);
  const routedTo = routeContent({ type: "video_script", compliance, claimAudit });

  const content = await createContent({
    companyId,
    requestId: null,
    type: "video_script",
    title: `Video studio — ${topic}`.slice(0, 120),
    body,
    status: "ai_draft",
    createdById: user.id,
    compliance,
    claimAudit,
    routedTo,
    groundingLabel: "suggested_by_ai",
    brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
    aiModel: "video-studio-template",
    aiPrompt: `${template.label} · ${pack.label} · ${topic}`,
    sourcesUsed: ["Video studio: script pack", "Brand Brain: company profile"],
  });

  await recordAiUsage({
    tenantId: user.tenantId,
    companyId,
    userId: user.id,
    kind: "content_draft",
    model: "video-studio-template",
    promptSummary: `${templateId}:${scriptPackId}`.slice(0, 120),
    outputChars: body.length,
    sourcesUsed: ["Video studio: script pack"],
    contextChars: body.length,
  });

  await logAction(user, "visuals.video_studio_script_drafted", {
    targetType: "content",
    targetId: content.id,
    companyId,
    detail: topic,
  });
  redirect(`/content/${content.id}`);
}

export async function generateVideoStudioVariantsAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  const company = await assertAiReadyCompany(companyId);

  const templateId = text(formData, "templateId") as VideoStudioTemplateId;
  const scriptPackId = text(formData, "scriptPackId");
  const topic = text(formData, "topic");
  const script = text(formData, "script");
  if (!templateId || !scriptPackId || !topic || !script) {
    throw new Error("Template, script pack, topic, and script are required.");
  }
  const channels = parseChannels(formData);
  const tenant = await getTenant(user.tenantId);
  await assertVisualsGeneration(company, "video", channels.length, tenant);
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId, channels.length * 2);

  const specs = buildChannelVariants({
    company,
    templateId,
    scriptPackId,
    topic,
    script,
    channels,
  });

  const targetContentId = text(formData, "contentId") || undefined;
  if (targetContentId) {
    const content = await getContent(targetContentId);
    if (!content || content.companyId !== companyId) {
      throw new Error("Linked content not found for this company.");
    }
  }

  let lastAssetId: string | undefined;
  for (const spec of specs) {
    const result = await generateVideo({
      company,
      topic: `${topic} (${spec.channelLabel})`,
      script: spec.script,
      channel: spec.channel,
    });

    const aiRun = await recordAiUsage({
      tenantId: user.tenantId,
      companyId,
      userId: user.id,
      kind: "video_gen",
      model: result.model,
      promptSummary: result.prompt.slice(0, 120),
      outputChars: result.bytes.length,
      sourcesUsed: ["Video studio: channel variant", "Brand Brain: company profile"],
      contextChars: result.prompt.length,
    });

    const asset = await persistGeneratedAsset({
      tenantId: user.tenantId,
      companyId,
      userId: user.id,
      name: `Studio ${spec.channelLabel} — ${topic}`.slice(0, 120),
      description: [
        result.description,
        `Template: ${spec.templateId} · Pack: ${spec.scriptPackId}.`,
        `Render: ${spec.renderMode}.`,
      ].join(" "),
      assetType: "video",
      mimeType: result.mimeType,
      bytes: result.bytes,
      channels: [spec.channel],
      targetContentId,
      aiModel: result.model,
      aiPrompt: result.prompt,
      aiRunId: aiRun.id,
      estCostUsd: aiRun.estCostUsd,
      sourcesUsed: ["Video studio: channel variant"],
    });
    lastAssetId = asset.id;
  }

  await logAction(user, "visuals.video_studio_variants_generated", {
    targetType: "asset",
    targetId: lastAssetId,
    companyId,
    detail: `${specs.length} variant(s) for ${topic}`,
  });
  redirect(lastAssetId ? `/assets/${lastAssetId}` : "/visuals");
}

export async function linkShootAssetAction(formData: FormData) {
  const shootId = text(formData, "shootId");
  const assetId = text(formData, "assetId");
  const shoot = await getPhotoShoot(shootId);
  if (!shoot) throw new Error("Photo shoot not found");
  const user = await assertCompanyAccess(shoot.companyId);
  await assertCompanyAddon(shoot.companyId, "photo");
  if (!["delivered", "in_progress"].includes(shoot.status)) {
    throw new Error("Deliverables can only be linked while the shoot is in progress or delivered.");
  }
  const ids = shoot.deliverableAssetIds ?? [];
  if (!ids.includes(assetId)) {
    await updatePhotoShoot(shootId, { deliverableAssetIds: [...ids, assetId] });
  }
  await logAction(user, "visuals.photo_shoot_asset_linked", {
    targetType: "photo_shoot",
    targetId: shootId,
    companyId: shoot.companyId,
    detail: assetId,
  });
  revalidatePath("/visuals");
}
