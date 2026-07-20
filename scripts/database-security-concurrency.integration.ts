import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const CONNECTION_ENV = "DATABASE_SECURITY_TEST_URL";
const REMOTE_OPT_IN_ENV = "ALLOW_DISPOSABLE_DATABASE_SECURITY_TESTS";
const STATEMENT_TIMEOUT_MS = 10_000;
const LOCK_TIMEOUT_MS = 5_000;
const WAIT_OBSERVATION_TIMEOUT_MS = 3_000;

type Scenario = {
  requestId: string;
  tokenHash: string;
};

function requireDisposableConnection(): string {
  const connectionString = process.env[CONNECTION_ENV]?.trim();
  if (!connectionString) {
    throw new Error(
      `${CONNECTION_ENV} is required for the disposable concurrency test`,
    );
  }

  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${CONNECTION_ENV} must be a PostgreSQL URL`);
  }

  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  const remoteExplicitlyAllowed =
    process.env[REMOTE_OPT_IN_ENV]?.toLowerCase() === "true";
  if (!localHosts.has(url.hostname) && !remoteExplicitlyAllowed) {
    throw new Error(
      `Non-local databases require ${REMOTE_OPT_IN_ENV}=true and must be disposable`,
    );
  }

  return connectionString;
}

function createClient(connectionString: string, name: string): Client {
  return new Client({
    connectionString,
    application_name: `command-centre-security-${name}`,
  });
}

async function configureSession(client: Client): Promise<void> {
  await client.query(`set statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
  await client.query(`set lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
  await client.query(
    `set idle_in_transaction_session_timeout = '${STATEMENT_TIMEOUT_MS}ms'`,
  );
}

async function beginAnonymousTransaction(client: Client): Promise<number> {
  await client.query("begin");
  const backend = await client.query<{ pid: number }>(
    "select pg_catalog.pg_backend_pid() as pid",
  );
  await client.query("set local role anon");
  await client.query(`set local statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`);
  await client.query(`set local lock_timeout = '${LOCK_TIMEOUT_MS}ms'`);
  return backend.rows[0].pid;
}

async function rollbackQuietly(client: Client): Promise<void> {
  try {
    await client.query("rollback");
  } catch {
    // The connection may already be closed or the transaction already ended.
  }
}

async function endQuietly(client: Client): Promise<void> {
  try {
    await client.end();
  } catch {
    // Cleanup must continue for the remaining sessions.
  }
}

async function waitForLock(
  observer: Client,
  blockedPid: number,
): Promise<void> {
  const deadline = Date.now() + WAIT_OBSERVATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await observer.query<{
      wait_event_type: string | null;
    }>(
      `
        select wait_event_type
        from pg_catalog.pg_stat_activity
        where pid = $1
      `,
      [blockedPid],
    );
    if (result.rows[0]?.wait_event_type === "Lock") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Second RPC session did not enter a lock wait");
}

async function callTokenRpc(
  client: Client,
  tokenHash: string,
  companyId: string,
  decision: "approved" | "changes_requested",
  source: string,
): Promise<boolean> {
  const result = await client.query<{ result: boolean }>(
    `
      select public.respond_managed_approval_with_token(
        $1::text,
        $2::uuid,
        $3::text,
        jsonb_build_object('source', $4::text),
        false
      ) as result
    `,
    [tokenHash, companyId, decision, source],
  );
  return result.rows[0]?.result === true;
}

async function insertRequest(
  observer: Client,
  scenario: Scenario,
  tenantId: string,
  companyId: string,
): Promise<void> {
  await observer.query(
    `
      insert into public.managed_approval_requests (
        id,
        tenant_id,
        company_id,
        scope,
        recipient_email,
        token_hash,
        status,
        due_at,
        revision_round
      ) values (
        $1::uuid,
        $2::uuid,
        $3::uuid,
        'content',
        'concurrency@example.test',
        $4::text,
        'pending',
        now() + interval '1 day',
        0
      )
    `,
    [scenario.requestId, tenantId, companyId, scenario.tokenHash],
  );
}

async function readRequestState(
  observer: Client,
  requestId: string,
): Promise<{
  status: string;
  revision_round: number;
  source: string | null;
  responded: boolean;
}> {
  const result = await observer.query<{
    status: string;
    revision_round: number;
    source: string | null;
    responded: boolean;
  }>(
    `
      select
        status,
        revision_round,
        response_payload ->> 'source' as source,
        responded_at is not null as responded
      from public.managed_approval_requests
      where id = $1::uuid
    `,
    [requestId],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

async function runSerializedScenario(
  observer: Client,
  first: Client,
  second: Client,
  scenario: Scenario,
  companyId: string,
  secondDecision: "approved" | "changes_requested",
): Promise<{ firstResult: boolean; secondResult: boolean }> {
  await beginAnonymousTransaction(first);
  const secondPid = await beginAnonymousTransaction(second);

  try {
    const firstResult = await callTokenRpc(
      first,
      scenario.tokenHash,
      companyId,
      "approved",
      "first-session",
    );
    assert.equal(firstResult, true);

    const secondResultPromise = callTokenRpc(
      second,
      scenario.tokenHash,
      companyId,
      secondDecision,
      "second-session",
    );

    await waitForLock(observer, secondPid);
    await first.query("commit");

    const secondResult = await secondResultPromise;
    await second.query("commit");
    return { firstResult, secondResult };
  } catch (error) {
    await Promise.all([rollbackQuietly(first), rollbackQuietly(second)]);
    throw error;
  }
}

async function main(): Promise<void> {
  const connectionString = requireDisposableConnection();
  const observer = createClient(connectionString, "observer");
  const first = createClient(connectionString, "first");
  const second = createClient(connectionString, "second");
  const tenantId = randomUUID();
  const companyId = randomUUID();
  const identical: Scenario = {
    requestId: randomUUID(),
    tokenHash: `concurrency-identical-${randomUUID()}`,
  };
  const conflicting: Scenario = {
    requestId: randomUUID(),
    tokenHash: `concurrency-conflicting-${randomUUID()}`,
  };
  let fixturesCommitted = false;

  try {
    await Promise.all([observer.connect(), first.connect(), second.connect()]);
    await Promise.all([
      configureSession(observer),
      configureSession(first),
      configureSession(second),
    ]);

    const version = await observer.query<{ version_num: number }>(
      `
        select current_setting('server_version_num')::integer as version_num
      `,
    );
    assert.ok(
      version.rows[0].version_num >= 170_000 &&
        version.rows[0].version_num < 180_000,
      "Concurrency harness requires PostgreSQL 17",
    );

    await observer.query("begin");
    try {
      await observer.query(
        `
          insert into public.tenants (id, name)
          values ($1::uuid, 'Security concurrency fixture')
        `,
        [tenantId],
      );
      await observer.query(
        `
          insert into public.companies (id, tenant_id, name)
          values ($1::uuid, $2::uuid, 'Security concurrency company')
        `,
        [companyId, tenantId],
      );
      await insertRequest(observer, identical, tenantId, companyId);
      await insertRequest(observer, conflicting, tenantId, companyId);
      await observer.query("commit");
      fixturesCommitted = true;
    } catch (error) {
      await rollbackQuietly(observer);
      throw error;
    }

    const identicalResults = await runSerializedScenario(
      observer,
      first,
      second,
      identical,
      companyId,
      "approved",
    );
    assert.deepEqual(identicalResults, {
      firstResult: true,
      secondResult: true,
    });
    assert.deepEqual(await readRequestState(observer, identical.requestId), {
      status: "approved",
      revision_round: 0,
      source: "first-session",
      responded: true,
    });

    const conflictingResults = await runSerializedScenario(
      observer,
      first,
      second,
      conflicting,
      companyId,
      "changes_requested",
    );
    assert.deepEqual(conflictingResults, {
      firstResult: true,
      secondResult: false,
    });
    assert.deepEqual(await readRequestState(observer, conflicting.requestId), {
      status: "approved",
      revision_round: 0,
      source: "first-session",
      responded: true,
    });

    console.log(
      "database security concurrency integration test passed (2 scenarios)",
    );
  } finally {
    let cleanupError: unknown;
    await Promise.all([rollbackQuietly(first), rollbackQuietly(second)]);
    if (fixturesCommitted) {
      try {
        await observer.query("begin");
        await observer.query(
          "delete from public.tenants where id = $1::uuid",
          [tenantId],
        );
        await observer.query("commit");
      } catch (error) {
        await rollbackQuietly(observer);
        cleanupError = error;
      }
    }
    await Promise.all([
      endQuietly(first),
      endQuietly(second),
      endQuietly(observer),
    ]);
    if (cleanupError) {
      throw cleanupError;
    }
  }
}

main().catch((error: unknown) => {
  const message = (
    error instanceof Error ? error.message : "Unknown failure"
  )
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@/gi, "postgresql://[redacted]@")
    .replace(/password\s*=\s*[^\s]+/gi, "password=[redacted]");
  console.error(`database security concurrency integration test failed: ${message}`);
  process.exitCode = 1;
});
