// Real platform connectors (production drop-in for the simulated publisher).
//
// The publishing engine (src/lib/publishing.ts) keeps its full eligibility chain
// — kill switch, crisis/sandbox gates, legal-hold skips, asset-rights re-check,
// retries and logging. Only the final "send to the platform" step changes: when
// publishingLive() is true and the relevant OAuth app is configured,
// dispatchPublish makes the real API call using decryptToken(integration.encryptedToken).
// Otherwise it returns null and the engine uses the deterministic simulator, so
// the demo still runs with zero external accounts.
//
// Live gate: appEnv() + PUBLISHING_LIVE + PUBLISHING_TOKEN_KEY. Staging preview
// deployments never call platform APIs even if PUBLISHING_LIVE is set (see
// docs/DEPLOYMENT.md — keep *_LIVE off on staging).
//
// These are real request shapes; they cannot be exercised without the owner's
// platform apps + tokens (see HANDOVER "Go to production").

import { decryptToken } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import { liveIntegrationsAllowed } from "@/lib/env";
import { assertConnectorAction } from "@/lib/connectors/capability-registry";
import type { PublishingIntegration } from "@/lib/types";

const META_GRAPH_VERSION = "v21.0";

export type PublishingPlatformKey = "meta" | "google_business" | "tiktok";

type PlatformHealthStatus = "healthy" | "degraded" | "simulated" | "offline";

export interface PublishingPlatformHealthRow {
  platform: PublishingPlatformKey;
  label: string;
  oauthConfigured: boolean;
  liveEligible: boolean;
  status: PlatformHealthStatus;
  detail: string;
}

/** True when outbound platform publish calls are permitted. */
export function publishingLive(): boolean {
  if (!process.env.PUBLISHING_TOKEN_KEY?.trim()) return false;
  if (process.env.PUBLISHING_LIVE !== "true") return false;
  if (!liveIntegrationsAllowed()) return false;
  return true;
}

export function metaPublishingConfigured(): boolean {
  return !!(
    process.env.META_APP_ID?.trim() && process.env.META_APP_SECRET?.trim()
  );
}

export function gbpPublishingConfigured(): boolean {
  return !!(
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() &&
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()
  );
}

export function tiktokPublishingConfigured(): boolean {
  return !!(
    process.env.TIKTOK_CLIENT_KEY?.trim() &&
    process.env.TIKTOK_CLIENT_SECRET?.trim()
  );
}

function platformHealthStatus(
  oauthConfigured: boolean,
  liveEligible: boolean,
): { status: PlatformHealthStatus; detail: string } {
  if (!liveEligible) {
    return {
      status: "simulated",
      detail: oauthConfigured
        ? "OAuth app configured — PUBLISHING_LIVE off or staging gate active"
        : "Shared OAuth app not configured — simulator active",
    };
  }
  if (!oauthConfigured) {
    return {
      status: "offline",
      detail: "Live gate on but shared OAuth app credentials missing",
    };
  }
  return {
    status: "healthy",
    detail: "Live gate on — OAuth app configured",
  };
}

/** Per-platform publishing readiness for admin / AI-control health panels. */
export function buildPublishingPlatformHealth(): PublishingPlatformHealthRow[] {
  const liveEligible = publishingLive();
  return [
    {
      platform: "meta",
      label: "Meta (Facebook / Instagram)",
      oauthConfigured: metaPublishingConfigured(),
      liveEligible,
      ...platformHealthStatus(metaPublishingConfigured(), liveEligible),
    },
    {
      platform: "google_business",
      label: "Google Business Profile",
      oauthConfigured: gbpPublishingConfigured(),
      liveEligible,
      ...platformHealthStatus(gbpPublishingConfigured(), liveEligible),
    },
    {
      platform: "tiktok",
      label: "TikTok",
      oauthConfigured: tiktokPublishingConfigured(),
      liveEligible,
      ...platformHealthStatus(tiktokPublishingConfigured(), liveEligible),
    },
  ];
}

export interface ConnectorResult {
  ok: boolean;
  detail: string;
}

export async function dispatchPublish(
  integration: PublishingIntegration,
  body: string,
): Promise<ConnectorResult | null> {
  if (!publishingLive()) return null;
  // Capability gate before any live publish attempt (registry is live-ready;
  // flags remain OFF so this path is only hit when PUBLISHING_LIVE is on).
  try {
    assertConnectorAction(integration.platform, "publish");
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "Connector publish not supported",
    };
  }
  let token: string;
  try {
    token = decryptToken(integration.encryptedToken);
  } catch {
    return { ok: false, detail: "Could not decrypt the stored token (rotate PUBLISHING_TOKEN_KEY?)" };
  }
  const platform = integration.platform.toLowerCase();
  try {
    if (platform.includes("facebook") || platform.includes("instagram")) {
      if (!metaPublishingConfigured()) return null;
      return await postToMeta(integration, token, body);
    }
    if (platform.includes("linkedin")) {
      return await postToLinkedIn(integration, token, body);
    }
    if (platform.includes("google")) {
      if (!gbpPublishingConfigured()) return null;
      return await postToGoogleBusiness(integration, token, body);
    }
    if (platform.includes("tiktok")) {
      if (!tiktokPublishingConfigured()) return null;
      return await postToTikTok(integration, token, body);
    }
    if (platform.includes("email")) {
      return await postToEmail(integration, body);
    }
  } catch (err) {
    return { ok: false, detail: `Platform API error: ${String(err)}` };
  }
  return null;
}

function metaGraphError(json: unknown, fallback: string): string {
  const err = (json as { error?: { message?: string; error_user_msg?: string } })?.error;
  return err?.error_user_msg ?? err?.message ?? fallback;
}

const GBP_PARENT_RE = /^accounts\/[^/]+\/locations\/[^/]+$/;

async function postToMeta(
  integration: PublishingIntegration,
  token: string,
  body: string,
): Promise<ConnectorResult> {
  const accountId = integration.accountName?.trim();
  if (!accountId) {
    return { ok: false, detail: "Meta: account id missing on integration (page / IG user id)" };
  }
  const platform = integration.platform.toLowerCase();
  if (platform.includes("instagram")) {
    return postToInstagram(accountId, token, body);
  }
  const res = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(accountId)}/feed`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: body, access_token: token }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || json.error) {
    return { ok: false, detail: `Meta: ${metaGraphError(json, res.statusText)}` };
  }
  return { ok: true, detail: `Posted to Facebook (post id: ${json.id})` };
}

async function postToInstagram(
  igUserId: string,
  token: string,
  body: string,
): Promise<ConnectorResult> {
  const imageMatch = body.match(/\[image:\s*(https?:\/\/[^\]\s]+)\s*]/i);
  const imageUrl = imageMatch?.[1]?.trim();
  if (!imageUrl) {
    return {
      ok: false,
      detail:
        "Instagram: live publish requires an image — include [image: https://…] in the post body or attach a DAM asset",
    };
  }
  const caption = body.replace(/\[image:\s*https?:\/\/[^\]\s]+\s*]/i, "").trim();
  const createRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(igUserId)}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
    },
  );
  const createJson = (await createRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!createRes.ok || createJson.error || !createJson.id) {
    return { ok: false, detail: `Instagram: ${metaGraphError(createJson, createRes.statusText)}` };
  }
  const publishRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(igUserId)}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: createJson.id, access_token: token }),
    },
  );
  const publishJson = (await publishRes.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string };
  };
  if (!publishRes.ok || publishJson.error) {
    return { ok: false, detail: `Instagram: ${metaGraphError(publishJson, publishRes.statusText)}` };
  }
  return { ok: true, detail: `Posted to Instagram (media id: ${publishJson.id})` };
}

async function postToLinkedIn(
  integration: PublishingIntegration,
  token: string,
  body: string,
): Promise<ConnectorResult> {
  const author = integration.accountName?.trim();
  if (!author) {
    return { ok: false, detail: "LinkedIn: author URN missing on integration" };
  }
  const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: body },
          shareMediaCategory: "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    return { ok: false, detail: `LinkedIn: ${res.status} ${errText.slice(0, 200)}` };
  }
  return { ok: true, detail: `Posted to LinkedIn (${res.headers.get("x-restli-id") ?? "ok"})` };
}

async function postToGoogleBusiness(
  integration: PublishingIntegration,
  token: string,
  body: string,
): Promise<ConnectorResult> {
  const parent = integration.accountName?.trim();
  if (!parent) {
    return {
      ok: false,
      detail: "Google Business Profile: location path missing (accounts/{id}/locations/{id})",
    };
  }
  if (!GBP_PARENT_RE.test(parent)) {
    return {
      ok: false,
      detail: `Google Business Profile: invalid location path "${parent}" — expected accounts/{id}/locations/{id}`,
    };
  }
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${parent}/localPosts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      languageCode: "en-AU",
      summary: body.slice(0, 1500),
      topicType: "STANDARD",
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    name?: string;
    error?: { message?: string };
  } | null;
  if (!res.ok) {
    return { ok: false, detail: `Google Business Profile: ${json?.error?.message ?? res.statusText}` };
  }
  return {
    ok: true,
    detail: `Posted to Google Business Profile${json?.name ? ` (${json.name})` : ""}`,
  };
}

async function postToTikTok(
  integration: PublishingIntegration,
  token: string,
  body: string,
): Promise<ConnectorResult> {
  const openId = integration.accountName?.trim();
  if (!openId) {
    return { ok: false, detail: "TikTok: creator open_id missing on integration" };
  }
  const photoMatch = body.match(/\[image:\s*(https?:\/\/[^\]\s]+)\s*]/i);
  const photoUrl = photoMatch?.[1]?.trim();
  if (!photoUrl) {
    return {
      ok: false,
      detail:
        "TikTok: live publish requires media — include [image: https://…] in the post body or attach a DAM asset",
    };
  }
  const title = body.replace(/\[image:\s*https?:\/\/[^\]\s]+\s*]/i, "").trim().slice(0, 2200);
  const res = await fetch("https://open.tiktokapis.com/v2/post/publish/content/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      post_info: {
        title: title || "Update",
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_comment: false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        photo_cover_index: 0,
        photo_images: [photoUrl],
      },
      post_mode: "DIRECT_POST",
      media_type: "PHOTO",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    data?: { publish_id?: string };
    error?: { message?: string };
  };
  if (!res.ok || json.error) {
    return { ok: false, detail: `TikTok: ${json.error?.message ?? res.statusText}` };
  }
  return { ok: true, detail: `Posted to TikTok (publish id: ${json.data?.publish_id ?? "ok"})` };
}

async function postToEmail(
  integration: PublishingIntegration,
  body: string,
): Promise<ConnectorResult> {
  const to = integration.accountName?.trim();
  if (!to) {
    return { ok: false, detail: "Email: list / segment address missing on integration" };
  }
  const result = await sendEmail({
    to,
    subject: body.split("\n")[0]?.slice(0, 120) || "Update",
    html: `<div>${body.replace(/\n/g, "<br/>")}</div>`,
  });
  return { ok: result.ok, detail: `Email: ${result.detail}` };
}
