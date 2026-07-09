// Visuals connectors (production drop-in for Module 2 / Phase 4).
//
// Live image + short-form video generation sit behind VISUALS_LIVE and provider
// keys (e.g. REPLICATE_API_TOKEN, RUNWAY_API_KEY — the exact provider is a
// batched owner decision). Until then, src/lib/ai/imagegen.ts and videogen.ts
// produce deterministic placeholder bytes so the full DAM → approval → attach
// pipeline is testable with zero external accounts. Mirrors adsLive() /
// publishingLive().

export function visualsLive(): boolean {
  return process.env.VISUALS_LIVE === "true";
}

// Co-gate: live generation needs a storage backend for the output bytes.
export function visualsProviderConfigured(): boolean {
  if (!visualsLive()) return false;
  return !!(
    process.env.REPLICATE_API_TOKEN?.trim() ||
    process.env.RUNWAY_API_KEY?.trim()
  );
}
