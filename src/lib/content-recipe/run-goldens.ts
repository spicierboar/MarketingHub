/**
 * Golden recipe runner — legal must parse; illegal must fail with expected codes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseContentRecipe } from "./validate";
import { serialiseBrief } from "./serialise-brief";
import { nextOptions } from "./options";
import type { RecipeErrorCode } from "./types";

type LegalFixture = { id: string; recipe: unknown };
type IllegalFixture = {
  id: string;
  expectCodes: RecipeErrorCode[];
  recipe: unknown;
};

function loadJson<T>(name: string): T {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, "golden", name), "utf8");
  return JSON.parse(raw) as T;
}

export interface GoldenRunResult {
  legalPassed: number;
  illegalPassed: number;
  legalTotal: number;
  illegalTotal: number;
  failures: string[];
}

export function runGoldens(): GoldenRunResult {
  const legal = loadJson<LegalFixture[]>("legal.json");
  const illegal = loadJson<IllegalFixture[]>("illegal.json");
  const failures: string[] = [];

  assert.ok(legal.length >= 15, `expected ≥15 legal fixtures, got ${legal.length}`);
  assert.ok(
    illegal.length >= 15,
    `expected ≥15 illegal fixtures, got ${illegal.length}`,
  );

  let legalPassed = 0;
  for (const fixture of legal) {
    const result = parseContentRecipe(fixture.recipe);
    if (!result.ok || !result.recipe) {
      failures.push(
        `LEGAL ${fixture.id}: expected ok, got ${JSON.stringify(result.issues)}`,
      );
      continue;
    }
    const brief = serialiseBrief(result.recipe);
    if (!brief.includes(result.recipe.topic)) {
      failures.push(`LEGAL ${fixture.id}: brief missing topic`);
      continue;
    }
    // Determinism: same input → same brief
    assert.equal(serialiseBrief(result.recipe), brief);
    legalPassed += 1;
  }

  let illegalPassed = 0;
  for (const fixture of illegal) {
    const result = parseContentRecipe(fixture.recipe);
    if (result.ok) {
      failures.push(`ILLEGAL ${fixture.id}: expected failure, got ok`);
      continue;
    }
    const codes = new Set(result.issues.map((i) => i.code));
    const matched = fixture.expectCodes.some((c) => codes.has(c));
    if (!matched) {
      failures.push(
        `ILLEGAL ${fixture.id}: expected one of [${fixture.expectCodes.join(", ")}], got [${[...codes].join(", ")}] — ${JSON.stringify(result.issues)}`,
      );
      continue;
    }
    illegalPassed += 1;
  }

  // Smoke: progressive options for a partial
  const opts = nextOptions({ createFor: "client", contentType: "social_post" });
  assert.ok(opts.channels.includes("instagram"));
  assert.ok(!opts.channels.includes("email"));
  assert.equal(opts.family, "short_social");

  return {
    legalPassed,
    illegalPassed,
    legalTotal: legal.length,
    illegalTotal: illegal.length,
    failures,
  };
}

/** CLI entry when executed via tsx. */
export function main(): void {
  const result = runGoldens();
  if (result.failures.length) {
    console.error("ContentRecipe goldens FAILED:");
    for (const f of result.failures) console.error(" -", f);
    console.error(
      `legal ${result.legalPassed}/${result.legalTotal}, illegal ${result.illegalPassed}/${result.illegalTotal}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `ContentRecipe goldens OK — legal ${result.legalPassed}/${result.legalTotal}, illegal ${result.illegalPassed}/${result.illegalTotal}`,
  );
}

const isDirect =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].includes("run-goldens") ||
    process.argv[1].endsWith("content-recipe/run-goldens.ts"));

if (isDirect) {
  main();
}
