import { runIsolationSelfTest } from "../src/lib/selftest/isolation.ts";
import { runQueueSelfTest } from "../src/lib/selftest/queue.ts";

const self = await runIsolationSelfTest();
console.log(`self-test: ${self.passed}/${self.checks.length} ok=${self.ok}`);
if (!self.ok) {
  for (const c of self.checks.filter((x) => !x.ok)) {
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

process.exit(self.ok && queue.ok ? 0 : 1);
