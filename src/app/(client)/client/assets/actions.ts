"use server";

import { revalidatePath } from "next/cache";
import {
  createAsset,
  getAsset,
  getCompany,
  isUnderLegalHold,
  updateAsset,
} from "@/lib/db";
import { requirePortalUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { MAX_MEDIA_BYTES, mediaKey, putObject, storageConfigured } from "@/lib/storage";
import type { AssetType } from "@/lib/types";
import { confirmClientAssetRights } from "@/lib/managed-service/workflow-service";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

const ASSET_TYPES: AssetType[] = [
  "logo",
  "image",
  "video",
  "graphic",
  "document",
  "audio",
];

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

async function assertPortalCompany(companyId: string) {
  const { user, companyId: portalCompanyId } = await requirePortalUser();
  if (companyId !== portalCompanyId) {
    throw new Error("Forbidden: no access to this company");
  }
  if (await isUnderLegalHold("company", companyId, companyId)) {
    throw new Error(
      "This company is under a legal hold — its assets cannot be modified.",
    );
  }
  return { user, companyId: portalCompanyId };
}

/** Register a client-uploaded asset. Starts pending review (agency must approve). */
export async function createClientAssetAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const { user } = await assertPortalCompany(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  const name = text(formData, "name");
  if (!name) throw new Error("Asset name is required");

  const assetType = text(formData, "assetType") as AssetType;
  const consentObtained = formData.get("consentObtained") === "on";
  const rightsConfirmed = formData.get("rightsConfirmed") === "on";
  const confirmationEmail = text(formData, "confirmationEmail").toLowerCase();
  if (!rightsConfirmed) {
    throw new Error("Confirm you own this file or have permission to use it.");
  }
  if (confirmationEmail !== user.email.trim().toLowerCase()) {
    throw new Error("Use the email address for your signed-in account.");
  }
  const file = formData.get("file");
  const hasFile = file instanceof File && file.size > 0;

  // Match agency: uploading bytes requires storage. Metadata-only is fine without it.
  if (hasFile && !storageConfigured()) {
    throw new Error(
      "Media storage isn't configured (set CC_MEDIA_DIR, or Supabase Storage in production).",
    );
  }

  const resolvedType = ASSET_TYPES.includes(assetType) ? assetType : "image";
  if (hasFile) {
    const f = file as File;
    if (f.size > MAX_MEDIA_BYTES) {
      throw new Error(
        `File is too large (max ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)} MB).`,
      );
    }
    const mime = f.type || "application/octet-stream";
    if (!mimeAllowedForType(resolvedType, mime)) {
      throw new Error(`A ${resolvedType} can't be a ${mime || "file of that type"}.`);
    }
  }

  const asset = await createAsset({
    companyId,
    name,
    description: text(formData, "description") || undefined,
    assetType: resolvedType,
    source: "upload",
    tags: ["client_upload"],
    usageRights: {
      // Uploader is the recorded contact — do not invent licence ownership beyond that.
      owner: user.name,
      licenceType: "unknown",
      consentObtained,
      allowedChannels: [],
    },
    status: "pending_approval",
    createdById: user.id,
  });

  await logAction(user, "asset.created", {
    targetType: "asset",
    targetId: asset.id,
    companyId,
    detail: `${asset.name} (${asset.assetType}) · client portal`,
  });
  await confirmClientAssetRights({
    actor: user,
    assetId: asset.id,
    confirmationEmail,
  });

  if (hasFile) {
    const f = file as File;
    const mime = f.type || "application/octet-stream";
    const bytes = Buffer.from(await f.arrayBuffer());
    const ref = await putObject(
      mediaKey(user.tenantId, companyId, asset.id),
      bytes,
      mime,
    );
    await updateAsset(asset.id, {
      storedFile: ref,
      fileName: f.name,
      mimeType: mime,
      sizeBytes: bytes.length,
    });
    await logAction(user, "asset.media_uploaded", {
      targetType: "asset",
      targetId: asset.id,
      companyId,
      detail: `${f.name} · ${Math.round(bytes.length / 1024)} KB`,
    });
  }

  revalidatePath("/client/assets");
  revalidatePath("/client/account");
}

export async function uploadClientAssetMediaAction(formData: FormData) {
  const assetId = text(formData, "assetId");
  const asset = await getAsset(assetId);
  if (!asset) throw new Error("Asset not found");
  const { user } = await assertPortalCompany(asset.companyId);

  if (!["draft", "changes_required", "pending_approval"].includes(asset.status)) {
    throw new Error(
      "Approved or archived assets are locked — ask your agency if you need to replace a file.",
    );
  }
  if (!storageConfigured()) {
    throw new Error(
      "Media storage isn't configured (set CC_MEDIA_DIR, or Supabase Storage in production).",
    );
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a file to upload.");
  }
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error(
      `File is too large (max ${Math.round(MAX_MEDIA_BYTES / 1024 / 1024)} MB).`,
    );
  }
  const mime = file.type || "application/octet-stream";
  if (!mimeAllowedForType(asset.assetType, mime)) {
    throw new Error(`A ${asset.assetType} can't be a ${mime || "file of that type"}.`);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const ref = await putObject(
    mediaKey(user.tenantId, asset.companyId, asset.id),
    bytes,
    mime,
  );
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
  revalidatePath("/client/assets");
  revalidatePath("/client/account");
}
