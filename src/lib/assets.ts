// Creative-asset usage-rights enforcement (Phase 11, §46).
//
// The core rule: an asset must NOT be usable in a channel unless its usage
// rights allow it. This is enforced server-side — at the point content that
// references an asset is scheduled to a channel, and re-checked at publish time
// (rights can expire or a consent can be withdrawn between the two).
//
// Only APPROVED assets can be referenced by content in the first place; these
// helpers add the per-channel + expiry + consent gate on top of that.

import { getAsset, getConsent } from "@/lib/db";
import { now } from "@/lib/utils";
import type { Asset } from "@/lib/types";

// Is an asset generally usable right now (independent of channel)? Approved,
// not expired, and — for user-generated content — consent obtained. When the
// asset's consentRef points at a Consent Register record, that record must
// still be valid: a consent WITHDRAWN or EXPIRED after the asset was approved
// blocks the asset (mirrors validConsents), even if the local flag says
// otherwise. This is why the rights are re-checked at publish time.
export async function assetUsableReason(asset: Asset, today = now().slice(0, 10)): Promise<string | null> {
  if (asset.status !== "approved") {
    return `not approved (status: ${asset.status})`;
  }
  const r = asset.usageRights;
  if (r.expiryDate && r.expiryDate < today) {
    return `usage rights expired on ${r.expiryDate}`;
  }
  if (r.licenceType === "user_generated" && !r.consentObtained) {
    return "user-generated content without consent on file";
  }
  // Follow the link to the Consent Register. consentRef is a Consent Register
  // id; if it's set it MUST resolve to a currently-valid record. Fail CLOSED —
  // a missing (deleted / mistyped) record blocks the asset, so an orphaned
  // reference can never let content publish past the consent gate.
  if (r.consentRef) {
    const consent = await getConsent(r.consentRef);
    if (!consent) {
      return "the linked consent record is missing";
    }
    if (consent.withdrawn || !consent.consentObtained) {
      return "the linked consent has been withdrawn";
    }
    if (consent.expiryDate && consent.expiryDate < today) {
      return `the linked consent expired on ${consent.expiryDate}`;
    }
  }
  return null;
}

// Why an approved asset may not be used on a given channel, if at all. Channel
// comparison is case-insensitive; an empty allowedChannels list means all
// channels are permitted.
export async function assetChannelBlockReason(
  asset: Asset,
  channel: string,
  today = now().slice(0, 10),
): Promise<string | null> {
  const general = await assetUsableReason(asset, today);
  if (general) return general;
  const allowed = asset.usageRights.allowedChannels;
  if (
    allowed.length > 0 &&
    !allowed.some((c) => c.toLowerCase() === channel.toLowerCase())
  ) {
    return `rights don't permit ${channel} (cleared for: ${allowed.join(", ")})`;
  }
  return null;
}

export interface AssetChannelBlock {
  asset: Asset;
  reason: string;
}

// Referenced assets that block a given channel. Missing/unknown ids also block
// (an asset that vanished can't be vouched for). Empty result = clear to use.
export async function assetsBlockingChannel(
  assetIds: string[] | undefined,
  channel: string,
  today = now().slice(0, 10),
): Promise<AssetChannelBlock[]> {
  if (!assetIds || assetIds.length === 0) return [];
  const blocks: AssetChannelBlock[] = [];
  for (const assetId of assetIds) {
    const asset = await getAsset(assetId);
    if (!asset) {
      blocks.push({
        asset: { id: assetId, name: assetId } as Asset,
        reason: "referenced asset no longer exists",
      });
      continue;
    }
    const reason = await assetChannelBlockReason(asset, channel, today);
    if (reason) blocks.push({ asset, reason });
  }
  return blocks;
}

// Throw when any referenced asset's rights/expiry don't permit the channel.
// Called at the schedule boundary; the publishing engine re-checks and skips.
export async function assertAssetsAllowChannel(
  assetIds: string[] | undefined,
  channel: string,
): Promise<void> {
  const blocks = await assetsBlockingChannel(assetIds, channel);
  if (blocks.length > 0) {
    const detail = blocks
      .map((b) => `"${b.asset.name}" — ${b.reason}`)
      .join("; ");
    throw new Error(
      `Blocked: referenced creative can't be used on ${channel}. ${detail}. Remove the asset, choose a permitted channel, or update its usage rights.`,
    );
  }
}

const ASSET_TYPE_LABEL: Record<Asset["assetType"], string> = {
  logo: "Logo",
  image: "Image",
  video: "Video",
  graphic: "Graphic",
  document: "Document",
  audio: "Audio",
};

export function assetTypeLabel(type: Asset["assetType"]): string {
  return ASSET_TYPE_LABEL[type];
}

const LICENCE_LABEL: Record<Asset["usageRights"]["licenceType"], string> = {
  owned: "Owned",
  licensed: "Licensed",
  royalty_free: "Royalty-free",
  user_generated: "User-generated",
  unknown: "Unknown",
};

export function licenceLabel(
  licence: Asset["usageRights"]["licenceType"],
): string {
  return LICENCE_LABEL[licence];
}
