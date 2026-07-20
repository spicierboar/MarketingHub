import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const CONNECTION_ENV = "DATABASE_SECURITY_TEST_URL";
const REMOTE_OPT_IN_ENV = "ALLOW_DISPOSABLE_DATABASE_SECURITY_TESTS";

function disposableConnection(): string {
  const value = process.env[CONNECTION_ENV]?.trim();
  if (!value) throw new Error(`${CONNECTION_ENV} is required`);
  const url = new URL(value);
  const local = ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  if (
    !local &&
    process.env[REMOTE_OPT_IN_ENV]?.toLowerCase() !== "true"
  ) {
    throw new Error(
      `Non-local databases require ${REMOTE_OPT_IN_ENV}=true and must be disposable`,
    );
  }
  return value;
}

function client(connectionString: string, name: string): Client {
  return new Client({
    connectionString,
    application_name: `command-centre-scheduler-cursor-${name}`,
  });
}

async function claim(
  connection: Client,
  scope: string,
  candidates: string[],
  owner: string,
): Promise<{ claimed_key: string; claim_sequence: string }> {
  await connection.query("begin");
  try {
    await connection.query("set local role service_role");
    const result = await connection.query<{
      claimed_key: string;
      claim_sequence: string;
    }>(
      `
        select *
        from public.claim_scheduler_cursor(
          $1::text,
          $2::text[],
          $3::text,
          60
        )
      `,
      [scope, candidates, owner],
    );
    await connection.query("commit");
    assert.equal(result.rowCount, 1);
    return result.rows[0];
  } catch (error) {
    await connection.query("rollback");
    throw error;
  }
}

async function release(
  connection: Client,
  scope: string,
  key: string,
  owner: string,
): Promise<void> {
  await connection.query("begin");
  try {
    await connection.query("set local role service_role");
    const result = await connection.query<{ released: boolean }>(
      `
        select public.release_scheduler_cursor_claim(
          $1::text,
          $2::text,
          $3::text
        ) as released
      `,
      [scope, key, owner],
    );
    assert.equal(result.rows[0]?.released, true);
    await connection.query("commit");
  } catch (error) {
    await connection.query("rollback");
    throw error;
  }
}

async function main(): Promise<void> {
  const connectionString = disposableConnection();
  const observer = client(connectionString, "observer");
  const first = client(connectionString, "first");
  const second = client(connectionString, "second");
  const scope = `integration:${randomUUID()}`;
  const candidates = ["tenant-a", "tenant-b", "tenant-c"];
  const firstOwner = randomUUID();
  const secondOwner = randomUUID();

  try {
    await Promise.all([observer.connect(), first.connect(), second.connect()]);
    const catalog = await observer.query<{
      rls: boolean;
      force_rls: boolean;
      anon_table: boolean;
      authenticated_table: boolean;
      public_table: boolean;
      service_select: boolean;
      service_insert: boolean;
      service_update: boolean;
      service_delete: boolean;
      anon_claim: boolean;
      authenticated_claim: boolean;
      public_claim: boolean;
      service_claim: boolean;
    }>(`
      select
        c.relrowsecurity as rls,
        c.relforcerowsecurity as force_rls,
        has_table_privilege('anon', 'public.scheduler_cursors', 'select') as anon_table,
        has_table_privilege('authenticated', 'public.scheduler_cursors', 'select') as authenticated_table,
        exists (
          select 1
          from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) acl
          where acl.grantee = 0
            and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
        ) as public_table,
        has_table_privilege('service_role', 'public.scheduler_cursors', 'select') as service_select,
        has_table_privilege('service_role', 'public.scheduler_cursors', 'insert') as service_insert,
        has_table_privilege('service_role', 'public.scheduler_cursors', 'update') as service_update,
        has_table_privilege('service_role', 'public.scheduler_cursors', 'delete') as service_delete,
        has_function_privilege('anon', 'public.claim_scheduler_cursor(text,text[],text,integer)', 'execute') as anon_claim,
        has_function_privilege('authenticated', 'public.claim_scheduler_cursor(text,text[],text,integer)', 'execute') as authenticated_claim,
        exists (
          select 1
          from pg_catalog.pg_proc p,
          lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
          where p.oid = 'public.claim_scheduler_cursor(text,text[],text,integer)'::regprocedure
            and acl.grantee = 0
            and acl.privilege_type = 'EXECUTE'
        ) as public_claim,
        has_function_privilege('service_role', 'public.claim_scheduler_cursor(text,text[],text,integer)', 'execute') as service_claim
      from pg_catalog.pg_class c
      where c.oid = 'public.scheduler_cursors'::regclass
    `);
    assert.deepEqual(catalog.rows[0], {
      rls: true,
      force_rls: true,
      anon_table: false,
      authenticated_table: false,
      public_table: false,
      service_select: true,
      service_insert: true,
      service_update: true,
      service_delete: false,
      anon_claim: false,
      authenticated_claim: false,
      public_claim: false,
      service_claim: true,
    });

    await Promise.all([
      first.query("set timezone = 'Pacific/Kiritimati'"),
      second.query("set timezone = 'America/Adak'"),
    ]);
    const [firstClaim, secondClaim] = await Promise.all([
      claim(first, scope, candidates, firstOwner),
      claim(second, scope, candidates, secondOwner),
    ]);
    assert.notEqual(firstClaim.claimed_key, secondClaim.claimed_key);
    const sequences = [
      Number(firstClaim.claim_sequence),
      Number(secondClaim.claim_sequence),
    ].sort((left, right) => left - right);
    assert.equal(sequences[1], sequences[0] + 1);

    const leased = await observer.query<{
      database_now: Date;
      claims: Record<string, { expiresAt: string }>;
    }>(
      `
        select clock_timestamp() as database_now, claims
        from public.scheduler_cursors
        where scope = $1
      `,
      [scope],
    );
    const databaseNow = leased.rows[0].database_now.getTime();
    for (const claim of Object.values(leased.rows[0].claims)) {
      const leaseMs = Date.parse(claim.expiresAt) - databaseNow;
      assert(
        leaseMs > 50_000 && leaseMs <= 60_000,
        `lease expiry must derive from database time, got ${leaseMs}ms`,
      );
    }

    await Promise.all([
      release(first, scope, firstClaim.claimed_key, firstOwner),
      release(second, scope, secondClaim.claimed_key, secondOwner),
    ]);
    const state = await observer.query<{
      claim_sequence: string;
      claims: Record<string, unknown>;
    }>(
      `
        select claim_sequence, claims
        from public.scheduler_cursors
        where scope = $1
      `,
      [scope],
    );
    assert.equal(Number(state.rows[0]?.claim_sequence), sequences[1]);
    assert.deepEqual(state.rows[0]?.claims, {});

    console.log(
      "scheduler cursor concurrency integration passed (ACL + two sessions)",
    );
  } finally {
    try {
      await observer.query(
        "delete from public.scheduler_cursors where scope = $1",
        [scope],
      );
    } catch {
      // The migration may not be present on a deliberately unapplied database.
    }
    await Promise.allSettled([observer.end(), first.end(), second.end()]);
  }
}

void main().catch((error: unknown) => {
  const message = (error instanceof Error ? error.message : String(error))
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[redacted]@")
    .replace(/password\s*=\s*[^\s]+/gi, "password=[redacted]");
  console.error(`scheduler cursor concurrency integration failed: ${message}`);
  process.exitCode = 1;
});
