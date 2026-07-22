/**
 * Structured brief fields for Extras orders — precise capture for fulfilment.
 */

export const ORDER_AUDIENCE_OPTIONS = [
  { value: "local_nearby", label: "Local customers nearby" },
  { value: "existing_customers", label: "Existing customers" },
  { value: "new_prospects", label: "New customers / prospects" },
  { value: "b2b_professionals", label: "Professionals / B2B" },
  { value: "families", label: "Parents / families" },
  { value: "visitors", label: "Tourists / visitors" },
  { value: "staff_internal", label: "Staff / internal" },
  { value: "media_press", label: "Media / press" },
  { value: "other", label: "Other" },
] as const;

export const ORDER_TONE_OPTIONS = [
  { value: "warm", label: "Warm & inviting" },
  { value: "professional", label: "Professional & direct" },
  { value: "premium", label: "Premium / polished" },
  { value: "casual", label: "Casual & friendly" },
  { value: "calm", label: "Calm & trustworthy" },
] as const;

export const ORDER_CTA_OPTIONS = [
  { value: "book", label: "Book online / book a visit" },
  { value: "enquire", label: "Enquire / contact us" },
  { value: "visit", label: "Visit in person / find us" },
  { value: "buy", label: "Buy / shop" },
  { value: "learn", label: "Learn more / read more" },
  { value: "soft", label: "Soft mention only (no hard CTA)" },
  { value: "none", label: "None / N/A" },
] as const;

export const ORDER_FACT_TYPE_OPTIONS = [
  { value: "prices", label: "Prices or fees" },
  { value: "dates_hours", label: "Dates, hours, or availability" },
  { value: "location", label: "Location, suburbs, or service area" },
  { value: "offer", label: "Offer or promotion terms" },
  { value: "product", label: "Product, service, or menu specifics" },
  { value: "contact", label: "Contact, booking link, or phone" },
] as const;

export const ORDER_AVOID_OPTIONS = [
  { value: "competitors", label: "No competitor names" },
  { value: "superlatives", label: "No unverifiable “best / guaranteed” claims" },
  { value: "emojis", label: "No emojis" },
  { value: "short", label: "Keep it short / respect length limits" },
] as const;

export const ORDER_TIMING_OPTIONS = [
  { value: "asap", label: "ASAP / this week" },
  { value: "flexible", label: "Flexible" },
  { value: "specific", label: "Specific date (set Preferred date below)" },
] as const;

export type OrderBriefParsed = {
  audience: string;
  audienceNotes: string;
  tone: string;
  cta: string;
  factTypes: string[];
  mustIncludeFacts: string;
  avoid: string[];
  timing: string;
  targetQuestions: string;
  otherNotes: string;
};

function labelOf(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

function multi(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .map((v) => String(v).trim())
    .filter(Boolean);
}

export function parseOrderBriefFromFormData(formData: FormData): OrderBriefParsed {
  return {
    audience: String(formData.get("audience") || "").trim(),
    audienceNotes: String(formData.get("audienceNotes") || "").trim(),
    tone: String(formData.get("tone") || "").trim(),
    cta: String(formData.get("cta") || "").trim(),
    factTypes: multi(formData, "factType"),
    mustIncludeFacts: String(formData.get("mustIncludeFacts") || "").trim(),
    avoid: multi(formData, "avoid"),
    timing: String(formData.get("timing") || "").trim(),
    targetQuestions: String(formData.get("targetQuestions") || "").trim(),
    otherNotes: String(formData.get("otherNotes") || "").trim(),
  };
}

export function assertOrderBriefComplete(brief: OrderBriefParsed): void {
  if (!brief.audience) throw new Error("Choose who this is for (audience).");
  if (!brief.tone) throw new Error("Choose a tone.");
  if (!brief.cta) throw new Error("Choose a call to action.");
  if (!brief.mustIncludeFacts || brief.mustIncludeFacts.length < 12) {
    throw new Error(
      "Add must-include facts (at least a short sentence) so we can draft accurately.",
    );
  }
  if (!brief.timing) throw new Error("Choose a timing preference.");
}

/** Human-readable brief block stored on the request / recipe notes. */
export function formatOrderBriefNotes(brief: OrderBriefParsed): string {
  const lines: string[] = [
    "Structured brief:",
    `Audience: ${labelOf(ORDER_AUDIENCE_OPTIONS, brief.audience)}`,
  ];
  if (brief.audienceNotes) lines.push(`Audience notes: ${brief.audienceNotes}`);
  lines.push(`Tone: ${labelOf(ORDER_TONE_OPTIONS, brief.tone)}`);
  lines.push(`CTA: ${labelOf(ORDER_CTA_OPTIONS, brief.cta)}`);
  if (brief.factTypes.length) {
    lines.push(
      `Fact types: ${brief.factTypes
        .map((v) => labelOf(ORDER_FACT_TYPE_OPTIONS, v))
        .join("; ")}`,
    );
  }
  lines.push(`Must-include facts: ${brief.mustIncludeFacts}`);
  if (brief.avoid.length) {
    lines.push(
      `Avoid: ${brief.avoid.map((v) => labelOf(ORDER_AVOID_OPTIONS, v)).join("; ")}`,
    );
  }
  lines.push(`Timing: ${labelOf(ORDER_TIMING_OPTIONS, brief.timing)}`);
  if (brief.targetQuestions) {
    lines.push(`Target questions / phrases: ${brief.targetQuestions}`);
  }
  if (brief.otherNotes) lines.push(`Other notes: ${brief.otherNotes}`);
  return lines.join("\n");
}
