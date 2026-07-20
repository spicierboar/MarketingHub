import { getServiceSupabase, isSupabaseConfigured } from "@/lib/db/supabase";

interface DelegationUse {
  issuer: string;
  jti: string;
  actorId: string;
  tenantId: string;
  expiresAt: string;
}

const memoryKey = "__ccContentDeskDelegations";

function memory(): Map<string, DelegationUse> {
  const root = globalThis as typeof globalThis & {
    [memoryKey]?: Map<string, DelegationUse>;
  };
  return (root[memoryKey] ??= new Map());
}

function serviceClient() {
  const client = getServiceSupabase();
  if (!client) {
    throw new Error(
      "Content Desk delegation replay protection requires SUPABASE_SERVICE_ROLE_KEY when Supabase is configured.",
    );
  }
  return client;
}

/**
 * Atomically consumes an issuer/JTI until its signed expiry.
 * Returns false when the same delegation has already been consumed.
 */
export async function consumeContentDeskDelegation(input: {
  issuer: string;
  jti: string;
  actorId: string;
  tenantId: string;
  expiresAt: string;
  nowIso: string;
}): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const uses = memory();
    const nowMs = Date.parse(input.nowIso);
    for (const [key, use] of uses) {
      if (Date.parse(use.expiresAt) <= nowMs) uses.delete(key);
    }
    const key = `${input.issuer}\0${input.jti}`;
    if (uses.has(key)) return false;
    uses.set(key, {
      issuer: input.issuer,
      jti: input.jti,
      actorId: input.actorId,
      tenantId: input.tenantId,
      expiresAt: input.expiresAt,
    });
    return true;
  }

  const { data, error } = await serviceClient().rpc(
    "consume_content_desk_delegation",
    {
      p_issuer: input.issuer,
      p_jti: input.jti,
      p_actor_id: input.actorId,
      p_tenant_id: input.tenantId,
      p_expires_at: input.expiresAt,
    },
  );
  if (error) throw new Error(error.message);
  return data === true;
}

export function resetContentDeskDelegationMemoryForTests(): void {
  memory().clear();
}
