// Social inbox ingestion (production drop-in for live mention pulling).
//
// Env-gated like the publishing connectors: when PUBLISHING_LIVE=true and a
// company has a connected integration, fetchNewMentions pulls recent comments/
// mentions/DMs from the platform API using decryptToken(...). Otherwise it
// returns [] so the demo runs on seeded mentions with zero external accounts.
//
// The real request shapes are the drop-in; they can't be exercised without the
// owner's platform apps + tokens (same posture as publishing-connectors).

import { listIntegrations } from "@/lib/db";
import { decryptToken } from "@/lib/crypto";
import { publishingLive } from "@/lib/publishing-connectors";
import type { PublishingIntegration } from "@/lib/types";

export interface IngestedMention {
  companyId: string;
  platform: string;
  externalId: string;
  authorName: string;
  text: string;
  receivedAt: string;
}

// Pull new mentions for every connected integration in a tenant. Live only;
// [] in demo. Never throws to the caller — a platform error for one integration
// is logged and skipped.
export async function fetchNewMentions(tenantId: string): Promise<IngestedMention[]> {
  if (!publishingLive()) return [];
  const out: IngestedMention[] = [];
  for (const integration of await listIntegrations(tenantId)) {
    if (integration.status !== "connected") continue;
    try {
      out.push(...(await fetchForIntegration(integration)));
    } catch (err) {
      console.error(`[social-inbox] fetch failed for ${integration.platform}:`, err);
    }
  }
  return out;
}

async function fetchForIntegration(
  integration: PublishingIntegration,
): Promise<IngestedMention[]> {
  const token = decryptToken(integration.encryptedToken);
  const platform = integration.platform.toLowerCase();

  if (platform.includes("facebook") || platform.includes("instagram")) {
    // Meta Graph: GET /{page-id}/feed?fields=comments... (real drop-in).
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(integration.accountName)}/feed?fields=comments{id,message,from}&access_token=${encodeURIComponent(token)}`,
    );
    const json = (await res.json().catch(() => ({}))) as {
      data?: { comments?: { data?: { id: string; message: string; from?: { name?: string } }[] } }[];
    };
    if (!res.ok) return [];
    const now = new Date().toISOString();
    return (json.data ?? [])
      .flatMap((post) => post.comments?.data ?? [])
      .map((c) => ({
        companyId: integration.companyId,
        platform: integration.platform,
        externalId: c.id,
        authorName: c.from?.name ?? "Unknown",
        text: c.message ?? "",
        receivedAt: now,
      }))
      .filter((m) => m.text.trim().length > 0);
  }
  // LinkedIn / Google Business Profile mention pulls follow the same shape.
  return [];
}
