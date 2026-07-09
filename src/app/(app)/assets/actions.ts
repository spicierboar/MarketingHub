"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createAsset,
  createBrandTemplate,
  createContent,
  getAsset,
  getBrandTemplate,
  getCompany,
  getConsent,
  isUnderLegalHold,
  logAiRun,
  setBrandTemplateActive,
  updateAsset,
} from "@/lib/db";
import {
  assertCompanyAccess,
  canAccessCompany,
  requireAdmin,
  isAdmin,
} from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { assertAiBudget } from "@/lib/ai/budget";
import { assertAiRateLimit } from "@/lib/ratelimit";
import { generateImageBrief } from "@/lib/ai/imagebrief";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { tryAutoAttachApprovedAsset, parseAttachTag } from "@/lib/visuals";
import { MAX_MEDIA_BYTES, mediaKey, putObject, storageConfigured } from "@/lib/storage";
import type {
  AssetSource,
  AssetType,
  AssetUsageRights,
  BrandTemplateKind,
  GroundingLabel,
  LicenceType,
} from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}
function lines(fd: FormData, key: string): string[] {
  return String(fd.get(key) || "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// A company-scope legal hold freezes all of a company's records, assets
// included (§54). Asset mutations must respect it.
async function assertCompanyNotOnHold(companyId: string): Promise<void> {
  if (await isUnderLegalHold("company", companyId, companyId)) {
    throw new Error(
      "This company is under a legal hold — its assets cannot be modified.",
    );
  }
}

const ASSET_TYPES: AssetType[] = [
  "logo",
  "image",
  "video",
  "graphic",
  "document",
  "audio",
];
const ASSET_SOURCES: AssetSource[] = [
  "upload",
  "canva",
  "figma",
  "stock",
  "ai_generated",
];
const LICENCE_TYPES: LicenceType[] = [
  "owned",
  "licensed",
  "royalty_free",
  "user_generated",
  "unknown",
];

function readRights(fd: FormData): AssetUsageRights {
  const licenceType = text(fd, "licenceType") as LicenceType;
  return {
    owner: text(fd, "owner"),
    licenceType: LICENCE_TYPES.includes(licenceType) ? licenceType : "unknown",
    licenceRef: text(fd, "licenceRef") || undefined,
    consentObtained: fd.get("consentObtained") === "on",
    consentRef: text(fd, "consentRef") || undefined,
    allowedChannels: lines(fd, "allowedChannels"),
    expiryDate: text(fd, "expiryDate") || undefined,
    restrictions: text(fd, "restrictions") || undefined,
  };
}

function mimeAllowedForType(type: AssetType, mime: string): boolean {
  const m = mime.toLowerCase();
  switch (type) {
    case "image":
    case "logo":
    case "graphic":
      return m.startsWith("image/");
    case "video":
      return m.startsWith("video/");
    case "audio":
      return m.startsWith("audio/");
    case "document":
      return m.startsWith("application/") || m.startsWith("text/");
    default:
      return true;
  }
}

// Real-media DAM: upload the actual bytes for an asset. Tenant-pinned; only
// before approval (a new file the approver never saw must not slip into an
// already-approved asset). Bytes go to the storage adapter; only a reference is
// written to the asset row.
export async function uploadAssetMediaAction(formData: FormData) {
  const assetId = text(formData, "assetId");
  const asset = await getAsset(assetId);
  if (!asset) throw new Error("Asset not found");
  const user = await assertCompanyAccess(asset.companyId);
  await assertCompanyNotOnHold(asset.companyId);
  if (!["draft", "changes_required", "pending_approval"].includes(asset.status)) {
    throw new Error("Approved or archived assets are locked — edit the asset to attach a new file.");
  }
  if (!storageConfigured()) {
    throw new Error("Media storage isn't configured (set CC_MEDIA_DIR, or Supabase Storage in production).");
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file to upload.");
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error(`File is too large (max ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)} MB).`);
  }
  const mime = file.type || "application/octet-stream";
  if (!mimeAllowedForType(asset.assetType, mime)) {
    throw new Error(`A ${asset.assetType} can't be a ${mime || "file of that type"}.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const ref = await putObject(mediaKey(user.tenantId, asset.companyId, asset.id), bytes, mime);
  await updateAsset(assetId, {
    storedFile: ref,
    fileName: file.name,
    mimeType: mime,
    sizeBytes: bytes.length,
  });
  await logAction(user, "asset.media_uploaded", {
    targetType: "asset",
    targetId: assetId,
    companyId: asset.companyId,
    detail: `${file.name} · ${Math.round(bytes.length / 1024)} KB`,
  });
  revalidatePath(`/assets/${assetId}`);
}

// Register a new creative asset (metadata + usage rights only — never bytes,
// mirroring the request-upload pattern). Starts as a draft; must be approved
// before any content can reference it.
export async function createAssetAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  await assertCompanyNotOnHold(companyId);

  const name = text(formData, "name");
  if (!name) throw new Error("Asset name is required");
  const owner = text(formData, "owner");
  if (!owner) throw new Error("An owner is required for usage-rights tracking");

  const assetType = text(formData, "assetType") as AssetType;
  const source = text(formData, "source") as AssetSource;

  const asset = await createAsset({
    companyId,
    folder: text(formData, "folder") || undefined,
    name,
    description: text(formData, "description") || undefined,
    assetType: ASSET_TYPES.includes(assetType) ? assetType : "image",
    source: ASSET_SOURCES.includes(source) ? source : "upload",
    externalRef: text(formData, "externalRef") || undefined,
    fileName: text(formData, "fileName") || undefined,
    mimeType: text(formData, "mimeType") || undefined,
    tags: lines(formData, "tags"),
    usageRights: readRights(formData),
    status: "draft",
    createdById: user.id,
  });
  await logAction(user, "asset.created", {
    targetType: "asset",
    targetId: asset.id,
    companyId,
    detail: `${asset.name} (${asset.assetType})`,
  });
  redirect(`/assets/${asset.id}`);
}

// Edit metadata + usage rights. Editing an approved asset returns it to review
// (a rights change the approver never saw must be re-approved before reuse).
export async function updateAssetAction(formData: FormData) {
  const assetId = text(formData, "assetId");
  const asset = await getAsset(assetId);
  if (!asset) throw new Error("Asset not found");
  const user = await assertCompanyAccess(asset.companyId);
  await assertCompanyNotOnHold(asset.companyId);
  if (["archived", "rejected"].includes(asset.status)) {
    throw new Error("Archived or rejected assets cannot be edited.");
  }

  const wasApproved = asset.status === "approved";
  await updateAsset(assetId, {
    folder: text(formData, "folder") || undefined,
    name: text(formData, "name") || asset.name,
    description: text(formData, "description") || undefined,
    externalRef: text(formData, "externalRef") || undefined,
    tags: lines(formData, "tags"),
    usageRights: readRights(formData),
    ...(wasApproved
      ? { status: "pending_approval", approvedById: null, approvedAt: null }
      : {}),
  });
  await logAction(user, "asset.updated", {
    targetType: "asset",
    targetId: assetId,
    companyId: asset.companyId,
    detail: wasApproved ? "Rights changed — returned for re-approval" : undefined,
  });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
}

export async function submitAssetAction(formData: FormData) {
  const assetId = text(formData, "assetId");
  const asset = await getAsset(assetId);
  if (!asset) throw new Error("Asset not found");
  const user = await assertCompanyAccess(asset.companyId);
  await assertCompanyNotOnHold(asset.companyId);
  if (!["draft", "changes_required"].includes(asset.status)) {
    throw new Error("Only draft assets can be submitted for approval.");
  }
  await updateAsset(assetId, { status: "pending_approval" });
  await logAction(user, "asset.submitted", {
    targetType: "asset",
    targetId: assetId,
    companyId: asset.companyId,
  });
  revalidatePath(`/assets/${assetId}`);
}

// Creative approval workflow (§46). Approving requires an admin; only approved
// assets can be referenced by content.
export async function approveAssetAction(formData: FormData) {
  const assetId = text(formData, "assetId");
  const asset = await getAsset(assetId);
  if (!asset) throw new Error("Asset not found");
  // Company scoping first (mirrors create/edit), then approval authority.
  const user = await assertCompanyAccess(asset.companyId);
  if (!isAdmin(user)) throw new Error("Only admins can approve assets");
  await assertCompanyNotOnHold(asset.companyId);
  if (asset.status !== "pending_approval") {
    throw new Error("Only assets pending approval can be approved.");
  }
  // Rights hygiene: an asset with no owner, or UGC without consent, must not be
  // approved for use.
  if (!asset.usageRights.owner) {
    throw new Error("Cannot approve: no owner recorded for usage rights.");
  }
  if (
    asset.usageRights.licenceType === "user_generated" &&
    !asset.usageRights.consentObtained
  ) {
    throw new Error(
      "Cannot approve user-generated content without consent on file.",
    );
  }
  // A cited Consent Register reference must resolve to a valid, current record
  // — never approve an asset with a dangling or withdrawn consent link.
  if (asset.usageRights.consentRef) {
    const consent = await getConsent(asset.usageRights.consentRef);
    if (!consent) {
      throw new Error(
        "Cannot approve: the linked consent record does not exist. Fix the consent reference first.",
      );
    }
    if (consent.withdrawn || !consent.consentObtained) {
      throw new Error("Cannot approve: the linked consent has been withdrawn.");
    }
  }
  await updateAsset(assetId, {
    status: "approved",
    approvedById: user.id,
    approvedAt: new Date().toISOString(),
  });
  const approved = { ...asset, status: "approved" as const, approvedById: user.id, approvedAt: new Date().toISOString() };
  const attached = await tryAutoAttachApprovedAsset(approved);
  await logAction(user, "asset.approved", {
    targetType: "asset",
    targetId: assetId,
    companyId: asset.companyId,
    detail: attached ? `${asset.name} — auto-attached to linked content` : asset.name,
  });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
  const linkedContent = parseAttachTag(asset.tags);
  if (attached && linkedContent) revalidatePath(`/content/${linkedContent}`);
}

export async function rejectAssetAction(formData: FormData) {
  const assetId = text(formData, "assetId");
  const note = text(formData, "note");
  const changesOnly = formData.get("changesOnly") === "on";
  const asset = await getAsset(assetId);
  if (!asset) throw new Error("Asset not found");
  const user = await assertCompanyAccess(asset.companyId);
  if (!isAdmin(user)) throw new Error("Only admins can reject assets");
  await assertCompanyNotOnHold(asset.companyId);
  if (asset.status !== "pending_approval") {
    throw new Error("Only assets pending approval can be rejected.");
  }
  await updateAsset(assetId, {
    status: changesOnly ? "changes_required" : "rejected",
    approvedById: null,
    approvedAt: null,
  });
  await logAction(user, changesOnly ? "asset.changes_required" : "asset.rejected", {
    targetType: "asset",
    targetId: assetId,
    companyId: asset.companyId,
    detail: note || undefined,
  });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
}

export async function archiveAssetAction(formData: FormData) {
  const assetId = text(formData, "assetId");
  const asset = await getAsset(assetId);
  if (!asset) throw new Error("Asset not found");
  const user = await assertCompanyAccess(asset.companyId);
  await assertCompanyNotOnHold(asset.companyId);
  await updateAsset(assetId, { status: "archived" });
  await logAction(user, "asset.archived", {
    targetType: "asset",
    targetId: assetId,
    companyId: asset.companyId,
    detail: asset.name,
  });
  revalidatePath(`/assets/${assetId}`);
  revalidatePath("/assets");
}

// AI image-brief generator (§46). Produces a governed creative brief as a
// content item (creative_request) so it flows through the same review pipeline
// as everything else — no shortcut around drafting/compliance/approval.
export async function generateImageBriefAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  if (company.status !== "ai_ready" && company.status !== "approved") {
    throw new Error("Company is not AI-ready. Complete onboarding first.");
  }
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);

  const topic = text(formData, "topic");
  const objective = text(formData, "objective");
  if (!topic || !objective) throw new Error("Topic and objective are required");
  const channel = text(formData, "channel") || undefined;
  const templateId = text(formData, "templateId");
  const template = templateId ? await getBrandTemplate(templateId) : null;

  const brief = await generateImageBrief({
    company,
    topic,
    objective,
    channel,
    template: template ?? null,
  });

  const compliance = await checkCompliance(brief.body, company);
  const claimAudit = await auditClaims(brief.body, company);
  const groundingLabel: GroundingLabel = claimAudit.some(
    (c) => c.status === "unsupported",
  )
    ? "requires_evidence"
    : "suggested_by_ai";

  const content = await createContent({
    companyId,
    requestId: null,
    type: "creative_request",
    title: brief.title,
    body: brief.body,
    status: "ai_draft",
    createdById: user.id,
    compliance,
    claimAudit,
    groundingLabel,
    brandFitScore: Math.max(40, 100 - compliance.issues.length * 12),
    aiModel: brief.model,
    aiPrompt: `Image brief — ${topic}`,
    sourcesUsed: ["Brand Brain: company profile"],
  });

  await logAiRun({
    tenantId: company.tenantId,
    companyId,
    userId: user.id,
    kind: "image_brief",
    model: brief.model,
    promptSummary: `Image brief: ${topic}`.slice(0, 120),
    outputChars: brief.body.length,
    sourcesUsed: ["Brand Brain: company profile"],
    estCostUsd: brief.model.startsWith("claude")
      ? Number(((brief.body.length / 4 / 1e6) * 15).toFixed(4))
      : 0,
  });
  await logAction(user, "asset.image_brief_generated", {
    targetType: "content",
    targetId: content.id,
    companyId,
    detail: topic,
  });
  redirect(`/content/${content.id}`);
}

// ---- Brand templates (admin) ------------------------------------------------

const TEMPLATE_KINDS: BrandTemplateKind[] = [
  "social_post",
  "story",
  "poster",
  "email_header",
  "flyer",
  "video_intro",
];

export async function createBrandTemplateAction(formData: FormData) {
  const user = await requireAdmin();
  const rawCompany = text(formData, "companyId");
  const companyId = rawCompany || null; // blank = tenant-wide
  if (companyId) {
    if (!(await getCompany(companyId))) throw new Error("Company not found");
    if (!(await canAccessCompany(user, companyId))) {
      throw new Error("You don't have access to that company.");
    }
  } else if (user.role !== "super_admin") {
    // Tenant-wide templates affect every company in the tenant — super admin only.
    throw new Error("Only the super admin can create group-wide templates.");
  }
  const name = text(formData, "name");
  if (!name) throw new Error("Template name is required");
  const kind = text(formData, "kind") as BrandTemplateKind;
  const source = text(formData, "source") as AssetSource;

  const tpl = await createBrandTemplate({
    tenantId: user.tenantId,
    companyId,
    name,
    kind: TEMPLATE_KINDS.includes(kind) ? kind : "social_post",
    description: text(formData, "description"),
    dimensions: text(formData, "dimensions") || undefined,
    source: ASSET_SOURCES.includes(source) ? source : "canva",
    externalRef: text(formData, "externalRef") || undefined,
    spec: text(formData, "spec") || undefined,
    active: true,
    createdById: user.id,
  });
  await logAction(user, "brand_template.created", {
    targetType: "brand_template",
    targetId: tpl.id,
    companyId: companyId ?? undefined,
    detail: name,
  });
  revalidatePath("/assets/templates");
}

export async function toggleBrandTemplateAction(formData: FormData) {
  const user = await requireAdmin();
  const templateId = text(formData, "templateId");
  const tpl = await getBrandTemplate(templateId);
  if (!tpl) throw new Error("Template not found");
  // Tenant pin: platform-library rows (tenantId null) may only be toggled by
  // the platform operator; tenant rows only by admins of that tenant.
  if (tpl.tenantId === null) {
    if (user.platformAdmin !== true) {
      throw new Error("Only the platform operator can modify platform templates.");
    }
  } else if (tpl.tenantId !== user.tenantId) {
    throw new Error("Forbidden: no access to this template");
  }
  await setBrandTemplateActive(templateId, !tpl.active);
  await logAction(user, tpl.active ? "brand_template.deactivated" : "brand_template.activated", {
    targetType: "brand_template",
    targetId: templateId,
    companyId: tpl.companyId ?? undefined,
    detail: tpl.name,
  });
  revalidatePath("/assets/templates");
}
