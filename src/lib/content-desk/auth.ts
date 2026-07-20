import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getMembership, getTenant, getUser } from "@/lib/db";
import { TENANT_ROLE_TIER, type ActingUser } from "@/lib/types";
import { consumeContentDeskDelegation } from "./delegation-ledger";

export type ContentDeskActor = ActingUser;

type AuthResult =
  | { ok: true; actor: ContentDeskActor }
  | { ok: false; status: 401 | 403 | 503; error: string };

interface DelegationVerificationOptions {
  nowSeconds?: number;
}

export interface ContentDeskDelegationClaims {
  iss: "content-desk";
  aud: "command-centre";
  sub: string;
  tenantId: string;
  iat: number;
  exp: number;
  jti: string;
}

const DELEGATION_HEADER = "x-content-desk-actor";
const EXPECTED_JWT_HEADER = { alg: "HS256", typ: "JWT" } as const;
const JWT_HEADER_KEYS = ["alg", "typ"];
const CLAIM_KEYS = ["aud", "exp", "iat", "iss", "jti", "sub", "tenantId"];

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function constantTimeSecretEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(digest(actual), digest(expected));
}

function encodeJson(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson(value: string): unknown {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

function delegationSignature(
  encodedHeader: string,
  encodedPayload: string,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");
}

/** Content Desk uses this contract to mint one short-lived actor delegation. */
export function signContentDeskDelegation(
  input: { actorId: string; tenantId: string; jti?: string },
  secret: string,
  options: { nowSeconds?: number } = {},
): string {
  const iat = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  const claims: ContentDeskDelegationClaims = {
    iss: "content-desk",
    aud: "command-centre",
    sub: input.actorId,
    tenantId: input.tenantId,
    iat,
    exp: iat + 60,
    jti: input.jti ?? randomUUID(),
  };
  const encodedHeader = encodeJson(EXPECTED_JWT_HEADER);
  const encodedPayload = encodeJson(claims);
  return `${encodedHeader}.${encodedPayload}.${delegationSignature(
    encodedHeader,
    encodedPayload,
    secret,
  )}`;
}

function isDelegationClaims(
  value: unknown,
  nowSeconds: number,
): value is ContentDeskDelegationClaims {
  if (!isRecord(value) || !hasExactKeys(value, CLAIM_KEYS)) return false;
  const claims = value;
  return (
    claims.iss === "content-desk" &&
    claims.aud === "command-centre" &&
    typeof claims.sub === "string" &&
    claims.sub.length > 0 &&
    typeof claims.tenantId === "string" &&
    claims.tenantId.length > 0 &&
    typeof claims.jti === "string" &&
    claims.jti.length > 0 &&
    Number.isInteger(claims.iat) &&
    Number.isInteger(claims.exp) &&
    (claims.iat as number) <= nowSeconds &&
    nowSeconds < (claims.exp as number) &&
    (claims.exp as number) - (claims.iat as number) === 60
  );
}

export function verifyContentDeskDelegation(
  token: string,
  secret: string,
  options: DelegationVerificationOptions = {},
): ContentDeskDelegationClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  if (!encodedHeader || !encodedPayload || !signature) return null;
  const expected = delegationSignature(encodedHeader, encodedPayload, secret);
  if (!constantTimeSecretEqual(signature, expected)) return null;
  try {
    const header = decodeJson(encodedHeader);
    if (
      !isRecord(header) ||
      !hasExactKeys(header, JWT_HEADER_KEYS) ||
      header.alg !== EXPECTED_JWT_HEADER.alg ||
      header.typ !== EXPECTED_JWT_HEADER.typ
    ) {
      return null;
    }
    const claims = decodeJson(encodedPayload);
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
    return isDelegationClaims(claims, nowSeconds) ? claims : null;
  } catch {
    return null;
  }
}

export function isContentDeskOperator(actor: ActingUser): boolean {
  return (
    actor.tenantRole === "owner" ||
    actor.tenantRole === "admin" ||
    (actor.tenantRole === "member" && actor.roleTitle === "content_operator")
  );
}

export async function authenticateContentDeskRequest(
  request: Pick<NextRequest, "headers">,
  environment: NodeJS.ProcessEnv = process.env,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<AuthResult> {
  const expected = environment.CONTENT_DESK_INTERNAL_TOKEN?.trim();
  const signingSecret = environment.CONTENT_DESK_ACTOR_SIGNING_SECRET?.trim();
  if (
    !expected ||
    expected.length < 32 ||
    !signingSecret ||
    signingSecret.length < 32 ||
    constantTimeSecretEqual(expected, signingSecret)
  ) {
    return {
      ok: false,
      status: 503,
      error: "Content Desk service access is not configured",
    };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match || !constantTimeSecretEqual(match[1]!, expected)) {
    return { ok: false, status: 401, error: "unauthorized" };
  }

  const actorToken = request.headers.get(DELEGATION_HEADER) ?? "";
  const claims = verifyContentDeskDelegation(actorToken, signingSecret, {
    nowSeconds,
  });
  if (!claims) {
    return { ok: false, status: 401, error: "invalid actor delegation" };
  }
  const [user, membership, tenant] = await Promise.all([
    getUser(claims.sub),
    getMembership(claims.tenantId, claims.sub),
    getTenant(claims.tenantId),
  ]);
  if (!tenant || tenant.status !== "active" || !user?.active || !membership) {
    return { ok: false, status: 403, error: "delegated actor is not authorized" };
  }
  const actor: ActingUser = {
    ...user,
    tenantId: membership.tenantId,
    tenantRole: membership.role,
    role: TENANT_ROLE_TIER[membership.role],
    roleTitle: membership.roleTitle,
    capabilities: membership.capabilities,
  };
  if (membership.portalOnly || !isContentDeskOperator(actor)) {
    return { ok: false, status: 403, error: "delegated actor is not authorized" };
  }
  let consumed: boolean;
  try {
    consumed = await consumeContentDeskDelegation({
      issuer: claims.iss,
      jti: claims.jti,
      actorId: actor.id,
      tenantId: tenant.id,
      expiresAt: new Date(claims.exp * 1_000).toISOString(),
      nowIso: new Date(nowSeconds * 1_000).toISOString(),
    });
  } catch {
    return {
      ok: false,
      status: 503,
      error: "Content Desk delegation replay protection is unavailable",
    };
  }
  if (!consumed) {
    return { ok: false, status: 401, error: "actor delegation already consumed" };
  }
  return {
    ok: true,
    actor,
  };
}
