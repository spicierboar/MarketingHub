/**
 * Structured brief fields for Extras orders — schema varies by catalogue category.
 * A brochure should not ask for the same CTA as a landing page.
 */

import type { ClientMenuCategoryId } from "@/lib/client-order-catalogue-data";

export type BriefOption = { value: string; label: string };

export const ORDER_AUDIENCE_CUSTOMER: BriefOption[] = [
  { value: "local_nearby", label: "Local customers nearby" },
  { value: "existing_customers", label: "Existing customers" },
  { value: "new_prospects", label: "New customers / prospects" },
  { value: "b2b_professionals", label: "Professionals / B2B" },
  { value: "families", label: "Parents / families" },
  { value: "visitors", label: "Tourists / visitors" },
  { value: "other", label: "Other" },
];

export const ORDER_AUDIENCE_INTERNAL: BriefOption[] = [
  { value: "all_staff", label: "All staff" },
  { value: "managers", label: "Managers / team leads" },
  { value: "frontline", label: "Frontline / store team" },
  { value: "new_hires", label: "New hires" },
  { value: "other", label: "Other" },
];

export const ORDER_AUDIENCE_MEDIA: BriefOption[] = [
  { value: "local_media", label: "Local / trade media" },
  { value: "national_media", label: "National media" },
  { value: "industry_analysts", label: "Industry analysts" },
  { value: "partners", label: "Partners / stakeholders" },
  { value: "other", label: "Other" },
];

export const ORDER_AUDIENCE_HR: BriefOption[] = [
  { value: "job_seekers", label: "Job seekers" },
  { value: "passive_candidates", label: "Passive candidates" },
  { value: "employees", label: "Current employees" },
  { value: "other", label: "Other" },
];

export const ORDER_TONE_OPTIONS: BriefOption[] = [
  { value: "warm", label: "Warm & inviting" },
  { value: "professional", label: "Professional & direct" },
  { value: "premium", label: "Premium / polished" },
  { value: "casual", label: "Casual & friendly" },
  { value: "calm", label: "Calm & trustworthy" },
];

/** Hard conversion CTAs — landing, ads, email, social, etc. */
export const ORDER_CTA_CONVERSION: BriefOption[] = [
  { value: "book", label: "Book online / book a visit" },
  { value: "enquire", label: "Enquire / contact us" },
  { value: "visit", label: "Visit in person / find us" },
  { value: "buy", label: "Buy / shop" },
  { value: "learn", label: "Learn more / read more" },
  { value: "soft", label: "Soft mention only (no hard CTA)" },
  { value: "none", label: "None / N/A" },
];

/** Softer next-step for print / editorial / reports */
export const ORDER_CTA_PRINT_NEXT: BriefOption[] = [
  { value: "qr_web", label: "QR / link to website" },
  { value: "visit_store", label: "Visit the store / location" },
  { value: "call", label: "Call or enquire" },
  { value: "keep", label: "Keep for reference (no action)" },
  { value: "none", label: "None / N/A" },
];

export const ORDER_CTA_INTERNAL: BriefOption[] = [
  { value: "acknowledge", label: "Read / acknowledge" },
  { value: "reply", label: "Reply or confirm" },
  { value: "attend", label: "Attend / RSVP" },
  { value: "complete", label: "Complete a form or task" },
  { value: "none", label: "FYI only — no action" },
];

export const ORDER_CTA_PR: BriefOption[] = [
  { value: "cover", label: "Request coverage / interview" },
  { value: "publish", label: "Publish the announcement" },
  { value: "share", label: "Share with network" },
  { value: "none", label: "Informational only" },
];

export const ORDER_FACT_TYPE_OPTIONS: BriefOption[] = [
  { value: "prices", label: "Prices or fees" },
  { value: "dates_hours", label: "Dates, hours, or availability" },
  { value: "location", label: "Location, suburbs, or service area" },
  { value: "offer", label: "Offer or promotion terms" },
  { value: "product", label: "Product, service, or menu specifics" },
  { value: "contact", label: "Contact, booking link, or phone" },
];

export const ORDER_AVOID_DEFAULT: BriefOption[] = [
  { value: "competitors", label: "No competitor names" },
  { value: "superlatives", label: "No unverifiable “best / guaranteed” claims" },
  { value: "emojis", label: "No emojis" },
  { value: "short", label: "Keep it short / respect length limits" },
];

export const ORDER_AVOID_PRINT: BriefOption[] = [
  { value: "competitors", label: "No competitor names" },
  { value: "superlatives", label: "No unverifiable “best / guaranteed” claims" },
  { value: "clutter", label: "Avoid clutter — leave white space" },
  { value: "short", label: "Keep copy scannable for print" },
];

export const ORDER_AVOID_LEGAL: BriefOption[] = [
  { value: "advice", label: "No legal advice framing" },
  { value: "superlatives", label: "No unverifiable guarantees" },
  { value: "lawyer_review", label: "Flag for lawyer review before publish" },
];

export const ORDER_TIMING_OPTIONS: BriefOption[] = [
  { value: "asap", label: "ASAP / this week" },
  { value: "flexible", label: "Flexible" },
  { value: "specific", label: "Specific date (set Preferred date below)" },
];

export const ORDER_PRINT_FORMAT: BriefOption[] = [
  { value: "a5_flyer", label: "A5 flyer" },
  { value: "trifold", label: "Trifold brochure" },
  { value: "leave_behind", label: "One-page leave-behind" },
  { value: "poster", label: "Poster / window" },
  { value: "other_print", label: "Other print format" },
];

export const ORDER_PRINT_DISTRIBUTION: BriefOption[] = [
  { value: "letterbox", label: "Letterbox drop" },
  { value: "in_store", label: "In-store / front desk" },
  { value: "event", label: "Event / trade show" },
  { value: "sales", label: "Sales leave-behind" },
  { value: "pdf", label: "PDF / email attachment" },
  { value: "other_dist", label: "Other" },
];

export const ORDER_VIDEO_RUNTIME: BriefOption[] = [
  { value: "15s", label: "About 15 seconds" },
  { value: "30s", label: "About 30 seconds" },
  { value: "60s", label: "About 60 seconds" },
  { value: "2min", label: "2+ minutes" },
  { value: "other_len", label: "Other / flexible" },
];

export type OrderBriefFieldId =
  | "audience"
  | "audienceNotes"
  | "tone"
  | "cta"
  | "factTypes"
  | "mustIncludeFacts"
  | "avoid"
  | "timing"
  | "targetQuestions"
  | "printFormat"
  | "printDistribution"
  | "videoRuntime"
  | "otherNotes";

export type OrderBriefFieldConfig = {
  id: OrderBriefFieldId;
  required: boolean;
  /** Override default label */
  label: string;
  hint?: string;
  options?: BriefOption[];
};

export type OrderBriefSchema = {
  categoryId: ClientMenuCategoryId;
  fields: OrderBriefFieldConfig[];
};

function field(
  id: OrderBriefFieldId,
  partial: Omit<OrderBriefFieldConfig, "id">,
): OrderBriefFieldConfig {
  return { id, ...partial };
}

const CORE_ALWAYS = (
  audience: BriefOption[],
  extras: OrderBriefFieldConfig[] = [],
): OrderBriefFieldConfig[] => [
  field("audience", {
    required: true,
    label: "Audience",
    hint: "Who should this speak to?",
    options: audience,
  }),
  field("audienceNotes", {
    required: false,
    label: "Audience notes (optional)",
    hint: "Suburb, segment, role — anything that narrows it",
  }),
  field("tone", {
    required: true,
    label: "Tone",
    hint: "Pick one voice for the draft",
    options: ORDER_TONE_OPTIONS,
  }),
  ...extras,
  field("factTypes", {
    required: false,
    label: "Must-include fact types",
    hint: "Tick what the draft must cover — then spell them out below",
    options: ORDER_FACT_TYPE_OPTIONS,
  }),
  field("mustIncludeFacts", {
    required: true,
    label: "Must-include facts",
    hint: "Exact prices, dates, places, offers, or claims we must use",
  }),
  field("avoid", {
    required: false,
    label: "Avoid",
    hint: "Optional guardrails",
    options: ORDER_AVOID_DEFAULT,
  }),
  field("timing", {
    required: true,
    label: "Timing preference",
    options: ORDER_TIMING_OPTIONS,
  }),
  field("otherNotes", {
    required: false,
    label: "Anything else (optional)",
    hint: "Links, references, or constraints that don’t fit above",
  }),
];

/** Category → which controls appear (and with which options / labels). */
export function getOrderBriefSchema(
  categoryId: ClientMenuCategoryId,
): OrderBriefSchema {
  switch (categoryId) {
    case "landing":
    case "advertising":
    case "email":
    case "social":
    case "messaging":
    case "events":
    case "sales":
      return {
        categoryId,
        fields: CORE_ALWAYS(ORDER_AUDIENCE_CUSTOMER, [
          field("cta", {
            required: true,
            label: "Call to action",
            hint: "What should they do next?",
            options: ORDER_CTA_CONVERSION,
          }),
        ]),
      };

    case "website":
    case "editorial":
    case "proof":
    case "education":
    case "support":
    case "product":
    case "reports":
      return {
        categoryId,
        fields: CORE_ALWAYS(ORDER_AUDIENCE_CUSTOMER, [
          field("cta", {
            required: false,
            label: "Desired next step (optional)",
            hint: "Only if this piece should push an action — otherwise leave blank",
            options: ORDER_CTA_CONVERSION,
          }),
        ]),
      };

    case "print":
      return {
        categoryId,
        fields: CORE_ALWAYS(ORDER_AUDIENCE_CUSTOMER, [
          field("printFormat", {
            required: true,
            label: "Print format",
            hint: "What physical piece are we writing for?",
            options: ORDER_PRINT_FORMAT,
          }),
          field("printDistribution", {
            required: true,
            label: "How it will be used",
            hint: "Distribution shapes length and hierarchy",
            options: ORDER_PRINT_DISTRIBUTION,
          }),
          field("cta", {
            required: false,
            label: "Reader next step (optional)",
            hint: "Brochures often inform first — only set if you want a clear action",
            options: ORDER_CTA_PRINT_NEXT,
          }),
        ]).map((f) =>
          f.id === "avoid"
            ? { ...f, options: ORDER_AVOID_PRINT }
            : f,
        ),
      };

    case "video":
      return {
        categoryId,
        fields: CORE_ALWAYS(ORDER_AUDIENCE_CUSTOMER, [
          field("videoRuntime", {
            required: true,
            label: "Target length",
            options: ORDER_VIDEO_RUNTIME,
          }),
          field("cta", {
            required: false,
            label: "End-card next step (optional)",
            hint: "e.g. link in bio, book, visit — skip if pure brand/story",
            options: ORDER_CTA_CONVERSION,
          }),
        ]),
      };

    case "internal":
      return {
        categoryId,
        fields: CORE_ALWAYS(ORDER_AUDIENCE_INTERNAL, [
          field("cta", {
            required: true,
            label: "What should staff do?",
            options: ORDER_CTA_INTERNAL,
          }),
        ]),
      };

    case "pr":
      return {
        categoryId,
        fields: CORE_ALWAYS(ORDER_AUDIENCE_MEDIA, [
          field("cta", {
            required: false,
            label: "Ask of the reader (optional)",
            options: ORDER_CTA_PR,
          }),
        ]),
      };

    case "hr":
      return {
        categoryId,
        fields: CORE_ALWAYS(ORDER_AUDIENCE_HR, [
          field("cta", {
            required: true,
            label: "How should they apply / respond?",
            options: [
              { value: "email_cv", label: "Email CV / apply by email" },
              { value: "form", label: "Online application form" },
              { value: "enquire", label: "Enquire first" },
              { value: "none", label: "Informational only" },
            ],
          }),
        ]),
      };

    case "legal":
      return {
        categoryId,
        fields: CORE_ALWAYS(ORDER_AUDIENCE_CUSTOMER, []).map((f) =>
          f.id === "avoid" ? { ...f, options: ORDER_AVOID_LEGAL } : f,
        ),
      };

    case "discovery":
      return {
        categoryId,
        fields: CORE_ALWAYS(ORDER_AUDIENCE_CUSTOMER, [
          field("targetQuestions", {
            required: true,
            label: "Target questions / search phrases",
            hint: "What people ask — drives AEO, GEO, and LLMO packs",
          }),
          field("cta", {
            required: false,
            label: "Desired next step (optional)",
            options: ORDER_CTA_CONVERSION,
          }),
        ]),
      };

    default: {
      const _exhaustive: never = categoryId;
      void _exhaustive;
      return { categoryId, fields: CORE_ALWAYS(ORDER_AUDIENCE_CUSTOMER) };
    }
  }
}

export function briefField(
  schema: OrderBriefSchema,
  id: OrderBriefFieldId,
): OrderBriefFieldConfig | undefined {
  return schema.fields.find((f) => f.id === id);
}

export function schemaShows(
  schema: OrderBriefSchema,
  id: OrderBriefFieldId,
): boolean {
  return schema.fields.some((f) => f.id === id);
}

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
  printFormat: string;
  printDistribution: string;
  videoRuntime: string;
  otherNotes: string;
};

function labelOf(options: BriefOption[] | undefined, value: string): string {
  if (!value) return "";
  return options?.find((o) => o.value === value)?.label ?? value;
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
    printFormat: String(formData.get("printFormat") || "").trim(),
    printDistribution: String(formData.get("printDistribution") || "").trim(),
    videoRuntime: String(formData.get("videoRuntime") || "").trim(),
    otherNotes: String(formData.get("otherNotes") || "").trim(),
  };
}

export function assertOrderBriefComplete(
  brief: OrderBriefParsed,
  categoryId: ClientMenuCategoryId,
): void {
  const schema = getOrderBriefSchema(categoryId);
  for (const f of schema.fields) {
    if (!f.required) continue;
    const value = briefValue(brief, f.id);
    if (Array.isArray(value) ? value.length === 0 : !value) {
      throw new Error(`Please complete: ${f.label}.`);
    }
    if (f.id === "mustIncludeFacts" && String(value).length < 12) {
      throw new Error(
        "Add must-include facts (at least a short sentence) so we can draft accurately.",
      );
    }
    if (
      f.id === "targetQuestions" &&
      String(value).trim().split(/\s+/).length < 3
    ) {
      throw new Error("Add at least one clear target question or search phrase.");
    }
  }
}

function briefValue(
  brief: OrderBriefParsed,
  id: OrderBriefFieldId,
): string | string[] {
  switch (id) {
    case "audience":
      return brief.audience;
    case "audienceNotes":
      return brief.audienceNotes;
    case "tone":
      return brief.tone;
    case "cta":
      return brief.cta;
    case "factTypes":
      return brief.factTypes;
    case "mustIncludeFacts":
      return brief.mustIncludeFacts;
    case "avoid":
      return brief.avoid;
    case "timing":
      return brief.timing;
    case "targetQuestions":
      return brief.targetQuestions;
    case "printFormat":
      return brief.printFormat;
    case "printDistribution":
      return brief.printDistribution;
    case "videoRuntime":
      return brief.videoRuntime;
    case "otherNotes":
      return brief.otherNotes;
    default: {
      const _e: never = id;
      return _e;
    }
  }
}

/** Human-readable brief block stored on the request / recipe notes. */
export function formatOrderBriefNotes(
  brief: OrderBriefParsed,
  categoryId: ClientMenuCategoryId,
): string {
  const schema = getOrderBriefSchema(categoryId);
  const lines: string[] = [`Structured brief (${categoryId}):`];

  for (const f of schema.fields) {
    const raw = briefValue(brief, f.id);
    if (Array.isArray(raw)) {
      if (!raw.length) continue;
      lines.push(
        `${f.label}: ${raw.map((v) => labelOf(f.options, v)).join("; ")}`,
      );
      continue;
    }
    if (!raw) continue;
    if (f.options) {
      lines.push(`${f.label}: ${labelOf(f.options, raw)}`);
    } else {
      lines.push(`${f.label}: ${raw}`);
    }
  }

  return lines.join("\n");
}
