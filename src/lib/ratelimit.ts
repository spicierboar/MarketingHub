// Rate limiting (SaaS T7 hardening).
//
// Two complementary layers, both fail-safe and env-gated like every other
// external concern:
//   • PER-TENANT / PER-PLAN limits on expensive tenant operations (AI
//     generation) — the burst complement to the monthly AI cost cap. Higher
//     plans get roomier limits (src/lib/plans.ts → PlanLimits). One tenant's
//     usage can NEVER consume another's allowance — the key is the tenantId.
//   • PUBLIC-SURFACE limits on the truly-open, no-login endpoints (self-serve
//     signup, the tokenised client-approval actions) — fixed caps keyed by
//     client IP, so anonymous abuse (workspace spam, token brute-force) is
//     throttled without a session.
//
// Backend (mirrors src/lib/storage.ts — pluggable, in-memory default):
//   • Default: an in-memory fixed-window counter store, kept on globalThis so it
//     survives Next's dev HMR (exactly like the JSON store). Correct for a
//     single node / the demo; approximate across a serverless fleet (each
//     instance counts independently — the effective limit is limit×instances).
//   • Production multi-instance drop-in: replace counterStore()'s hit() with an
//     atomic Supabase RPC — `select rate_hit(bucket, key, window_start, limit)`
//     incrementing a (bucket, key, window) row and returning the new count. That
//     keeps the app on its existing stack (Supabase), no new KV vendor. The
//     assert* API is already async so the swap needs no call-site changes.
//
// Escape hatch: CC_RATE_LIMIT=off disables all limiting (load tests, demos).

import { headers } from "next/headers";
import { getTenant } from "@/lib/db";
import { planFor } from "@/lib/plans";

// ---- Backend: in-memory fixed-window counters ---------------------------------

interface Counter {
  windowId: number; // Math.floor(nowSec / windowSeconds)
  count: number;
  windowSeconds: number; // stored here so sweep never parses it out of the key
}

// One counter per (bucket, key, windowSeconds) — the windowId resets the count
// as time rolls into the next window, so the map is bounded by the number of
// DISTINCT keys, not by elapsed time. A size-triggered sweep evicts stale keys
// (an IP-keyed public bucket can otherwise accumulate one-off entries).
interface RateStore {
  counters: Map<string, Counter>;
}

function counterStore(): RateStore {
  const g = globalThis as unknown as { __ccRateStore?: RateStore };
  if (!g.__ccRateStore) g.__ccRateStore = { counters: new Map() };
  return g.__ccRateStore;
}

const MAX_COUNTERS = 50_000; // sweep trigger — far above any real working set
const SWEEP_TARGET = Math.floor(MAX_COUNTERS * 0.9); // hard-evict down to this

function sweep(counters: Map<string, Counter>, nowSec: number): void {
  if (counters.size < MAX_COUNTERS) return;
  // 1. Drop fully-elapsed windows — a counter whose window has passed can never
  //    be hit again (the next hit starts a fresh windowId), so it is safe to
  //    drop. windowSeconds comes from the counter itself, never parsed from the
  //    key (a public key is a client IP and must not be trusted to be delimiter-
  //    free — parsing it let a crafted x-forwarded-for evict a LIVE counter).
  for (const [k, c] of counters) {
    if ((c.windowId + 1) * c.windowSeconds < nowSec) counters.delete(k);
  }
  // 2. Hard bound: if a same-window flood of fresh keys (e.g. rotated
  //    x-forwarded-for) still holds us at the cap with nothing elapsed to free,
  //    evict the oldest-inserted counters so both memory AND the O(n) scan stay
  //    bounded (dropping below the cap makes the next requests early-return).
  //    Evicting a still-live counter resets that key's limit early — an
  //    acceptable fail-open only under extreme cardinality (an attacker minting
  //    tens of thousands of distinct keys), far better than unbounded growth.
  if (counters.size >= MAX_COUNTERS) {
    let toEvict = counters.size - SWEEP_TARGET;
    for (const k of counters.keys()) {
      counters.delete(k); // Map iterates in insertion order → oldest first
      if (--toEvict <= 0) break;
    }
  }
}

export function rateLimitEnabled(): boolean {
  return process.env.CC_RATE_LIMIT?.trim().toLowerCase() !== "off";
}

export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

// The one primitive. Charges `cost` units against the (bucket,key) window and
// reports whether they fit. A DENIED request consumes nothing — so the count
// never exceeds the limit (no unbounded growth) and a smaller later request can
// still pass; the window reset clears it. `cost` > 1 is an atomic all-or-nothing
// charge (e.g. Studio compare mode generates 3 variants in one action).
export function checkRate(
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number,
  cost = 1,
): RateDecision {
  // limit <= 0 means "no limit configured" → always allow (fail-open on
  // misconfig rather than lock everyone out). Disabled flag / non-positive cost
  // → same.
  if (!rateLimitEnabled() || limit <= 0 || windowSeconds <= 0 || cost <= 0) {
    return { allowed: true, limit, remaining: limit, retryAfterSeconds: 0 };
  }
  const nowSec = Date.now() / 1000;
  const windowId = Math.floor(nowSec / windowSeconds);
  const mapKey = `${bucket}|${key}|${windowSeconds}`;
  const { counters } = counterStore();
  sweep(counters, nowSec);
  let c = counters.get(mapKey);
  if (!c || c.windowId !== windowId) {
    c = { windowId, count: 0, windowSeconds };
    counters.set(mapKey, c);
  }
  const allowed = c.count + cost <= limit;
  if (allowed) c.count += cost; // consume only when granted → count ≤ limit always
  const resetAtSec = (windowId + 1) * windowSeconds;
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - c.count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil(resetAtSec - nowSec)),
  };
}

// Test/ops helper: drop every counter whose map key contains any of the given
// tokens. Used by the isolation self-test to leave the rate store exactly as it
// found it (its throwaway tenant ids), and to reset between window-straddle
// retries. NOT a request-path function.
export function forgetRateCountersContaining(tokens: string[]): void {
  if (tokens.length === 0) return;
  const { counters } = counterStore();
  for (const k of counters.keys()) {
    if (tokens.some((t) => t && k.includes(t))) counters.delete(k);
  }
}

// Thrown when a limit is exceeded. Distinct type so callers/routes can map it to
// HTTP 429; the message is safe to surface to the user (no internals).
export class RateLimitError extends Error {
  readonly retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Async so the production Supabase-RPC backend is a drop-in with no call-site
// change (same rationale as the T0 async-repo conversion).
export async function assertRate(
  bucket: string,
  key: string,
  limit: number,
  windowSeconds: number,
  label: string,
  cost = 1,
): Promise<void> {
  const d = checkRate(bucket, key, limit, windowSeconds, cost);
  if (!d.allowed) {
    throw new RateLimitError(
      `Too many ${label} — please wait ${d.retryAfterSeconds}s and try again.`,
      d.retryAfterSeconds,
    );
  }
}

// ---- Per-tenant / per-plan limits ---------------------------------------------

// AI generation burst limit, scaled by the tenant's plan. Called alongside
// assertAiBudget at every AI entry point. Keyed by tenantId → strict isolation.
// Counts every generation attempt regardless of AI cost, so it bites even in
// template mode (no API key) — verifiable with zero external accounts. Pass
// `generations` when one action produces several (Studio compare mode makes 3):
// the whole batch is charged atomically so the burst ceiling isn't undercounted.
export async function assertAiRateLimit(tenantId: string, generations = 1): Promise<void> {
  const plan = planFor((await getTenant(tenantId))?.plan);
  await assertRate(
    "ai",
    tenantId,
    plan.limits.aiPerMinute,
    60,
    `AI requests on the ${plan.name} plan (max ${plan.limits.aiPerMinute}/min)`,
    generations,
  );
}

// ---- Public-surface limits ----------------------------------------------------

// Fixed caps for the no-login surfaces. Not plan-scaled — there's no tenant yet
// (signup) or the caller is anonymous (client-approval links).
export const PUBLIC_LIMITS: Record<string, { limit: number; windowSeconds: number; label: string }> = {
  // New workspaces per IP per hour — throttles self-serve signup spam.
  signup: { limit: 5, windowSeconds: 3600, label: "sign-up attempts" },
  // Actions per IP per minute on tokenised client-approval links — throttles
  // token brute-force / comment spam on the public /approve surface.
  client_approval: { limit: 20, windowSeconds: 60, label: "requests" },
  // Guest checkout submissions per IP per minute on /order/[companyId].
  guest_order: { limit: 8, windowSeconds: 60, label: "order submissions" },
  guest_booking: { limit: 8, windowSeconds: 60, label: "booking submissions" },
};

export async function assertPublicRate(
  bucket: keyof typeof PUBLIC_LIMITS | string,
  key: string,
): Promise<void> {
  const cfg = PUBLIC_LIMITS[bucket];
  if (!cfg) return; // unknown bucket → no limit (fail-open)
  await assertRate(`public:${bucket}`, key, cfg.limit, cfg.windowSeconds, cfg.label);
}

// Best-effort client IP for keying public limits. x-forwarded-for is only
// trustworthy behind a proxy we control (Vercel sets it); an attacker with a
// direct connection can rotate it, so this is a throttle, not an authz control
// (the no-login surfaces keep their single-use token guards regardless). Falls
// back to a shared bucket when no IP is available — worst case a shared cap.
export async function clientIp(): Promise<string> {
  try {
    const h = await headers();
    const raw = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
    // Keep only IP-shaped characters (IPv4/IPv6) and bound the length: a crafted
    // header must not be able to inject the counter-key delimiter or mint an
    // oversized key. Anything else collapses to a shared "unknown" bucket.
    const safe = raw.replace(/[^0-9a-fA-F:.]/g, "").slice(0, 45);
    return safe || "unknown";
  } catch {
    return "unknown";
  }
}
