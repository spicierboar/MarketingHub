import { runIsolationSelfTest } from "../src/lib/selftest/isolation.ts";
import { runPortalSelfTest } from "../src/lib/selftest/portal.ts";
import { runClientReportsSelfTest } from "../src/lib/selftest/client-reports.ts";
import { runQueueSelfTest } from "../src/lib/selftest/queue.ts";

const iso = await runIsolationSelfTest();
const portal = await runPortalSelfTest();
const reports = await runClientReportsSelfTest();
const selfChecks = [...iso.checks, ...portal.checks, ...reports.checks];
const selfPassed = selfChecks.filter((c) => c.ok).length;
const selfOk = iso.ok && portal.ok && reports.ok;
console.log(`self-test: ${selfPassed}/${selfChecks.length} ok=${selfOk}`);
if (!selfOk) {
  for (const c of selfChecks.filter((x) => !x.ok)) {
    console.log(`  FAIL ${c.name}: ${c.detail}`);
  }
}

const queue = await runQueueSelfTest();
console.log(`queue-test: ${queue.passed}/${queue.checks.length} ok=${queue.ok}`);
if (!queue.ok) {
  for (const c of queue.checks.filter((x) => !x.ok)) {
    console.log(`  FAIL ${c.name}: ${c.detail}`);
  }
}

process.exit(selfOk && queue.ok ? 0 : 1);
