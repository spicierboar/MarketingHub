import { getServiceSupabase, isSupabaseConfigured } from "@/lib/db/supabase";

interface CursorRecord {
  scope: string;
  afterKey: string | null;
  claimSequence: number;
  claims: Map<string, { owner: string; expiresAt: number }>;
  updatedAt: string;
}

const memoryKey = "__ccSchedulerCursors";

function memory(): Map<string, CursorRecord> {
  const root = globalThis as typeof globalThis & {
    [memoryKey]?: Map<string, CursorRecord>;
  };
  return (root[memoryKey] ??= new Map());
}

export interface SchedulerCursorClaim {
  scope: string;
  key: string;
  owner: string;
  sequence: number;
}

export async function claimNextSchedulerCursor(
  scope: string,
  candidateKeys: readonly string[],
  owner: string,
  options: {
    signal?: AbortSignal;
    leaseMs?: number;
    memoryNowMs?: number;
  } = {},
): Promise<SchedulerCursorClaim | null> {
  if (candidateKeys.length === 0) return null;
  if (new Set(candidateKeys).size !== candidateKeys.length) {
    throw new Error("Scheduler cursor candidates must be unique");
  }
  const nowMs = options.memoryNowMs ?? Date.now();
  const leaseMs = options.leaseMs ?? 120_000;
  if (!isSupabaseConfigured()) {
    const state = memory();
    const record = state.get(scope) ?? {
      scope,
      afterKey: null,
      claimSequence: 0,
      claims: new Map(),
      updatedAt: new Date(nowMs).toISOString(),
    };
    for (const [key, claim] of record.claims) {
      if (claim.expiresAt <= nowMs) record.claims.delete(key);
    }
    for (const key of rotateAfterKey(candidateKeys, record.afterKey, (value) => value)) {
      if (record.claims.has(key)) continue;
      record.afterKey = key;
      record.claimSequence += 1;
      record.claims.set(key, { owner, expiresAt: nowMs + leaseMs });
      record.updatedAt = new Date(nowMs).toISOString();
      state.set(scope, record);
      return {
        scope,
        key,
        owner,
        sequence: record.claimSequence,
      };
    }
    state.set(scope, record);
    return null;
  }
  const client = getServiceSupabase();
  if (!client) throw new Error("Scheduler cursor store is unavailable");
  const request = client.rpc("claim_scheduler_cursor", {
    p_scope: scope,
    p_candidate_keys: [...candidateKeys],
    p_owner: owner,
    p_lease_seconds: Math.max(1, Math.ceil(leaseMs / 1_000)),
  });
  const { data, error } = await (
    options.signal ? request.abortSignal(options.signal) : request
  );
  if (error) throw new Error(`Scheduler cursor claim failed: ${error.message}`);
  const row = (
    data as
      | { claimed_key?: string; claim_sequence?: number | string }[]
      | null
  )?.[0];
  if (!row?.claimed_key) return null;
  return {
    scope,
    key: row.claimed_key,
    owner,
    sequence: Number(row.claim_sequence),
  };
}

export async function releaseSchedulerCursorClaim(
  claim: SchedulerCursorClaim,
  options: { signal?: AbortSignal } = {},
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const record = memory().get(claim.scope);
    if (record?.claims.get(claim.key)?.owner !== claim.owner) return false;
    record.claims.delete(claim.key);
    return true;
  }
  const client = getServiceSupabase();
  if (!client) throw new Error("Scheduler cursor store is unavailable");
  const request = client.rpc("release_scheduler_cursor_claim", {
    p_scope: claim.scope,
    p_claimed_key: claim.key,
    p_owner: claim.owner,
  });
  const { data, error } = await (
    options.signal ? request.abortSignal(options.signal) : request
  );
  if (error) throw new Error(`Scheduler cursor release failed: ${error.message}`);
  return data === true;
}

export function rotateAfterKey<T>(
  items: readonly T[],
  afterKey: string | null,
  key: (item: T) => string,
): T[] {
  if (items.length < 2 || !afterKey) return [...items];
  const index = items.findIndex((item) => key(item) === afterKey);
  if (index < 0) return [...items];
  const start = (index + 1) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

export function resetSchedulerCursorMemoryForTests(): void {
  memory().clear();
}
