// Real platform connectors (production drop-in for the simulated publisher).
//
// The publishing engine (src/lib/publishing.ts) keeps its full eligibility chain
// — kill switch, crisis/sandbox gates, legal-hold skips, asset-rights re-check,
// retries and logging. Only the final "send to the platform" step changes: when
// PUBLISHING_LIVE=true and the relevant OAuth app is configured, dispatchPublish
// makes the real API call using decryptToken(integration.encryptedToken).
// Otherwise it returns null and the engine uses the deterministic simulator, so
// the demo still runs with zero external accounts.
//
// These are real request shapes; they cannot be exercised without the owner's
// platform apps + tokens (see HANDOVER "Go to production").

import { decryptToken } from "@/lib/crypto";
import { sendEmail } from "@/lib/email";
import type { PublishingIntegration } from "@/lib/types";

export function publishingLive(): boolean {
  return process.env.PUBLISHING_LIVE === "true";
}

export interface ConnectorResult {
  ok: boolean;
  detail: string;
}

// Returns a ConnectorResult when it handled the publish for a live platform, or
// null to fall back to the simulator (platform unconfigured / demo).
export async function dispatchPublish(
  integration: PublishingIntegration,
  body: string,
): Promise<ConnectorResult | null> {
  if (!publishingLive()) return null;
  let token: string;
  try {
    token = decryptToken(integration.encryptedToken);
  } catch {
    return { ok: false, detail: "Could not decrypt the stored token (rotate PUBLISHING_TOKEN_KEY?)" };
  }
  const platform = integration.platform.toLowerCase();
  try {
    if (platform.includes("facebook") || platform.includes("instagram")) {
      return await postToMeta(integration, token, body);
    }
    if (platform.includes("linkedin")) {
      return await postToLinkedIn(integration, token, body);
    }
    if (platform.includes("google")) {
      return await postToGoogleBusiness(integration, token, body);
    }
    if (platform.includes("email")) {
      return await postToEmail(integration, body);
    }
  } catch (err) {
    return { ok: false, detail: `Platform API error: ${String(err)}` };
  }
  // Unknown platform → let the simulator handle it.
  return null;
}

// Meta Graph API — publish to a Facebook Page feed (Instagram uses the same
// graph with a media-container flow). accountName carries the page/account id.
async function postToMeta(
  integration: PublishingIntegration,
  token: string,
  body: string,
): Promise<ConnectorResult> {
  const pageId = integration.accountName; // owner stores the page id here
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/feed`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: body, access_token: token }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!res.ok || json.error) {
    return { ok: false, detail: `Meta: ${json.error?.message ?? res.statusText}` };
  }
  return { ok: true, detail: `Posted to ${integration.platform} (post id: ${json.id})` };
}

// LinkedIn UGC post (organization or member share).
async function postToLinkedIn(
  integration: PublishingIntegration,
  token: string,
  body: string,
): Promise<ConnectorResult> {
  const author = integration.accountName; // e.g. "urn:li:organization:123"
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
    return { ok: false, detail: `LinkedIn: ${res.status} ${res.statusText}` };
  }
  return { ok: true, detail: `Posted to LinkedIn (${res.headers.get("x-restli-id") ?? "ok"})` };
}

// Google Business Profile local post.
async function postToGoogleBusiness(
  integration: PublishingIntegration,
  token: string,
  body: string,
): Promise<ConnectorResult> {
  const parent = integration.accountName; // "accounts/{id}/locations/{id}"
  const res = await fetch(
    `https://mybusiness.googleapis.com/v4/${parent}/localPosts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ languageCode: "en-AU", summary: body, topicType: "STANDARD" }),
    },
  );
  if (!res.ok) {
    return { ok: false, detail: `Google Business Profile: ${res.status} ${res.statusText}` };
  }
  return { ok: true, detail: "Posted to Google Business Profile" };
}

// Email platform — send via Resend to the integration's list address.
async function postToEmail(
  integration: PublishingIntegration,
  body: string,
): Promise<ConnectorResult> {
  const to = integration.accountName; // list / segment address
  const result = await sendEmail({
    to,
    subject: body.split("\n")[0]?.slice(0, 120) || "Update",
    html: `<div>${body.replace(/\n/g, "<br/>")}</div>`,
  });
  return { ok: result.ok, detail: `Email: ${result.detail}` };
}
