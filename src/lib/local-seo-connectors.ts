// Local SEO live gate (M51 / W7 module 11).
//
// LOCAL_SEO_LIVE — off by default. When true, governed Q&A drafts may be
// persisted as ai_draft rows and enrichment paths treat recommendations as
// production-ready. Staging preview deployments never honour *_LIVE flags
// (same contract as PUBLISHING_LIVE — see docs/DEPLOYMENT.md).
//
// Gate on appEnv() (VERCEL_ENV-aware), NOT NODE_ENV.

import { liveIntegrationsAllowed } from "@/lib/env";

/** True when live local-SEO enrichment (draft persistence) is permitted. */
export function localSeoLive(): boolean {
  if (process.env.LOCAL_SEO_LIVE !== "true") return false;
  if (!liveIntegrationsAllowed()) return false;
  return true;
}
