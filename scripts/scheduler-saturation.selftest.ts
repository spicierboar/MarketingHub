import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

(process.env as Record<string, string | undefined>).NODE_ENV = "test";
process.env.CC_ENV = "development";
process.env.CC_LOCAL_DEMO = "true";
process.env.NEXT_PUBLIC_CC_LOCAL_DEMO = "true";

async function main() {
  const [cursor, scheduler, execution] = await Promise.all([
    import("../src/lib/scheduler-cursor"),
    import("../src/lib/scheduler"),
    import("../src/lib/scheduled-execution"),
  ]);

  cursor.resetSchedulerCursorMemoryForTests();
  const tenantIds = ["tenant-a", "tenant-b", "tenant-c", "tenant-d"];
  const seen = new Set<string>();
  const ticks = tenantIds.length * scheduler.SCHEDULED_TASK_CLASSES.length;

  // Saturated budget: exactly one tenant/task slice can run per tick.
  for (let tick = 0; tick < ticks; tick += 1) {
    const owner = randomUUID();
    const tenantClaim = await cursor.claimNextSchedulerCursor(
      "scheduler:tenants",
      tenantIds,
      owner,
    );
    assert(tenantClaim);
    const tenant = tenantClaim.key;
    const taskScope = `scheduler:tasks:${tenant}`;
    const taskClaim = await cursor.claimNextSchedulerCursor(
      taskScope,
      scheduler.SCHEDULED_TASK_CLASSES,
      owner,
    );
    assert(taskClaim);
    const task = taskClaim.key;
    seen.add(`${tenant}:${task}`);
    assert.equal(await cursor.releaseSchedulerCursorClaim(taskClaim), true);
    assert.equal(await cursor.releaseSchedulerCursorClaim(tenantClaim), true);
  }

  for (const tenant of tenantIds) {
    for (const task of scheduler.SCHEDULED_TASK_CLASSES) {
      assert(
        seen.has(`${tenant}:${task}`),
        `${tenant}/${task} was permanently starved`,
      );
    }
    assert(
      seen.has(`${tenant}:engine_polling`),
      `${tenant} never reached Engine polling`,
    );
  }

  assert.equal(
    scheduler.resolveScheduledTickBudgetMs(Number.MAX_SAFE_INTEGER),
    scheduler.MAX_SCHEDULED_TICK_BUDGET_MS,
  );
  assert(
    scheduler.MAX_SCHEDULED_TICK_BUDGET_MS <=
      scheduler.CRON_MAX_DURATION_SECONDS * 1_000 -
        scheduler.CRON_RESPONSE_RESERVE_MS,
  );

  cursor.resetSchedulerCursorMemoryForTests();
  const overlapping = await Promise.all(
    ["worker-a", "worker-b", "worker-c"].map((owner) =>
      cursor.claimNextSchedulerCursor("scheduler:overlap", tenantIds, owner),
    ),
  );
  assert.equal(new Set(overlapping.map((claim) => claim?.key)).size, 3);
  assert.deepEqual(
    overlapping.map((claim) => claim?.sequence),
    [1, 2, 3],
  );
  for (const claim of overlapping) {
    assert(claim);
    assert.equal(await cursor.releaseSchedulerCursorClaim(claim), true);
  }

  const parentDeadline = execution.createScheduledExecution(Date.now() + 250);
  const deadline = execution.createChildScheduledExecution(
    parentDeadline.execution,
    Date.now() + 15,
  );
  const cancellationOwner = randomUUID();
  const cancelledClaim = await cursor.claimNextSchedulerCursor(
    "scheduler:cancellation",
    ["task-a", "task-b"],
    cancellationOwner,
  );
  assert(cancelledClaim);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(deadline.execution.signal.aborted, true);
  assert.equal(parentDeadline.execution.signal.aborted, false);
  deadline.dispose();
  parentDeadline.dispose();
  assert.equal(
    await cursor.releaseSchedulerCursorClaim(cancelledClaim),
    true,
  );
  const afterCancellation = await cursor.claimNextSchedulerCursor(
    "scheduler:cancellation",
    ["task-a", "task-b"],
    randomUUID(),
  );
  assert.equal(afterCancellation?.key, "task-b");
  assert.equal(afterCancellation?.sequence, cancelledClaim.sequence + 1);
  assert(afterCancellation);
  await cursor.releaseSchedulerCursorClaim(afterCancellation);

  const [migration, repository, supabaseFactory, schedulerSource] =
    await Promise.all([
    readFile(
      new URL(
        "../supabase/migrations/20260719070000_scheduler_cursors.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../src/lib/scheduler-cursor.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/lib/db/supabase.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../src/lib/scheduler.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert(!repository.includes('.from("scheduler_cursors")'));
  assert(!repository.includes("p_now"));
  assert(repository.includes(".abortSignal(options.signal)"));
  assert(!migration.includes("p_now"));
  assert(
    (migration.match(/clock_timestamp\(\)/g) ?? []).length >= 3,
    "cursor lease pruning, expiry and timestamps must use database clock",
  );
  assert(supabaseFactory.includes("global: { fetch: scheduledSupabaseFetch }"));
  assert(
    schedulerSource.includes("runScheduledTickWithExecution"),
    "the whole tick, including tenant discovery, must run in execution context",
  );
  for (const required of [
    "force row level security",
    "from public, anon, authenticated, service_role",
    "grant select, insert, update on table public.scheduler_cursors to service_role",
    "grant execute on function public.claim_scheduler_cursor",
    "grant execute on function public.release_scheduler_cursor_claim",
    "for update",
  ]) {
    assert(
      migration.toLowerCase().includes(required),
      `scheduler migration is missing ACL/locking contract: ${required}`,
    );
  }

  const supabase = await import("../src/lib/db/supabase");
  const stalledFetch = globalThis.fetch;
  const stalledRequest: { signal: AbortSignal | null } = { signal: null };
  const stalledStartedAt = Date.now();
  try {
    globalThis.fetch = async (_input, init) => {
      stalledRequest.signal = init?.signal ?? null;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    };
    const stalled = execution.createScheduledExecution(Date.now() + 40);
    const keepAlive = setTimeout(() => undefined, 500);
    try {
      await assert.rejects(
        execution.runWithScheduledExecution(stalled.execution, () =>
          supabase.scheduledSupabaseFetch(
            "https://database.invalid/rest/v1/tenants",
          ),
        ),
      );
    } finally {
      clearTimeout(keepAlive);
      stalled.dispose();
    }
  } finally {
    globalThis.fetch = stalledFetch;
  }
  assert.equal(stalledRequest.signal?.aborted, true);
  assert(
    Date.now() - stalledStartedAt < 500,
    "stalled Supabase transport exceeded its bounded deadline",
  );

  const email = await import("../src/lib/email");
  const previousFetch = globalThis.fetch;
  const previousEmailEnv = {
    CC_LOCAL_DEMO: process.env.CC_LOCAL_DEMO,
    NEXT_PUBLIC_CC_LOCAL_DEMO: process.env.NEXT_PUBLIC_CC_LOCAL_DEMO,
    CC_ENV: process.env.CC_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    APP_ORIGIN: process.env.APP_ORIGIN,
    EMAIL_SEND_LIVE: process.env.EMAIL_SEND_LIVE,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
  };
  let resendFetches = 0;
  try {
    process.env.CC_LOCAL_DEMO = "false";
    process.env.NEXT_PUBLIC_CC_LOCAL_DEMO = "false";
    process.env.CC_ENV = "production";
    delete process.env.VERCEL_ENV;
    process.env.APP_ORIGIN = "https://scheduler-test.example";
    process.env.EMAIL_SEND_LIVE = "true";
    process.env.RESEND_API_KEY = "re_scheduler_test";
    globalThis.fetch = async (_input, init) => {
      resendFetches += 1;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    };
    const parent = execution.createScheduledExecution(Date.now() + 2_000);
    const child = execution.createChildScheduledExecution(
      parent.execution,
      Date.now() + 550,
    );
    const keepAlive = setTimeout(() => undefined, 1_000);
    try {
      await assert.rejects(
        execution.runWithScheduledExecution(child.execution, () =>
          email.sendEmail({
            to: "delivered@resend.dev",
            subject: "Scheduler cancellation test",
            html: "<p>Bounded</p>",
          }),
        ),
      );
    } finally {
      clearTimeout(keepAlive);
    }
    assert.equal(child.execution.signal.aborted, true);
    child.dispose();
    parent.dispose();
  } finally {
    globalThis.fetch = previousFetch;
    for (const [name, value] of Object.entries(previousEmailEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  assert.equal(resendFetches, 1);

  console.log(
    `scheduler saturation/deadline self-test passed (${seen.size} tenant/task slices)`,
  );
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
