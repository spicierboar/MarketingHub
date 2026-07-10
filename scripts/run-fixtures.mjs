/**
 * M01-FINAL fixture recount — mirrors /api/dev/self-test + /api/dev/queue-test.
 * Run: npx tsx scripts/run-fixtures.mjs
 * (or: node --import tsx scripts/run-fixtures.mjs)
 */
import { runIsolationSelfTest } from "../src/lib/selftest/isolation.ts";
import { runPortalSelfTest } from "../src/lib/selftest/portal.ts";
import { runClientReportsSelfTest } from "../src/lib/selftest/client-reports.ts";
import { runPublicApiSelfTest } from "../src/lib/selftest/public-api.ts";
import { runCrmSelfTest } from "../src/lib/selftest/crm.ts";
import { runCmsSelfTest } from "../src/lib/selftest/cms.ts";
import { runFunnelSelfTest } from "../src/lib/selftest/funnel.ts";
import { runLoyaltySelfTest } from "../src/lib/selftest/loyalty.ts";
import { runBookingsSelfTest } from "../src/lib/selftest/bookings.ts";
import { runExecDashSelfTest } from "../src/lib/selftest/exec-dash.ts";
import { runLocalSeoSelfTest } from "../src/lib/selftest/local-seo.ts";
import { runLearningSelfTest } from "../src/lib/selftest/learning.ts";
import { runRagSelfTest } from "../src/lib/selftest/rag.ts";
import { runAiMosSelfTest } from "../src/lib/selftest/ai-mos.ts";
import { runQueueSelfTest } from "../src/lib/selftest/queue.ts";

const suites = await Promise.all([
  runIsolationSelfTest(),
  runPortalSelfTest(),
  runClientReportsSelfTest(),
  runPublicApiSelfTest(),
  runCrmSelfTest(),
  runCmsSelfTest(),
  runFunnelSelfTest(),
  runLoyaltySelfTest(),
  runBookingsSelfTest(),
  runExecDashSelfTest(),
  runLocalSeoSelfTest(),
  runLearningSelfTest(),
  runRagSelfTest(),
  runAiMosSelfTest(),
]);

const checks = suites.flatMap((s) => s.checks);
const failed = checks.filter((c) => !c.ok);
const selfOk = suites.every((s) => s.ok);
const selfPassed = checks.length - failed.length;

console.log(`self-test: ${selfPassed}/${checks.length} ok=${selfOk}`);
if (!selfOk) {
  for (const c of failed) {
    console.log(`  FAIL ${c.name}: ${c.detail ?? ""}`);
  }
}

const queue = await runQueueSelfTest();
console.log(`queue-test: ${queue.passed}/${queue.checks.length} ok=${queue.ok}`);
if (!queue.ok) {
  for (const c of queue.checks.filter((x) => !x.ok)) {
    console.log(`  FAIL ${c.name}: ${c.detail ?? ""}`);
  }
}

console.log(
  JSON.stringify({
    selfTest: { passed: selfPassed, total: checks.length, ok: selfOk },
    queueTest: { passed: queue.passed, total: queue.checks.length, ok: queue.ok },
  }),
);

process.exit(selfOk && queue.ok ? 0 : 1);
