/**
 * Item-sensitive Extra brief fields — derived from catalogue title/id patterns
 * so every SKU asks for what fulfilment needs (e.g. course outline → topic).
 */

import type { ClientMenuCategoryId } from "@/lib/client-order-catalogue-data";

export type SkuBriefRef = {
  id: string;
  title: string;
  categoryId: ClientMenuCategoryId;
};

export type ItemBriefOption = { value: string; label: string };

/** Fields contributed by item patterns (ids must exist on OrderBriefFieldId). */
export type ItemBriefField = {
  id: string;
  required: boolean;
  label: string;
  hint?: string;
  placeholder?: string;
  options?: ItemBriefOption[];
};

export const ORDER_LEARNING_LEVEL: ItemBriefOption[] = [
  { value: "beginner", label: "Beginner / foundation" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "mixed", label: "Mixed levels" },
];

export const ORDER_DURATION_SCOPE: ItemBriefOption[] = [
  { value: "15min", label: "About 15 minutes" },
  { value: "30_60min", label: "30–60 minutes" },
  { value: "half_day", label: "Half day" },
  { value: "full_day", label: "Full day" },
  { value: "multi_session", label: "Multi-session / programme" },
  { value: "self_paced", label: "Self-paced / open" },
  { value: "other", label: "Other / not sure" },
];

export const ORDER_SLIDE_COUNT: ItemBriefOption[] = [
  { value: "3", label: "About 3" },
  { value: "5", label: "About 5" },
  { value: "7", label: "About 7" },
  { value: "10", label: "About 10" },
  { value: "12plus", label: "12+" },
  { value: "flexible", label: "Flexible — you decide" },
];

export const ORDER_EMAIL_COUNT: ItemBriefOption[] = [
  { value: "3", label: "3 emails" },
  { value: "5", label: "5 emails" },
  { value: "7", label: "7 emails" },
  { value: "10", label: "About 10" },
  { value: "flexible", label: "Flexible — you decide" },
];

export const ORDER_THREAD_COUNT: ItemBriefOption[] = [
  { value: "3", label: "About 3 posts" },
  { value: "5", label: "About 5 posts" },
  { value: "7", label: "About 7 posts" },
  { value: "10plus", label: "10+" },
  { value: "flexible", label: "Flexible" },
];

function f(id: string, partial: Omit<ItemBriefField, "id">): ItemBriefField {
  return { id, ...partial };
}

function hay(sku: SkuBriefRef): string {
  return `${sku.id} ${sku.title}`.toLowerCase();
}

function match(h: string, ...needles: string[]): boolean {
  return needles.some((n) => h.includes(n));
}

/** Primary “what is this about?” control — required for nearly every Extra. */
export function contentTopicField(sku: SkuBriefRef): ItemBriefField {
  const h = hay(sku);
  const title = sku.title;

  if (match(h, "course", "module", "lesson", "curriculum", "syllabus")) {
    return f("contentTopic", {
      required: true,
      label: "Course / training topic",
      hint: `What should this ${title.toLowerCase()} cover? Without a topic we cannot build it.`,
      placeholder: "e.g. Responsible service of alcohol for front-of-house",
    });
  }
  if (match(h, "workshop", "seminar", "webinar", "facilitator", "participant")) {
    return f("contentTopic", {
      required: true,
      label: "Session topic",
      hint: "Subject of the session — title alone is not enough",
      placeholder: "e.g. Handling difficult customer conversations",
    });
  }
  if (match(h, "quiz", "assessment", "multiple_choice", "discussion_question")) {
    return f("contentTopic", {
      required: true,
      label: "Subject being assessed",
      hint: "What knowledge or skill should questions test?",
      placeholder: "e.g. Allergen awareness — kitchen staff",
    });
  }
  if (match(h, "training_guide", "training_manual", "study_guide", "revision", "learning_objective", "learning_outcome", "certification", "onboarding_guide", "how_to_instruction", "standard_operating", "process_guide", "cheat_sheet", "reference_guide", "checklist")) {
    return f("contentTopic", {
      required: true,
      label: "Subject / process",
      hint: "What process, skill, or topic is this material for?",
      placeholder: "e.g. Closing checklist for Saturday night service",
    });
  }
  if (match(h, "job_ad", "job_description", "person_specification", "role_profile", "internship", "vacancy", "graduate_programme")) {
    return f("contentTopic", {
      required: true,
      label: "Role / position",
      hint: "Job title and seniority",
      placeholder: "e.g. Part-time barista — weekends",
    });
  }
  if (match(h, "case_study", "case_analysis", "testimonial", "success_stor")) {
    return f("contentTopic", {
      required: true,
      label: "Client / project",
      hint: "Who or what is the proof about? (use a public name you’re allowed to publish)",
      placeholder: "e.g. Acme Café — Instagram growth project",
    });
  }
  if (match(h, "press_release", "media_statement", "announcement", "news_article")) {
    return f("contentTopic", {
      required: true,
      label: "What’s being announced?",
      hint: "The newsworthy fact in one line",
      placeholder: "e.g. New Surry Hills location opens 12 Sep",
    });
  }
  if (match(h, "product_review", "service_review", "book_review")) {
    return f("contentTopic", {
      required: true,
      label: "What are we reviewing?",
      placeholder: "e.g. Our winter tasting menu / Competitor X’s app",
    });
  }
  if (match(h, "interview")) {
    return f("contentTopic", {
      required: true,
      label: "Interview focus",
      hint: "Theme or person the interview centres on",
      placeholder: "e.g. Founder’s story — starting the business",
    });
  }
  if (match(h, "about_page", "homepage", "biography")) {
    return f("contentTopic", {
      required: true,
      label: "Key message / focus",
      hint: "What should readers take away? (brand story, differentiator, proof)",
      placeholder: "e.g. Family-run since 2012 · sourdough baked daily",
    });
  }
  if (match(h, "location_page", "sector_page", "industry_page")) {
    return f("contentTopic", {
      required: true,
      label: "Location / sector focus",
      placeholder: "e.g. Parramatta · commercial plumbing",
    });
  }
  if (match(h, "service_detail", "services_page", "product_page", "product_description", "product_category")) {
    return f("contentTopic", {
      required: true,
      label: "Service or product",
      placeholder: "e.g. Emergency drain clearing · Metro Sydney",
    });
  }
  if (match(h, "landing", "cta_", "conversion")) {
    return f("contentTopic", {
      required: true,
      label: "Offer / page focus",
      placeholder: "e.g. Free 30-minute strategy call for SMEs",
    });
  }
  if (match(h, "ad_", "advertising", "ppc", "search_ad", "meta_ad", "google_ad")) {
    return f("contentTopic", {
      required: true,
      label: "Offer / product being advertised",
      placeholder: "e.g. $89 call-out · same-day hot water",
    });
  }
  if (match(h, "email", "newsletter", "sequence", "drip", "nurture")) {
    return f("contentTopic", {
      required: true,
      label: "Email topic / campaign",
      placeholder: "e.g. Welcome series after mailing-list signup",
    });
  }
  if (match(h, "faq", "help_article", "support", "macro", "knowledge")) {
    return f("contentTopic", {
      required: true,
      label: "Product / issue area",
      placeholder: "e.g. Delivery cut-offs and returns",
    });
  }
  if (match(h, "policy", "privacy", "terms", "compliance", "disclaimer", "legal")) {
    return f("contentTopic", {
      required: true,
      label: "Document / policy name",
      placeholder: "e.g. Cancellation policy · website plain English",
    });
  }
  if (match(h, "event", "invite", "rsvp", "webinar_landing")) {
    return f("contentTopic", {
      required: true,
      label: "Event name & focus",
      placeholder: "e.g. Launch night — 12 Sep, seasonal menu reveal",
    });
  }
  if (match(h, "report", "summary", "analysis", "research")) {
    return f("contentTopic", {
      required: true,
      label: "Report subject / period",
      placeholder: "e.g. July Instagram + Google Business performance",
    });
  }
  if (match(h, "script", "show_notes", "podcast", "video", "reel", "tiktok")) {
    return f("contentTopic", {
      required: true,
      label: "Episode / video topic",
      placeholder: "e.g. Behind-the-scenes Saturday brunch prep",
    });
  }
  if (match(h, "poll", "question") && sku.categoryId === "social") {
    return f("contentTopic", {
      required: true,
      label: "Poll / question topic",
      placeholder: "e.g. Which winter special should we bring back?",
    });
  }
  if (sku.categoryId === "discovery") {
    return f("contentTopic", {
      required: true,
      label: "Service / offer to surface in answers",
      hint: "What should AI and search associate you with?",
      placeholder: "e.g. Group bookings · private dining for 12 · [suburb]",
    });
  }
  if (match(h, "proposal", "pitch", "deck", "one_pager", "leave_behind")) {
    return f("contentTopic", {
      required: true,
      label: "Prospect / opportunity",
      placeholder: "e.g. Law firm — monthly LinkedIn + content package",
    });
  }

  // Default — every remaining Extra still needs a topic
  return f("contentTopic", {
    required: true,
    label: "Topic",
    hint: `What should this ${title.toLowerCase()} be about? The Extra name alone is not enough to create it.`,
    placeholder: `e.g. topic for your ${title.toLowerCase()}`,
  });
}

/**
 * Extra controls inferred from the SKU title/id.
 * Inserted after contentTopic; does not duplicate category fields (cta, print, etc.).
 */
export function itemSpecificExtraFields(sku: SkuBriefRef): ItemBriefField[] {
  const h = hay(sku);
  const out: ItemBriefField[] = [];

  const educationLike = match(
    h,
    "course",
    "module",
    "lesson",
    "workshop",
    "seminar",
    "webinar_outline",
    "training",
    "facilitator",
    "participant",
    "study_guide",
    "revision",
    "learning_",
    "assessment",
    "quiz",
    "certification",
    "lecture",
    "presentation_notes",
  );

  if (educationLike) {
    out.push(
      f("learningLevel", {
        required: true,
        label: "Learner level",
        options: ORDER_LEARNING_LEVEL,
      }),
      f("durationScope", {
        required: true,
        label: "Length / scope",
        options: ORDER_DURATION_SCOPE,
      }),
      f("keyOutcomes", {
        required: match(h, "course", "module", "lesson", "workshop", "learning_outcome", "learning_objective", "outline"),
        label: "Learning outcomes",
        hint: "What should people know or be able to do afterwards? (bullet points fine)",
        placeholder: "e.g. Identify allergens · Escalate correctly · Complete the log",
      }),
    );
  }

  if (match(h, "carousel")) {
    out.push(
      f("partCount", {
        required: true,
        label: "Approx. slides",
        options: ORDER_SLIDE_COUNT,
      }),
    );
  }

  if (match(h, "thread") && !match(h, "email")) {
    out.push(
      f("partCount", {
        required: true,
        label: "Approx. posts in thread",
        options: ORDER_THREAD_COUNT,
      }),
    );
  }

  if (match(h, "sequence", "drip", "nurture", "email_series", "welcome_series")) {
    out.push(
      f("partCount", {
        required: true,
        label: "Number of emails",
        options: ORDER_EMAIL_COUNT,
      }),
    );
  }

  if (match(h, "series", "content_series", "campaign") && sku.categoryId === "social") {
    out.push(
      f("partCount", {
        required: false,
        label: "Approx. posts in series (optional)",
        options: ORDER_SLIDE_COUNT,
      }),
    );
  }

  if (
    match(h, "search_ad", "google_ad", "ppc", "keyword") ||
    (sku.categoryId === "advertising" && match(h, "search"))
  ) {
    out.push(
      f("keywords", {
        required: true,
        label: "Keywords / search phrases",
        hint: "What queries should this ad show for?",
        placeholder: "e.g. emergency plumber [suburb] · blocked drain",
      }),
    );
  }

  if (match(h, "interview", "podcast", "q_and_a", "round_up")) {
    out.push(
      f("guestOrFocus", {
        required: match(h, "interview", "podcast"),
        label: match(h, "podcast") ? "Guest / episode angle" : "People or sources to feature",
        placeholder: "e.g. Chef Priya · local supplier story",
      }),
    );
  }

  if (match(h, "case_study", "case_analysis", "testimonial", "success_stor")) {
    out.push(
      f("keyOutcomes", {
        required: true,
        label: "Results / metrics to include",
        hint: "Numbers you’re allowed to publish",
        placeholder: "e.g. +40% weekend bookings in 8 weeks",
      }),
    );
  }

  if (match(h, "job_ad", "job_description", "internship", "vacancy", "role_profile", "person_specification")) {
    out.push(
      f("roleLocation", {
        required: true,
        label: "Location & work pattern",
        placeholder: "e.g. Surry Hills · Sat–Sun · 8am–3pm",
      }),
      f("keyOutcomes", {
        required: false,
        label: "Must-have skills / requirements (optional)",
        placeholder: "e.g. Latte art · RSA · 1+ year café experience",
      }),
    );
  }

  if (match(h, "landing", "lead_magnet", "squeeze") || sku.categoryId === "landing") {
    if (!match(h, "cta_button", "microcopy")) {
      out.push(
        f("offerName", {
          required: true,
          label: "Primary offer",
          hint: "What do they get if they convert?",
          placeholder: "e.g. Free 30-min call · 20% off first visit",
        }),
      );
    }
  }

  if (sku.categoryId === "reports" || match(h, "monthly_report", "performance_report", "status_report", "progress_report")) {
    out.push(
      f("periodOrScope", {
        required: true,
        label: "Period / scope",
        placeholder: "e.g. July 2026 · Instagram + Google Business",
      }),
    );
  }

  if (match(h, "event") && sku.categoryId === "events") {
    out.push(
      f("eventDetails", {
        required: true,
        label: "When & where",
        placeholder: "e.g. 12 Sep, 6–9pm · Surry Hills · capacity 80",
      }),
    );
  }

  if (match(h, "press_release", "media_statement", "media_kit")) {
    out.push(
      f("announcementDetails", {
        required: true,
        label: "Key facts for media",
        hint: "Date, place, quote source, numbers — wire-ready",
        placeholder: "e.g. Award won 1 Jul · quote from founder · website URL",
      }),
    );
  }

  if (match(h, "proposal", "pitch", "rfp", "tender")) {
    out.push(
      f("offerName", {
        required: true,
        label: "Package / scope being proposed",
        placeholder: "e.g. Monthly content + LinkedIn · $X–$Y",
      }),
    );
  }

  if (match(h, "faq", "help_article", "knowledge_base", "support_macro")) {
    out.push(
      f("keyOutcomes", {
        required: false,
        label: "Questions that must be answered (optional)",
        placeholder: "e.g. Cut-off time? Metro vs regional? How to start a return?",
      }),
    );
  }

  if (match(h, "product_page", "product_description", "release_notes", "changelog")) {
    out.push(
      f("productOrService", {
        required: true,
        label: "Product / version",
        placeholder: "e.g. Booking app v2.4 · new calendar",
      }),
    );
  }

  if (match(h, "policy", "privacy", "terms", "disclaimer") && sku.categoryId === "legal") {
    out.push(
      f("keyOutcomes", {
        required: false,
        label: "Rules that must stay accurate (optional)",
        hint: "We plain-English the wording — you confirm the rules",
        placeholder: "e.g. Cancel 24h before · no refunds on gift cards",
      }),
    );
  }

  if (match(h, "meeting_agenda", "meeting_minutes", "meeting_summary", "action_item")) {
    out.push(
      f("periodOrScope", {
        required: true,
        label: "Meeting / project",
        placeholder: "e.g. Weekly ops — 21 Jul · fit-out project",
      }),
    );
  }

  if (match(h, "how_to", "tutorial", "explainer", "guide") && sku.categoryId === "editorial") {
    out.push(
      f("keyOutcomes", {
        required: true,
        label: "What should the reader be able to do?",
        placeholder: "e.g. Choose a family dentist using 3 criteria",
      }),
    );
  }

  // De-dupe by field id (first wins)
  const seen = new Set<string>();
  return out.filter((field) => {
    if (seen.has(field.id)) return false;
    seen.add(field.id);
    return true;
  });
}

/** Soften fact hints when prices aren’t the main signal. */
export function mustIncludeFactsOverride(
  sku: SkuBriefRef,
): Partial<ItemBriefField> | null {
  const h = hay(sku);
  if (
    match(
      h,
      "course",
      "lesson",
      "workshop",
      "quiz",
      "training",
      "learning",
      "assessment",
      "module",
    )
  ) {
    return {
      hint: "Must-use facts: modules to cover, constraints, branding, or source material",
      placeholder:
        "e.g. 4 modules · no medical claims · use our RSA checklist · 45-minute sessions",
    };
  }
  if (match(h, "job_ad", "job_description", "internship")) {
    return {
      hint: "Pay band, hours, must-haves, benefits — exact wording you approve",
      placeholder: "e.g. $28–32/hr · staff meals · roster 2 weeks ahead",
    };
  }
  if (match(h, "legal", "policy", "privacy", "terms")) {
    return {
      hint: "Rules and obligations that must remain accurate",
      placeholder: "e.g. 24-hour cancel · deposits non-refundable after…",
    };
  }
  return null;
}
