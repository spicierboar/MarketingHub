// Suggest-only triage notes for the Approvals queue.
// Rule-based by default (free, deterministic). Never approves, schedules, or publishes.
// Optional Claude narrative can be layered later via guardedClaudeCall + assertAiBudget.

import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { titleCase } from "@/lib/utils";
import type { Company, ContentItem, RiskLevel } from "@/lib/types";

export type ApprovalRecommendation = "approve" | "edit" | "reject" | "escalate";

export interface ApprovalAssist {
  summary: string;
  risks: string[];
  recommendation: ApprovalRecommendation;
  reasons: string[];
  /** Always "rules" for the page-load path — LLM path would set model id. */
  source: "rules";
}

const RISK_RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Build a short triage assist for one pending content item.
 * Reuses stored compliance / claim audit when present; otherwise runs the
 * same rule engines as the editor (no Claude, no budget meter).
 */
export async function buildApprovalAssist(
  content: ContentItem,
  company: Company,
): Promise<ApprovalAssist> {
  const compliance =
    content.compliance ?? (await checkCompliance(content.body, company));
  const claimAudit =
    content.claimAudit ?? (await auditClaims(content.body, company));

  const unsupported = claimAudit.filter((c) => c.status === "unsupported");
  const risks: string[] = [];
  const reasons: string[] = [];

  for (const issue of compliance.issues) {
    risks.push(`${titleCase(issue.severity)}: ${issue.message}`);
  }
  for (const claim of unsupported) {
    const line = `Unsupported claim: ${claim.claim}`;
    if (!risks.includes(line)) risks.push(line);
  }
  if (content.groundingLabel === "requires_evidence") {
    risks.push("Grounding: requires evidence before publish.");
  } else if (content.groundingLabel === "unsupported") {
    risks.push("Grounding: marked unsupported.");
  }
  if (content.duplicateWarning) {
    risks.push(`Similarity: ${content.duplicateWarning}`);
  }

  const route = content.routedTo ?? "admin";
  const elevated = route === "senior" || route === "compliance";
  const blocked = !compliance.canProceed;
  const risk = compliance.riskLevel;

  let recommendation: ApprovalRecommendation;
  if (blocked || risk === "critical") {
    recommendation = elevated ? "escalate" : "reject";
    reasons.push(
      blocked
        ? "Critical compliance block — do not approve until resolved."
        : "Critical risk wording — send back or escalate.",
    );
  } else if (elevated) {
    recommendation = "escalate";
    reasons.push(`Routed to ${route} — keep in the elevated queue.`);
  } else if (
    risk === "high" ||
    unsupported.length > 0 ||
    content.groundingLabel === "requires_evidence" ||
    content.groundingLabel === "unsupported"
  ) {
    recommendation = "edit";
    if (risk === "high") reasons.push("High compliance risk — revise before approving.");
    if (unsupported.length > 0) {
      reasons.push(`${unsupported.length} unsupported claim(s) need evidence or rewording.`);
    }
    if (
      content.groundingLabel === "requires_evidence" ||
      content.groundingLabel === "unsupported"
    ) {
      reasons.push("Grounding is incomplete.");
    }
  } else if (risk === "medium" || content.duplicateWarning) {
    recommendation = "edit";
    if (risk === "medium") reasons.push("Medium compliance flags — quick edit recommended.");
    if (content.duplicateWarning) {
      reasons.push("Near-duplicate of existing content — differentiate or confirm intentional.");
    }
  } else {
    recommendation = "approve";
    reasons.push(
      RISK_RANK[risk] === 0 && risks.length === 0
        ? "No rule-based compliance or claim issues detected."
        : "Residual notes are informational — safe to approve if copy looks right.",
    );
  }

  const typeLabel = titleCase(content.type);
  const riskLabel = titleCase(risk);
  const claimNote =
    unsupported.length > 0
      ? `${unsupported.length} unsupported claim(s)`
      : claimAudit.some((c) => c.status === "approved")
        ? "uses approved claims"
        : "no claim flags";

  const summary = `${typeLabel} for ${company.name} — ${riskLabel} risk, ${claimNote}${
    content.groundingLabel ? `, ${content.groundingLabel.replace(/_/g, " ")}` : ""
  }.`;

  return {
    summary,
    risks: risks.slice(0, 6),
    recommendation,
    reasons: reasons.slice(0, 4),
    source: "rules",
  };
}
