// Self-tests for managed-service quality routing (PASS/WARN/FAIL/ESCALATE → queues).

import {
  decideQualityRouting,
  mapCritiqueToQualityGate,
} from "@/lib/managed-service/quality-routing";
import type { AiCritique } from "@/lib/types";

function critique(status: AiCritique["status"]): AiCritique {
  return {
    status,
    notes:
      status === "block"
        ? [{ severity: "block", message: "blocked" }]
        : status === "warn"
          ? [{ severity: "warn", message: "warn" }]
          : [],
    model: "rules-engine",
    critiquedAt: new Date().toISOString(),
  };
}

export async function checkQualityGateMapping(): Promise<{ ok: boolean; detail: string }> {
  const pass = mapCritiqueToQualityGate(critique("pass"), "admin");
  const warn = mapCritiqueToQualityGate(critique("warn"), "admin");
  const fail = mapCritiqueToQualityGate(critique("block"), "admin");
  const escalate = mapCritiqueToQualityGate(critique("pass"), "compliance");
  const ok = pass === "pass" && warn === "warn" && fail === "fail" && escalate === "escalate";
  return {
    ok,
    detail: ok
      ? `pass/warn/fail/escalate mapped`
      : `got pass=${pass} warn=${warn} fail=${fail} escalate=${escalate}`,
  };
}

export async function checkQualityRoutingDecisions(): Promise<{ ok: boolean; detail: string }> {
  const cases: Array<{
    gate: "pass" | "warn" | "fail" | "escalate";
    level: "approval" | "managed_exceptions" | "fully_managed";
    expect: "auto_submit_client" | "hold_agency";
  }> = [
    { gate: "pass", level: "fully_managed", expect: "auto_submit_client" },
    { gate: "warn", level: "managed_exceptions", expect: "auto_submit_client" },
    { gate: "pass", level: "approval", expect: "hold_agency" },
    { gate: "fail", level: "fully_managed", expect: "hold_agency" },
    { gate: "escalate", level: "fully_managed", expect: "hold_agency" },
    { gate: "warn", level: "approval", expect: "hold_agency" },
  ];

  const fails: string[] = [];
  for (const c of cases) {
    const { decision } = decideQualityRouting(c.gate, c.level);
    if (decision !== c.expect) {
      fails.push(`${c.gate}+${c.level}→${decision} (want ${c.expect})`);
    }
  }
  return {
    ok: fails.length === 0,
    detail: fails.length === 0 ? `${cases.length} decision cases ok` : fails.join("; "),
  };
}
