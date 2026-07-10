// AI-assisted review analysis + response drafting (Module 7 / Phase 6).

import { AI_MODEL, callClaude } from "@/lib/ai/claude";
import type {
  ApprovedResponse,
  Company,
  ReviewSentiment,
  ReviewUrgency,
} from "@/lib/types";

export interface ReviewAnalysis {
  sentiment: ReviewSentiment;
  topics: string[];
  urgency: ReviewUrgency;
  escalationRequired: boolean;
  reason?: string;
}

const TOPIC_RULES: { test: RegExp; topic: string }[] = [
  { test: /\b(wait|slow|queue|late)\b/i, topic: "wait times" },
  { test: /\b(staff|rude|unhelpful|attitude)\b/i, topic: "staff service" },
  { test: /\b(clean|dirty|hygiene|mess)\b/i, topic: "cleanliness" },
  { test: /\b(price|expensive|value|overcharged)\b/i, topic: "pricing" },
  { test: /\b(food|meal|coffee|breakfast|menu)\b/i, topic: "food quality" },
  { test: /\b(room|bed|noise|check[- ]?in)\b/i, topic: "accommodation" },
  { test: /\b(parking|location|find)\b/i, topic: "location & access" },
  { test: /\b(refund|money back|charge)\b/i, topic: "billing dispute" },
];

function sentimentFromRatingAndText(rating: number, text: string): ReviewSentiment {
  if (rating <= 2 || /\b(terrible|awful|worst|disgrace|scam|never again)\b/i.test(text)) {
    return "negative";
  }
  if (rating >= 4 && /\b(great|love|amazing|excellent|recommend|fantastic)\b/i.test(text)) {
    return "positive";
  }
  if (rating >= 4) return "positive";
  if (rating <= 2) return "negative";
  return "neutral";
}

export function analyzeReview(body: string, rating: number): ReviewAnalysis {
  const topics = TOPIC_RULES.filter((r) => r.test.test(body)).map((r) => r.topic);
  const sentiment = sentimentFromRatingAndText(rating, body);
  const legalThreat = /\b(sue|lawyer|legal|court|accc|ombudsman)\b/i.test(body);
  const safety = /\b(injur|unsafe|danger|hazard|ill)\b/i.test(body);
  const refund = /\b(refund|money back|chargeback)\b/i.test(body);
  const angry = /\b(rude|terrible|awful|worst|disgrace|unacceptable)\b/i.test(body);

  let urgency: ReviewUrgency = "low";
  if (legalThreat || safety) urgency = "critical";
  else if (rating <= 2 && (angry || refund)) urgency = "high";
  else if (rating <= 2 || angry) urgency = "medium";
  else if (rating === 3) urgency = "low";

  const escalationRequired =
    legalThreat || safety || (rating <= 2 && /\b(manager|complaint|report)\b/i.test(body));

  return {
    sentiment,
    topics: topics.length ? topics : sentiment === "positive" ? ["overall experience"] : ["general feedback"],
    urgency,
    escalationRequired,
    reason: escalationRequired
      ? "Auto-escalated: sensitive review requires senior approval before responding."
      : undefined,
  };
}

export async function draftReviewResponse(
  company: Company,
  reviewBody: string,
  rating: number,
  analysis: ReviewAnalysis,
  library: ApprovedResponse[] = [],
): Promise<{ response: string; model: string; libraryRef?: string }> {
  const p = company.profile;
  const libraryMatch =
    library.find((r) => r.category === "review_response" && r.companyId === company.id) ??
    library.find((r) => r.category === "review_response");

  const system = [
    `You draft public review responses for ${company.name}.`,
    `Brand voice: ${p.brandVoice || "warm, professional, concise"}.`,
    "Guardrails: thank the reviewer, stay calm, do NOT admit liability or promise refunds.",
    "For negative reviews acknowledge the experience, invite offline follow-up.",
    "Keep responses under 80 words.",
    libraryMatch ? `Base on this approved template:\n${libraryMatch.responseText}` : "",
    "Return only the response text.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Platform review (${rating}/5 stars, ${analysis.sentiment}, topics: ${analysis.topics.join(", ")}):`,
    `"${reviewBody}"`,
    "Draft a public response.",
  ].join("\n");

  const ai = await callClaude(system, user, 300);
  if (ai) {
    return { response: ai, model: AI_MODEL, libraryRef: libraryMatch?.title };
  }

  if (libraryMatch) {
    return {
      response: libraryMatch.responseText.replace(/\{company\}/g, company.name),
      model: "approved response library",
      libraryRef: libraryMatch.title,
    };
  }

  if (analysis.sentiment === "positive") {
    return {
      response: `Thank you so much for the wonderful review! The whole ${company.name} team truly appreciates your support.`,
      model: "template (no API key)",
    };
  }
  return {
    response: `Thank you for your feedback. We're sorry your experience didn't meet expectations — we'd like to make it right. Please contact ${company.name} directly so our team can follow up personally.`,
    model: "template (no API key)",
  };
}
