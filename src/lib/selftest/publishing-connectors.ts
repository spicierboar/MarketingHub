// Self-test helpers for live publishing connectors (M24).

import {
  buildPublishingPlatformHealth,
  dispatchPublish,
  publishingLive,
  resolvePublishingMode,
} from "@/lib/publishing-connectors";
import {
  assertConnectorAction,
  connectorSupports,
  listConnectorCapabilityMatrix,
} from "@/lib/connectors/capability-registry";
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
  const mode = resolvePublishingMode();
  let fetchCalls = 0;
  const result = await dispatchPublish(stubIntegration("Facebook"), "hello", {
    fetcher: async () => {
      fetchCalls += 1;
      return Response.json({});
    },
  });
  const ok =
    !live &&
    mode.kind === "simulate" &&
    result.blocked === true &&
    fetchCalls === 0;
  return {
    ok,
    detail: `live=${live} mode=${mode.kind} blocked=${result.blocked === true} fetchCalls=${fetchCalls}`,
  };
}

export async function checkPublishingLiveMisconfigurationFailsClosed(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const names = [
    "CC_ENV",
    "PUBLISHING_LIVE",
    "PUBLISHING_TOKEN_KEY",
    "META_APP_ID",
    "META_APP_SECRET",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  let fetchCalls = 0;
  try {
    process.env.CC_ENV = "development";
    process.env.PUBLISHING_LIVE = "true";
    process.env.PUBLISHING_TOKEN_KEY = "self-test-key";
    delete process.env.META_APP_ID;
    delete process.env.META_APP_SECRET;
    const result = await dispatchPublish(stubIntegration("Facebook"), "hello", {
      fetcher: async () => {
        fetchCalls += 1;
        return Response.json({});
      },
    });
    return {
      ok: !result.ok && result.blocked === true && fetchCalls === 0,
      detail: `ok=${result.ok} blocked=${result.blocked === true} fetchCalls=${fetchCalls}`,
    };
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
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

export function checkConnectorCapabilityRegistry(): { ok: boolean; detail: string } {
  const rows = listConnectorCapabilityMatrix();
  const metaPublish = connectorSupports("meta", "publish");
  const gbpDms = connectorSupports("google_business", "dms");
  let threw = false;
  try {
    assertConnectorAction("google_business", "dms");
  } catch {
    threw = true;
  }
  let publishOk = false;
  try {
    assertConnectorAction("facebook", "publish");
    publishOk = true;
  } catch {
    publishOk = false;
  }
  const ok = rows.length >= 7 && metaPublish && !gbpDms && threw && publishOk;
  return {
    ok,
    detail: `rows=${rows.length} metaPublish=${metaPublish} gbpDmsBlocked=${threw} fbPublish=${publishOk}`,
  };
}