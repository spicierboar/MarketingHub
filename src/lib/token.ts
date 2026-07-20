// Generic signed, self-expiring payload tokens (SaaS T6).
//
// The same HMAC pattern proven for OAuth state (src/lib/oauth.ts), factored out
// so it can carry any small JSON payload with tamper-evidence + an expiry.
// Used for tokenised no-login CLIENT APPROVAL links: an external client opens
// /approve/<token> and acts on exactly one content item, with no account. The
// token binds tenant + company + content so it can never reach anything else;
// verification is timing-safe and the payload is rejected once stale.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  appEnv,
  localDemoEnabled,
  looksLikeLocalOrigin,
  type AppEnv,
} from "@/lib/env";

const localSimulationKey = randomBytes(32).toString("base64url");

export function resolvePublishingTokenKey(input: {
  env: AppEnv;
  configuredKey?: string;
  localKey?: string;
  localSimulation?: boolean;
}): string {
  const configured = input.configuredKey?.trim();
  if (configured) return configured;
  if (
    input.env === "development" &&
    input.localSimulation === true &&
    input.localKey
  ) {
    return input.localKey;
  }
  throw new Error(
    "PUBLISHING_TOKEN_KEY is required outside explicit local/test simulation.",
  );
}

function localTokenSimulationAllowed(): boolean {
  if (appEnv() !== "development") return false;
  if (process.env.NODE_ENV === "test") return true;
  if (localDemoEnabled() || looksLikeLocalOrigin()) return true;
  return (
    !process.env.VERCEL &&
    process.env.CI !== "true" &&
    !(process.env.APP_ORIGIN || "").trim()
  );
}

export function publishingTokenKey(): string {
  return resolvePublishingTokenKey({
    env: appEnv(),
    configuredKey: process.env.PUBLISHING_TOKEN_KEY,
    localKey: localSimulationKey,
    localSimulation: localTokenSimulationAllowed(),
  });
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

// Sign an arbitrary JSON payload; `exp` (ms epoch) is stamped in and covered by
// the signature. Caller supplies issuedAt/exp via ttlMs.
export function signPayload<T extends object>(
  payload: T,
  opts: { issuedAt: number; ttlMs: number },
): string {
  const body = { ...payload, iat: opts.issuedAt, exp: opts.issuedAt + opts.ttlMs };
  const encoded = b64url(Buffer.from(JSON.stringify(body), "utf8"));
  const sig = b64url(createHmac("sha256", publishingTokenKey()).update(encoded).digest());
  return `${encoded}.${sig}`;
}

// Verify signature + expiry. `now` is passed in (callers already have a clock)
// so this stays pure. Returns the payload (with iat/exp) or null. Callers SHOULD
// pass `validate` to assert the full expected shape — a validly-signed but
// incomplete payload must never be returned as trusted (mirrors verifyState).
export function verifyPayload<T extends object>(
  raw: string | null | undefined,
  now: number,
  validate?: (p: unknown) => boolean,
): (T & { iat: number; exp: number }) | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  let key: string;
  try {
    key = publishingTokenKey();
  } catch {
    return null;
  }
  const expected = b64url(createHmac("sha256", key).update(encoded).digest());
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(fromB64url(encoded).toString("utf8")) as T & {
      iat: number;
      exp: number;
    };
    if (typeof parsed.exp !== "number" || now > parsed.exp) return null;
    if (validate && !validate(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
