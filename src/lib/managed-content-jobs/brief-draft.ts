/**
 * AI-generated managed content brief stub.
 *
 * Staff approval / Engine submission continues through
 * `submitManagedContentJobForStaff` in `./service` (managed-content jobs).
 * This helper only drafts structured brief text — it does not submit jobs.
 */

import { liveIntegrationsAllowed } from "@/lib/env";
import type { ManagedChannelKey } from "@/lib/types";

export type ManagedContentBriefDraft = {
  title: string;
  theme: string;
  channelKeys: ManagedChannelKey[];
  objective: string;
  keyMessages: string[];
  cta: string;
  constraints: string[];
  /** Flattened brief string suitable for `submitManagedContentJob*` `brief`. */
  briefText: string;
  source: "ai" | "placeholder_mock";
};

function enabled(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(
    (process.env[name] ?? "").trim().toLowerCase(),
  );
}

/** Keep false until provider-gate review — do not enable live AI briefs. */
export function managedContentBriefsLive(): boolean {
  return (
    enabled("CONTENT_ENGINE_MANAGED_BRIEFS_LIVE") && liveIntegrationsAllowed()
  );
}

export type DraftManagedContentBriefInput = {
  companyName: string;
  theme: string;
  channelKeys: ManagedChannelKey[];
  conceptTitle?: string;
  goals?: string[];
  guardrailNotes?: string[];
};

/**
 * Returns a structured brief draft. When AI live is off, returns a PLACEHOLDER mock.
 * PLACEHOLDER: wire real model call behind managedContentBriefsLive() after review.
 */
export async function draftManagedContentBrief(
  input: DraftManagedContentBriefInput,
): Promise<ManagedContentBriefDraft> {
  if (!managedContentBriefsLive()) {
    const title =
      input.conceptTitle?.trim() ||
      `PLACEHOLDER brief — ${input.theme} for ${input.companyName}`;
    const keyMessages = [
      `PLACEHOLDER: lead with ${input.theme} for ${input.companyName}.`,
      "PLACEHOLDER: one proof point or offer detail (human review).",
      "PLACEHOLDER: local relevance line if applicable.",
    ];
    const cta = "PLACEHOLDER: soft CTA — visit / enquire / book";
    const constraints = [
      ...(input.guardrailNotes ?? []),
      "Stay within approved strategy channel and theme guardrails.",
      "Do not invent pricing, testimonials, or regulated claims.",
    ];
    const objective =
      input.goals?.[0]?.trim() ||
      `PLACEHOLDER objective for ${input.theme} across ${input.channelKeys.join(", ") || "agreed channels"}.`;
    const briefText = [
      title,
      `Objective: ${objective}`,
      `Theme: ${input.theme}`,
      `Channels: ${input.channelKeys.join(", ") || "none"}`,
      `Key messages: ${keyMessages.join(" | ")}`,
      `CTA: ${cta}`,
      `Constraints: ${constraints.join(" | ")}`,
    ].join("\n");
    return {
      title,
      theme: input.theme,
      channelKeys: [...input.channelKeys],
      objective,
      keyMessages,
      cta,
      constraints,
      briefText,
      source: "placeholder_mock",
    };
  }

  // PLACEHOLDER: call Content Engine / Groq brief generation, then map to this shape.
  throw new Error(
    "Live managed-content brief generation is not implemented; keep CONTENT_ENGINE_MANAGED_BRIEFS_LIVE off.",
  );
}
