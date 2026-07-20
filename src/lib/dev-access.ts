import { timingSafeEqual } from "node:crypto";
import { devToolsOpen, trustworthyLocalDemoRequest } from "@/lib/env";
import type { User } from "@/lib/types";

function parsedOrigin(raw: string): URL | null {
  try {
    return new URL(raw.includes("://") ? raw : `http://${raw}`);
  } catch {
    return null;
  }
}

function sameAuthority(left: URL, right: URL): boolean {
  return (
    left.hostname.toLowerCase() === right.hostname.toLowerCase() &&
    left.port === right.port
  );
}

function sameOrigin(left: URL, right: URL): boolean {
  return left.protocol === right.protocol && sameAuthority(left, right);
}

/**
 * Origin of the server that actually received the request. Forwarding headers
 * are deliberately ignored: they are caller-controlled on a local dev server.
 */
export function actualRequestOrigin(
  headers: Headers,
  requestUrl?: string,
): string | null {
  const hostUrl = parsedOrigin(headers.get("host") ?? "");
  if (!hostUrl) return null;
  const receivedUrl = requestUrl ? parsedOrigin(requestUrl) : null;
  if (requestUrl && (!receivedUrl || !sameAuthority(hostUrl, receivedUrl))) {
    return null;
  }
  const protocol = receivedUrl?.protocol === "https:" ? "https:" : "http:";
  return `${protocol}//${hostUrl.host}`;
}

export function localDemoMutationAllowed(
  headers: Headers,
  requestUrl?: string,
): boolean {
  const actualOrigin = actualRequestOrigin(headers, requestUrl);
  return Boolean(actualOrigin && trustworthyLocalDemoRequest(actualOrigin));
}

/** CSRF gate for HTTP mutation routes in addition to the local-demo gate. */
export function localDemoPostAllowed(
  headers: Headers,
  requestUrl: string,
  method: string,
): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const actualOrigin = actualRequestOrigin(headers, requestUrl);
  const browserOrigin = parsedOrigin(headers.get("origin") ?? "");
  return Boolean(
    actualOrigin &&
      browserOrigin &&
      sameOrigin(new URL(actualOrigin), browserOrigin) &&
      localDemoMutationAllowed(headers, requestUrl),
  );
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function selfTestSecretValid(
  provided: string | null | undefined,
): boolean {
  const expected = process.env.CC_SELFTEST_SECRET?.trim();
  return Boolean(
    expected &&
      provided &&
      constantTimeEquals(provided.trim(), expected),
  );
}

export function selfTestSecretConfigured(): boolean {
  return Boolean(process.env.CC_SELFTEST_SECRET?.trim());
}

/** Fixture emails allowed for staging /dev quick-login (no free-text provision). */
export const STAGING_QUICK_LOGIN_ALLOWLIST = [
  "admin@staging-fixture.invalid",
  "staff-1@staging-fixture.invalid",
  "approver-saffron-laneway@staging-fixture.invalid",
] as const;

export function stagingQuickLoginEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return STAGING_QUICK_LOGIN_ALLOWLIST.some((allowed) => allowed === normalized);
}

/**
 * Quick-login POST gate: browser Origin must match the receiving Host
 * (scheme ignored — Host has no protocol; staging is HTTPS). When
 * CC_SELFTEST_SECRET is set the form must present a matching secret.
 */
export function quickLoginRequestAllowed(input: {
  headers: Headers;
  providedSecret?: string | null;
}): boolean {
  const hostUrl = parsedOrigin(input.headers.get("host") ?? "");
  const browserOrigin = parsedOrigin(input.headers.get("origin") ?? "");
  if (!hostUrl || !browserOrigin || !sameAuthority(hostUrl, browserOrigin)) {
    return false;
  }
  const expected = process.env.CC_SELFTEST_SECRET?.trim();
  if (expected) return selfTestSecretValid(input.providedSecret);
  return true;
}

/**
 * Staging/dev diagnostics stay open when CC_SELFTEST_SECRET is unset
 * (docs/ENVIRONMENTS.md). When the secret is set, a matching Bearer/?key
 * unlocks them without requiring an existing Admin session — otherwise
 * operators cannot reach self-test before logging in. Production never
 * opens without the secret.
 */
export function diagnosticAccessAllowed(input: {
  headers: Headers;
  requestUrl?: string;
  providedSecret?: string | null;
  user?: Pick<User, "role"> | null;
}): boolean {
  void input.user;
  if (localDemoMutationAllowed(input.headers, input.requestUrl)) return true;
  const expected = process.env.CC_SELFTEST_SECRET?.trim();
  if (expected) return selfTestSecretValid(input.providedSecret);
  return devToolsOpen();
}
