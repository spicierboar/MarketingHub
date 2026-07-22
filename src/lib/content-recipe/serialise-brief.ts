/**
 * Deterministic brief string from a validated ContentRecipe.
 * Hub and managed jobs must serialise the same way (design §4, §8).
 */

import type { ContentRecipe } from "./types";

function subjectLine(recipe: ContentRecipe): string {
  switch (recipe.subject.kind) {
    case "client":
      return `Client companyId=${recipe.subject.companyId}`;
    case "industry":
      return `Industry industryId=${recipe.subject.industryId}`;
    case "general":
      return "General (agency IP)";
  }
}

function flagBlock(
  title: string,
  flags: Record<string, boolean> | object,
): string {
  const on = Object.entries(flags as Record<string, boolean>)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .sort();
  return on.length ? `${title}: ${on.join(", ")}` : `${title}: (none)`;
}

/**
 * Render a stable, multi-line brief. Field order is fixed; arrays sorted where
 * order is not semantically significant (optimiseFor, discoveryTargets,
 * requiredComponents). Channel order is preserved (primary first already
 * enforced by callers when desired).
 */
export function serialiseBrief(recipe: ContentRecipe): string {
  const optimise = [...recipe.optimiseFor].sort();
  const discovery = recipe.discoveryTargets
    ? [...recipe.discoveryTargets].sort()
    : [];
  const components = [...recipe.requiredComponents].sort();

  const lines: string[] = [
    `ContentRecipe schemaVersion=${recipe.schemaVersion}`,
    `Create for: ${recipe.createFor}`,
    `Subject: ${subjectLine(recipe)}`,
    `Category: ${recipe.category}`,
    `Type: ${recipe.contentType}`,
    `Family: ${recipe.family}`,
    `Channels: ${recipe.channels.join(", ")}`,
    `Primary channel: ${recipe.primaryChannel}`,
    `Objective: ${recipe.objective}`,
    `Funnel: ${recipe.funnelStage}`,
    `Audience: ${recipe.audience.type}` +
      (recipe.audience.awareness
        ? `; awareness=${recipe.audience.awareness}`
        : "") +
      (recipe.audience.decisionRole
        ? `; role=${recipe.audience.decisionRole}`
        : ""),
    `Optimise for: ${optimise.join(", ")}`,
  ];

  if (discovery.length) {
    lines.push(`Discovery targets: ${discovery.join(", ")}`);
  }

  lines.push(
    `Tone: ${recipe.tone}`,
    `Length: ${recipe.length}`,
  );

  if (recipe.structure) {
    lines.push(`Structure: ${recipe.structure}`);
  }

  lines.push(
    `Required components: ${components.join(", ") || "(none)"}`,
    `Evidence: ${recipe.evidence}`,
    flagBlock("Brand controls", recipe.brandControls),
    flagBlock("Compliance", recipe.compliance),
    flagBlock("Restricted", recipe.restricted),
    `Output: ${recipe.output.mode}` +
      (recipe.output.variantCount
        ? ` x${recipe.output.variantCount}`
        : ""),
    `Topic: ${recipe.topic.trim()}`,
  );

  if (recipe.notes?.trim()) {
    lines.push(`Notes: ${recipe.notes.trim()}`);
  }

  return lines.join("\n");
}
