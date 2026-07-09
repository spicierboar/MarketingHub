// Compliance checker (master prompt §27) + Phase 3 governance:
// - rule-based risk flags (absolute claims, guarantees, stats, comparisons)
// - company-specific prohibited claims (Brand Brain)
// - claims audit: every risky claim is cross-checked against the Claims
//   Library and Evidence Locker (§29) — unsupported claims are flagged
// - consent checks against the Consent Register (§28)

import { listClaims, listEvidence, validConsents } from "@/lib/db";
import { now } from "@/lib/utils";
import type {
  ClaimAuditEntry,
  Company,
  ComplianceIssue,
  ComplianceResult,
  EvidenceType,
  RequestConsent,
  RiskLevel,
} from "@/lib/types";

interface Rule {
  test: RegExp;
  severity: RiskLevel;
  message: string;
  suggestion?: string;
  requiresEvidence?: boolean;
  // Which Evidence Locker types can substantiate this kind of claim.
  evidenceTypes?: EvidenceType[];
}

const RULES: Rule[] = [
  {
    test: /\b(guarantee[ds]?|guaranteed)\b/i,
    severity: "high",
    message: "Guarantee claim detected.",
    suggestion: "Remove or back with documented terms in the Evidence Locker.",
    requiresEvidence: true,
    evidenceTypes: ["guarantee_terms"],
  },
  {
    // NB: "#1" sits outside the \b group — \b before '#' can never match.
    test: /\b(best|number one|no\.?\s?1|the leading|top rated)\b|#\s?1\b/i,
    severity: "high",
    message: "Superlative / market-leadership claim detected.",
    suggestion: "Soften to a subjective, defensible statement.",
    requiresEvidence: true,
    evidenceTypes: ["comparison", "award", "certification"],
  },
  {
    test: /\b(cheapest|lowest price|unbeatable price|beat any quote)\b/i,
    severity: "high",
    message: "Absolute price claim detected.",
    suggestion: "Avoid absolute price claims; use 'competitive pricing'.",
    requiresEvidence: true,
    evidenceTypes: ["pricing", "comparison"],
  },
  {
    test: /\b(100%|completely|totally|always|never fails?|risk[- ]free|painless)\b/i,
    severity: "medium",
    message: "Absolute / risk-free wording detected.",
    suggestion: "Qualify the claim or remove the absolute term.",
  },
  {
    test: /\b\d{1,3}%/,
    severity: "medium",
    message: "Statistic / percentage claim detected.",
    suggestion: "Ensure the figure is supported by evidence.",
    requiresEvidence: true,
    evidenceTypes: ["pricing", "customer_outcome", "comparison"],
  },
  {
    test: /\b(better than|compared to|vs\.?|versus|outperforms)\b/i,
    severity: "medium",
    message: "Competitor comparison detected.",
    suggestion: "Comparisons need substantiation; consider removing.",
    requiresEvidence: true,
    evidenceTypes: ["comparison"],
  },
  {
    test: /\b(cure|heal|clinically proven|medically proven)\b/i,
    severity: "critical",
    message: "Regulated health/efficacy claim detected.",
    suggestion: "Requires compliance/legal review before use.",
    requiresEvidence: true,
    evidenceTypes: ["certification"],
  },
];

const RANK: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// All distinct phrases in `text` matched by a rule (global scan — a body with
// both "1%" and "50% off" yields both, not just the first).
function ruleMatches(rule: Rule, text: string): string[] {
  const flags = rule.test.flags.includes("g")
    ? rule.test.flags
    : rule.test.flags + "g";
  const re = new RegExp(rule.test.source, flags);
  return [...new Set([...text.matchAll(re)].map((m) => m[0].toLowerCase()))];
}

// Approved claims from the Claims Library that appear verbatim in the text.
async function approvedClaimsInText(text: string, company: Company) {
  const lower = text.toLowerCase();
  return (await listClaims(company.id)).filter((c) =>
    lower.includes(c.claimText.toLowerCase()),
  );
}

// A risky phrase is exempt when it appears inside an approved claim that is
// itself used verbatim in the text — approved wording must never be penalised.
function coveredByLibrary(
  phrase: string,
  present: { claimText: string }[],
): boolean {
  return present.some((c) => c.claimText.toLowerCase().includes(phrase));
}

// Evidence is only valid backing while unexpired (mirrors validConsents).
async function validEvidence(companyId: string) {
  const today = now().slice(0, 10);
  return (await listEvidence(companyId)).filter(
    (e) => !e.validUntil || e.validUntil >= today,
  );
}

// Cross-check the text against the Claims Library and Evidence Locker (§29).
// Approved claims used verbatim are positive signals; risky patterns without
// valid (unexpired) matching evidence are flagged Unsupported.
export async function auditClaims(
  text: string,
  company: Company,
): Promise<ClaimAuditEntry[]> {
  const entries: ClaimAuditEntry[] = [];
  const present = await approvedClaimsInText(text, company);
  const evidence = await validEvidence(company.id);

  for (const claim of present) {
    entries.push({ claim: claim.claimText, status: "approved" });
  }

  for (const rule of RULES) {
    if (!rule.evidenceTypes) continue;
    for (const phrase of ruleMatches(rule, text)) {
      if (coveredByLibrary(phrase, present)) continue;
      const backing = evidence.find((e) =>
        rule.evidenceTypes!.includes(e.evidenceType),
      );
      entries.push(
        backing
          ? {
              claim: `“${phrase}” — ${rule.message}`,
              status: "evidence_on_file",
              evidenceTitle: backing.title,
            }
          : { claim: `“${phrase}” — ${rule.message}`, status: "unsupported" },
      );
    }
  }

  return entries;
}

export async function checkCompliance(
  text: string,
  company: Company,
  opts: { consent?: RequestConsent | null } = {},
): Promise<ComplianceResult> {
  const issues: ComplianceIssue[] = [];
  const present = await approvedClaimsInText(text, company);

  for (const rule of RULES) {
    // Phrases covered by an approved Claims Library entry used verbatim are
    // exempt — otherwise fully-compliant drafts get escalated as high risk.
    const uncovered = ruleMatches(rule, text).filter(
      (p) => !coveredByLibrary(p, present),
    );
    if (uncovered.length > 0) {
      issues.push({
        severity: rule.severity,
        message: `${rule.message} (${uncovered.map((p) => `"${p}"`).join(", ")})`,
        suggestion: rule.suggestion,
      });
    }
  }

  // Company-specific prohibited claims (from the Brand Brain).
  for (const claim of company.profile.prohibitedClaims) {
    const term = claim.trim();
    if (term && text.toLowerCase().includes(term.toLowerCase())) {
      issues.push({
        severity: "critical",
        message: `Prohibited claim for ${company.name}: "${term}".`,
        suggestion: "This wording is banned for this company. Remove it.",
      });
    }
  }

  // Claims audit: unsupported claims raise a high-severity issue (§29).
  const audit = await auditClaims(text, company);
  const unsupported = audit.filter((a) => a.status === "unsupported");
  if (unsupported.length > 0) {
    issues.push({
      severity: "high",
      message: `${unsupported.length} claim(s) not in the Claims Library and without supporting evidence.`,
      suggestion:
        "Use approved wording from the Claims Library, or add evidence to the Evidence Locker.",
    });
  }

  // Consent Register check (§28): a named/shown customer needs consent marked
  // obtained on the request AND a valid register record. (Per-person matching
  // needs a person field on the request — later phase.)
  if (opts.consent?.customerNamed || opts.consent?.customerInPhotos) {
    if (!opts.consent.consentObtained) {
      issues.push({
        severity: "critical",
        message:
          "A customer is named or shown, but the request does not confirm consent has been obtained.",
        suggestion:
          "Obtain consent, record it in the Consent Register, and update the request.",
      });
    } else if ((await validConsents(company.id)).length === 0) {
      issues.push({
        severity: "critical",
        message:
          "A customer is named or shown, but there is no valid consent record in the Consent Register.",
        suggestion:
          "Add a consent record (or the existing one has expired / been withdrawn).",
      });
    }
  }

  const requiresEvidence = unsupported.length > 0;

  let riskLevel: RiskLevel = "low";
  for (const i of issues) {
    if (RANK[i.severity] > RANK[riskLevel]) riskLevel = i.severity;
  }

  return {
    riskLevel,
    issues,
    canProceed: riskLevel !== "critical",
    requiresEvidence,
    checkedAt: now(),
  };
}
