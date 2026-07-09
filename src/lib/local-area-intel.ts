// Local Area Intelligence helpers (§22) — completeness, summary strip,
// and AI context. Profile data lives in local_area_profiles (no migration).

import type { LocalAreaProfile } from "@/lib/types";

export interface IntelFieldDef {
  id: keyof Pick<
    LocalAreaProfile,
    | "suburbs"
    | "competitors"
    | "localEvents"
    | "searchTerms"
    | "buyingTriggers"
    | "demographics"
    | "commonNeeds"
    | "seasonalPatterns"
  >;
  label: string;
  kind: "lines" | "text";
}

export const KEY_INTEL_FIELDS: IntelFieldDef[] = [
  { id: "suburbs", label: "Suburbs / regions served", kind: "lines" },
  { id: "competitors", label: "Local competitors", kind: "lines" },
  { id: "localEvents", label: "Local events", kind: "text" },
  { id: "searchTerms", label: "Common search terms", kind: "lines" },
  { id: "buyingTriggers", label: "Buying triggers", kind: "text" },
];

export const EXTENDED_INTEL_FIELDS: IntelFieldDef[] = [
  { id: "demographics", label: "Customer demographics", kind: "text" },
  { id: "commonNeeds", label: "Common local customer needs", kind: "text" },
  { id: "seasonalPatterns", label: "Seasonal demand patterns", kind: "text" },
];

export const ALL_INTEL_FIELDS: IntelFieldDef[] = [
  ...KEY_INTEL_FIELDS,
  ...EXTENDED_INTEL_FIELDS,
];

function fieldPresent(local: LocalAreaProfile, field: IntelFieldDef): boolean {
  const value = local[field.id];
  if (field.kind === "lines") {
    return Array.isArray(value) && value.length > 0;
  }
  return typeof value === "string" && value.trim().length > 0;
}

export function localIntelCompleteness(
  local: LocalAreaProfile | undefined,
): { score: number; missing: string[] } {
  if (!local) {
    return { score: 0, missing: ALL_INTEL_FIELDS.map((f) => f.label) };
  }
  const missing: string[] = [];
  let have = 0;
  for (const f of ALL_INTEL_FIELDS) {
    if (fieldPresent(local, f)) have += 1;
    else missing.push(f.label);
  }
  return {
    score: Math.round((have / ALL_INTEL_FIELDS.length) * 100),
    missing,
  };
}

export function localIntelSummary(local: LocalAreaProfile | undefined): string {
  if (!local) {
    return "No local intelligence yet — add suburbs and competitors to ground AI drafts.";
  }
  const parts: string[] = [];
  if (local.suburbs.length) {
    parts.push(
      local.suburbs.length === 1
        ? local.suburbs[0]
        : `${local.suburbs.length} suburbs`,
    );
  }
  if (local.competitors.length) {
    parts.push(
      `${local.competitors.length} competitor${local.competitors.length === 1 ? "" : "s"}`,
    );
  }
  if (local.searchTerms.length) {
    parts.push(
      `${local.searchTerms.length} search term${local.searchTerms.length === 1 ? "" : "s"}`,
    );
  }
  if (local.localEvents?.trim()) parts.push("local events");
  if (local.buyingTriggers?.trim()) parts.push("buying triggers");
  return parts.length
    ? parts.join(" · ")
    : "Profile started — fill in suburbs and competitors.";
}

export function localIntelHighlights(
  local: LocalAreaProfile | undefined,
): { label: string; value: string }[] {
  if (!local) return [];
  const highlights: { label: string; value: string }[] = [];
  if (local.suburbs.length) {
    highlights.push({
      label: "Suburbs",
      value:
        local.suburbs.length <= 3
          ? local.suburbs.join(", ")
          : `${local.suburbs.slice(0, 3).join(", ")} +${local.suburbs.length - 3}`,
    });
  }
  if (local.competitors.length) {
    highlights.push({
      label: "Competitors",
      value:
        local.competitors.length <= 2
          ? local.competitors.join(", ")
          : `${local.competitors[0]} +${local.competitors.length - 1} more`,
    });
  }
  if (local.localEvents?.trim()) {
    highlights.push({
      label: "Events",
      value:
        local.localEvents.length > 80
          ? `${local.localEvents.slice(0, 77)}…`
          : local.localEvents,
    });
  }
  if (local.searchTerms.length) {
    highlights.push({
      label: "Search terms",
      value: local.searchTerms.slice(0, 4).join(", "),
    });
  }
  if (local.buyingTriggers?.trim()) {
    highlights.push({
      label: "Buying triggers",
      value:
        local.buyingTriggers.length > 80
          ? `${local.buyingTriggers.slice(0, 77)}…`
          : local.buyingTriggers,
    });
  }
  return highlights;
}

export function buildLocalIntelAiContext(local: LocalAreaProfile | undefined): string {
  if (!local) return "";
  const lines = [
    local.suburbs.length && `Suburbs: ${local.suburbs.join(", ")}`,
    local.demographics?.trim() && `Demographics: ${local.demographics.trim()}`,
    local.commonNeeds?.trim() && `Common needs: ${local.commonNeeds.trim()}`,
    local.competitors.length && `Competitors: ${local.competitors.join(", ")}`,
    local.localEvents?.trim() && `Local events: ${local.localEvents.trim()}`,
    local.seasonalPatterns?.trim() &&
      `Seasonal patterns: ${local.seasonalPatterns.trim()}`,
    local.searchTerms.length && `Search terms: ${local.searchTerms.join(", ")}`,
    local.buyingTriggers?.trim() && `Buying triggers: ${local.buyingTriggers.trim()}`,
  ].filter(Boolean);
  return lines.length ? `LOCAL AREA INTELLIGENCE:\n${lines.join("\n")}` : "";
}
