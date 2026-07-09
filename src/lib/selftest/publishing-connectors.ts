// Self-test helpers for live publishing connectors (M24).

import {
  buildPublishingPlatformHealth,
  dispatchPublish,
  publishingLive,
} from "@/lib/publishing-connectors";
import { buildIntegrationHealthBundle } from "@/lib/security-slice";
import type { PublishingIntegration } from "@/lib/types";

function stubIntegration(platform: string): PublishingIntegration {
  return {
    id: "int_pub_stub",
    companyId: "co_pub_stub",
    platform,
    accountName: "stub-account",
    status: "connected",
    encryptedToken: "enc_stub",
    tokenLastFour: "stub",
    connectedById: "u_stub",
    connectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function checkPublishingSimWhenLiveOff(): Promise<{ ok: boolean; detail: string }> {
  const live = publishingLive();
  const result = await dispatchPublish(stubIntegration("Facebook"), "hello");
  const ok = !live && result === null;
  return { ok, detail: `live=${live} dispatch=${result === null ? "null" : "handled"}` };
}

export async function checkPublishingPlatformHealthRows(): Promise<{ ok: boolean; detail: string }> {
  const rows = buildPublishingPlatformHealth();
  const platforms = rows.map((r) => r.platform).sort().join(",");
  const ok =
    rows.length === 3 &&
    platforms === "google_business,meta,tiktok" &&
    rows.every((r) => !r.liveEligible);
  return { ok, detail: `count=${rows.length} platforms=${platforms}` };
}

export async function checkPublishingHealthInBundle(): Promise<{ ok: boolean; detail: string }> {
  const bundle = buildIntegrationHealthBundle("tn_pub_health");
  const pub = bundle.rows.find((r) => r.kind === "publishing");
  const ok =
    bundle.publishingPlatforms.length === 3 &&
    pub?.status === "simulated" &&
    bundle.publishingPlatforms.every((r) => r.status === "simulated" || r.status === "offline");
  return {
    ok,
    detail: `platforms=${bundle.publishingPlatforms.length} pub=${pub?.status}`,
  };
}