// Visuals orchestration (Phase 4). Creates governed DAM assets from AI-generated
// bytes and handles the attach:<contentId> tag convention for auto-attach after
// creative approval.

import {
  createAsset,
  getContent,
  updateAsset,
  updateContent,
} from "@/lib/db";
import { assetChannelBlockReason } from "@/lib/assets";
import { activeSchedulesForContent } from "@/lib/db";
import { mediaKey, putObject, storageConfigured } from "@/lib/storage";
import type { Asset, AssetType } from "@/lib/types";

export const ATTACH_TAG_PREFIX = "attach:";

export function attachTagForContent(contentId: string): string {
  return `${ATTACH_TAG_PREFIX}${contentId}`;
}

export function parseAttachTag(tags: string[]): string | undefined {
  const tag = tags.find((t) => t.startsWith(ATTACH_TAG_PREFIX));
  return tag?.slice(ATTACH_TAG_PREFIX.length);
}

export interface PersistGeneratedAssetInput {
  tenantId: string;
  companyId: string;
  userId: string;
  name: string;
  description: string;
  assetType: AssetType;
  mimeType: string;
  bytes: Buffer;
  channels: string[];
  targetContentId?: string;
  aiModel: string;
  aiPrompt?: string;
  aiRunId?: string;
  estCostUsd?: number;
  sourcesUsed?: string[];
}

export async function persistGeneratedAsset(
  input: PersistGeneratedAssetInput,
): Promise<Asset> {
  const tags = ["ai-visuals"];
  if (input.targetContentId) tags.push(attachTagForContent(input.targetContentId));

  const asset = await createAsset({
    companyId: input.companyId,
    name: input.name,
    description: input.description,
    assetType: input.assetType,
    source: "ai_generated",
    fileName:
      input.assetType === "video"
        ? `${input.name.slice(0, 40).replace(/[^\w.-]+/g, "_")}.mp4`
        : `${input.name.slice(0, 40).replace(/[^\w.-]+/g, "_")}.png`,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.length,
    tags,
    usageRights: {
      owner: "AI-generated (platform)",
      licenceType: "owned",
      consentObtained: true,
      allowedChannels: input.channels.length ? input.channels : [],
      restrictions:
        "AI-generated asset — route through creative approval before publishing.",
    },
    status: "pending_approval",
    createdById: input.userId,
    aiModel: input.aiModel,
    aiPrompt: input.aiPrompt,
    aiRunId: input.aiRunId,
    estCostUsd: input.estCostUsd,
    sourcesUsed: input.sourcesUsed ?? ["Brand Brain: company profile"],
  });

  if (storageConfigured()) {
    const key = mediaKey(input.tenantId, input.companyId, asset.id);
    const ref = await putObject(key, input.bytes, input.mimeType);
    await updateAsset(asset.id, { storedFile: ref });
    return { ...asset, storedFile: ref };
  }

  return asset;
}

// After an asset is approved, honour attach:<contentId> tags (auto-attach pipeline).
export async function tryAutoAttachApprovedAsset(asset: Asset): Promise<boolean> {
  if (asset.status !== "approved") return false;
  const contentId = parseAttachTag(asset.tags);
  if (!contentId) return false;

  const content = await getContent(contentId);
  if (!content || content.companyId !== asset.companyId) return false;
  if (["archived", "rejected", "published"].includes(content.status)) return false;

  for (const s of await activeSchedulesForContent(content.id)) {
    const reason = await assetChannelBlockReason(asset, s.platform);
    if (reason) return false;
  }

  const assetIds = content.assetIds ?? [];
  if (assetIds.includes(asset.id)) return true;
  await updateContent(contentId, { assetIds: [...assetIds, asset.id] });
  return true;
}
