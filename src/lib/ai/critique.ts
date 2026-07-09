// Pre-publish AI critique (Module 3). Runs at schedule time — rule-based checks
// (compliance, duplicate similarity, platform length, grounding) plus an optional
// LLM review when ANTHROPIC_API_KEY is set. Blocks scheduling on critical issues.

import { AI_MODEL, callClaudeDetailed } from "@/lib/ai/claude";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { duplicateWarning } from "@/lib/ai/similarity";
import { getCompany } from "@/lib/db";
import { now } from "@/lib/utils";
import type { AiCritique, AiCritiqueNote, Company, ContentItem } from "@/lib/types";

const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  facebook: 500,
  instagram: 2200,
  "google business profile": 1500,
  gbp: 1500,
  tiktok: 2200,
};

function platformLimit(platform: string): number | undefined {
  const key = platform.toLowerCase().trim();
  return PLATFORM_CHAR_LIMITS[key];
}

function worstStatus(notes: AiCritiqueNote[]): AiCritique["status"] {
  if (notes.some((n) => n.severity === "block")) return "block";
  if (notes.some((n) => n.severity === "warn")) return "warn";
  return "pass";
}

export interface CritiqueInput {
  content: ContentItem;
  company: Company;
  platform: string;
}

export async function critiqueForPublish(input: CritiqueInput): Promise<AiCritique> {
  const { content, company, platform } = input;
  const notes: AiCritiqueNote[] = [];
  const body = content.body;
  const limit = platformLimit(platform);

  const compliance = content.compliance ?? (await checkCompliance(body, company));
  if (compliance.riskLevel === "high") {
    notes.push({
      severity: "block",
      message: `High compliance risk (${compliance.issues.length} issue(s)).`,
      suggestion: compliance.issues[0]?.suggestion ?? "Resolve compliance flags before publishing.",
    });
  } else if (compliance.riskLevel === "medium") {
    notes.push({
      severity: "warn",
      message: `Medium compliance risk — ${compliance.issues.length} issue(s) flagged.`,
      suggestion: "Review compliance notes before this goes live.",
    });
  }

  const claimAudit = content.claimAudit ?? (await auditClaims(body, company));
  const unsupported = claimAudit.filter((c) => c.status === "unsupported");
  if (unsupported.length > 0) {
    notes.push({
      severity: "block",
      message: `${unsupported.length} unsupported claim(s) detected.`,
      suggestion: "Add evidence to the Claims Library or remove the claims.",
    });
  }

  if (content.groundingLabel === "requires_evidence") {
    notes.push({
      severity: "warn",
      message: "Content is marked requires_evidence — not fully grounded.",
      suggestion: "Attach approved sources or revise before publishing.",
    });
  }

  const dup =
    content.duplicateWarning ??
    (await duplicateWarning(company.id, body, { excludeId: content.id }));
  if (dup) {
    notes.push({
      severity: "warn",
      message: dup,
      suggestion: "Consider differentiating this post from existing content.",
    });
  }

  if (limit && body.length > limit) {
    notes.push({
      severity: "block",
      message: `Body is ${body.length} chars — ${platform} limit is ~${limit}.`,
      suggestion: "Shorten the copy for this channel.",
    });
  }

  const ctas = company.profile.callsToAction;
  if (ctas.length > 0 && !ctas.some((c) => body.toLowerCase().includes(c.toLowerCase().slice(0, 12)))) {
    notes.push({
      severity: "info",
      message: "No approved call-to-action detected in the body.",
      suggestion: `Consider adding: ${ctas[0]}`,
    });
  }

  let model = "rules-engine";
  const llm = await llmCritique(content, company, platform, notes);
  if (llm) {
    model = llm.model;
    notes.push(...llm.notes);
  }

  return {
    status: worstStatus(notes),
    notes,
    model,
    critiquedAt: now(),
    platform,
  };
}

async function llmCritique(
  content: ContentItem,
  company: Company,
  platform: string,
  existing: AiCritiqueNote[],
): Promise<{ model: string; notes: AiCritiqueNote[] } | null> {
  const system = [
    "You are a senior marketing compliance reviewer. Review this pre-publish social post.",
    "Return ONLY a JSON array of objects: [{\"severity\":\"info|warn|block\",\"message\":\"...\",\"suggestion\":\"...\"}]",
    "Flag: off-brand tone, missing disclaimer, weak hook, wrong platform fit, unclear CTA.",
    "Do not repeat issues already listed. Max 3 new notes. Empty array [] if nothing to add.",
    "",
    `Company: ${company.name}`,
    `Brand voice: ${company.profile.brandVoice ?? "on brand"}`,
    `Platform: ${platform}`,
    existing.length ? `Already flagged: ${existing.map((n) => n.message).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = `Title: ${content.title}\n\nBody:\n${content.body.slice(0, 2000)}`;
  const result = await callClaudeDetailed(system, user, 400);
  if (!result) return null;

  try {
    const parsed = JSON.parse(result.text) as AiCritiqueNote[];
    if (!Array.isArray(parsed)) return null;
    const notes = parsed
      .filter((n) => n && typeof n.message === "string" && ["info", "warn", "block"].includes(n.severity))
      .slice(0, 3);
    return { model: AI_MODEL, notes };
  } catch {
    return null;
  }
}

export function critiqueBlocksScheduling(critique: AiCritique): boolean {
  return critique.status === "block";
}

export function formatCritiqueError(critique: AiCritique): string {
  const blocks = critique.notes.filter((n) => n.severity === "block");
  return `Pre-publish critique blocked scheduling: ${blocks.map((n) => n.message).join(" · ")}`;
}
