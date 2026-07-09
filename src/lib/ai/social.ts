// AI-assisted social response drafting (master prompt §35-40).
// Phase 1 is manual: an operator pastes a customer comment, the system
// classifies sentiment / intent / risk, flags escalation, and drafts a reply.
// A human must always approve before the reply is used — nothing auto-publishes.

import { AI_MODEL, callClaude } from "@/lib/ai/claude";
import type {
  ApprovedResponse,
  Company,
  Intent,
  ResponseCategory,
  RiskLevel,
  Sentiment,
} from "@/lib/types";

export interface Classification {
  sentiment: Sentiment;
  intent: Intent;
  riskLevel: RiskLevel;
  escalationRequired: boolean;
  reason?: string;
}

// Ordered so the highest-risk pattern wins.
const INTENT_RULES: {
  test: RegExp;
  intent: Intent;
  risk: RiskLevel;
  escalate: boolean;
}[] = [
  { test: /\b(sue|lawyer|legal action|court|solicitor|accc|ombudsman|fair trading)\b/i, intent: "legal_threat", risk: "critical", escalate: true },
  { test: /\b(injur|hurt|unsafe|danger|hazard|flooded|damage)\b/i, intent: "safety_concern", risk: "critical", escalate: true },
  { test: /\b(journalist|reporter|media|news|press)\b/i, intent: "media_enquiry", risk: "high", escalate: true },
  { test: /\b(refund|money back|reimburse|charge back|chargeback)\b/i, intent: "refund_request", risk: "high", escalate: true },
  { test: /\b(terrible|awful|worst|disgrace|scam|rip[- ]?off|never again|complaint|complain)\b/i, intent: "complaint", risk: "high", escalate: true },
  { test: /\b(not working|broke|faulty|late|no[- ]show|didn'?t turn up|still waiting)\b/i, intent: "service_issue", risk: "medium", escalate: false },
  // "$" sits outside \b — a word boundary can never precede it after a space.
  { test: /\b(how much|price|cost|quote)\b|\$\d/i, intent: "pricing_enquiry", risk: "low", escalate: false },
  { test: /\b(book|appointment|available|availability|schedule|when can)\b/i, intent: "booking_enquiry", risk: "low", escalate: false },
  { test: /\b(job|hiring|apply|career|vacancy|position)\b/i, intent: "employment_enquiry", risk: "low", escalate: false },
  { test: /\b(thank|thanks|great|amazing|awesome|love|excellent|brilliant|recommend|legend)\b/i, intent: "compliment", risk: "low", escalate: false },
  { test: /\b(buy followers|click here|promo code|crypto|http)\b/i, intent: "spam", risk: "low", escalate: false },
];

function classifySentiment(text: string): Sentiment {
  if (/\b(sue|lawyer|injur|unsafe|danger|accc|ombudsman)\b/i.test(text)) return "urgent";
  if (/\b(discriminat|privacy|misconduct|fraud)\b/i.test(text)) return "sensitive";
  if (/\b(furious|disgrace|worst|scam|angry|unacceptable)\b/i.test(text)) return "angry";
  if (/\b(terrible|awful|bad|complaint|refund|faulty|late|worst|never again)\b/i.test(text)) return "negative";
  if (/\b(buy followers|promo code|crypto|click here)\b/i.test(text)) return "spam";
  if (/\b(thank|great|love|amazing|excellent|recommend|awesome|brilliant)\b/i.test(text)) return "positive";
  return "neutral";
}

export function classify(text: string): Classification {
  for (const rule of INTENT_RULES) {
    if (rule.test.test(text)) {
      return {
        sentiment: classifySentiment(text),
        intent: rule.intent,
        riskLevel: rule.risk,
        escalationRequired: rule.escalate,
        reason: rule.escalate
          ? `Auto-escalated: ${rule.intent.replace(/_/g, " ")} must be reviewed by a senior approver.`
          : undefined,
      };
    }
  }
  return {
    sentiment: classifySentiment(text),
    intent: "general_enquiry",
    riskLevel: "low",
    escalationRequired: false,
  };
}

// Map classified intent to the Approved Response Library category (§39).
const INTENT_TO_CATEGORY: Partial<Record<Intent, ResponseCategory>> = {
  compliment: "compliment_thanks",
  complaint: "complaint_acknowledgement",
  service_issue: "complaint_acknowledgement",
  refund_request: "complaint_acknowledgement",
  pricing_enquiry: "pricing_reply",
  booking_enquiry: "booking_reply",
  legal_threat: "escalation",
  safety_concern: "escalation",
  media_enquiry: "escalation",
};

export async function draftSocialResponse(
  company: Company,
  comment: string,
  cls: Classification,
  library: ApprovedResponse[] = [],
): Promise<{ response: string; model: string; libraryRef?: string }> {
  const p = company.profile;
  const category = INTENT_TO_CATEGORY[cls.intent];
  // Prefer a company-specific library entry over a tenant-wide one.
  const libraryMatch = category
    ? (library.find((r) => r.category === category && r.companyId === company.id) ??
      library.find((r) => r.category === category))
    : undefined;

  const system = [
    `You draft public social media replies for ${company.name}.`,
    `Brand voice: ${p.brandVoice || "warm, professional, concise"}.`,
    "Guardrails: keep it short, calm and practical. Do NOT admit liability, promise refunds,",
    "disclose personal information, argue, or make unsupported claims. For complaints, acknowledge,",
    "apologise for the experience (not fault), and invite the customer to continue privately.",
    library.length
      ? "Base your reply on the closest approved response below; keep its meaning and caution:\n" +
        library
          .slice(0, 6)
          .map((r) => `- [${r.category}] ${r.responseText}`)
          .join("\n")
      : "",
    "Return only the reply text.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = `Customer wrote (${cls.intent.replace(/_/g, " ")}, ${cls.sentiment}):\n"${comment}"\n\nDraft a reply.`;

  const ai = await callClaude(system, user, 400);
  if (ai) {
    return { response: ai, model: AI_MODEL, libraryRef: libraryMatch?.title };
  }

  // Template mode: use the Approved Response Library directly when possible.
  if (libraryMatch) {
    return {
      response: libraryMatch.responseText.replace(/\{company\}/g, company.name),
      model: "approved response library",
      libraryRef: libraryMatch.title,
    };
  }
  return { response: templateResponse(company, cls), model: "template (no API key)" };
}

function templateResponse(company: Company, cls: Classification): string {
  const name = company.name;
  switch (cls.intent) {
    case "compliment":
      return `Thank you so much for the kind words! The whole ${name} team really appreciates it. 🙌`;
    case "complaint":
    case "service_issue":
      return `We're really sorry to hear about your experience and want to make it right. Could you please send us a private message with your details so the ${name} team can look into this straight away?`;
    case "refund_request":
      return `Thanks for reaching out. We'd like to sort this out for you — please send us a private message with your booking details and a member of the ${name} team will follow up.`;
    case "pricing_enquiry":
      return `Great question! Pricing depends on the job, so the best next step is a quick quote. Please send us a message or ${company.profile.callsToAction[0] || "get in touch"} and we'll help.`;
    case "booking_enquiry":
      return `Thanks for getting in touch! We'd love to help — please ${company.profile.callsToAction[0] || "send us a message"} and we'll confirm a time.`;
    case "legal_threat":
    case "safety_concern":
    case "media_enquiry":
      return `Thank you for contacting us. This has been escalated to our team and someone will be in touch directly. Please send us a private message with your contact details.`;
    case "spam":
      return `[No public response recommended — mark as spam.]`;
    default:
      return `Thanks for reaching out to ${name}! Please send us a private message and we'll be happy to help.`;
  }
}
