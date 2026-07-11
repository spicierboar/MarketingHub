// Brand Brain–grounded draft helpers for owned-channel campaigns (email + SMS).
// Thin wrappers over draftContent — never send; human reviews then creates/sends.

import { draftContent } from "@/lib/ai/draft";
import { bodyHasOptOut, smsSegmentCount } from "@/lib/sms";
import { sanitizeAiUserInput } from "@/lib/security-slice";
import type { Company, SourceRef } from "@/lib/types";

export interface ChannelCampaignDraftInput {
  company: Company;
  topic: string;
  objective: string;
  audience?: string;
  offer?: string;
  callToAction?: string;
  notes?: string;
}

export interface EmailCampaignCopyResult {
  name: string;
  subject: string;
  htmlBody: string;
  model: string;
  sources: string[];
  sourceRefs: SourceRef[];
}

export interface SmsCampaignCopyResult {
  name: string;
  body: string;
  model: string;
  sources: string[];
  sourceRefs: SourceRef[];
}

/** Prefer ≤2 GSM segments (~306 chars); leave room for STOP when needed. */
const SMS_MAX_CHARS = 306;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plainToEmailHtml(plain: string): string {
  const trimmed = plain.trim();
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return trimmed
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

function parseEmailDraft(raw: string, fallbackTopic: string): { subject: string; htmlBody: string } {
  const text = raw.trim();
  const subjectMatch = text.match(/^Subject:\s*(.+)$/im);
  let subject = subjectMatch?.[1]?.trim() || fallbackTopic;
  subject = subject.replace(/^["']|["']$/g, "").slice(0, 120);

  let body = text;
  if (subjectMatch) {
    body = text.replace(/^Subject:\s*.+$/im, "").trim();
  }
  // Drop a leading "Body:" label if the model added one.
  body = body.replace(/^Body:\s*/i, "").trim();
  if (!body) {
    body = `<p>Hi {{name}},</p>\n<p>${escapeHtml(fallbackTopic)}</p>\n<p>{{company}}</p>`;
  }
  return { subject, htmlBody: plainToEmailHtml(body) };
}

function enforceSmsLimits(raw: string, promotional: boolean): string {
  let body = raw
    .replace(/^Subject:\s*.+$/im, "")
    .replace(/^SMS:\s*/i, "")
    .replace(/^Message:\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim()
    .replace(/\s+/g, " ");

  if (!body) {
    body = "Hi {{name}} — a note from {{company}}.";
  }

  const optOut = " Reply STOP to opt out.";
  if (promotional && !bodyHasOptOut(body)) {
    const room = SMS_MAX_CHARS - optOut.length;
    body = `${body.slice(0, Math.max(0, room)).trimEnd()}${optOut}`;
  }

  if (body.length > SMS_MAX_CHARS) {
    body = body.slice(0, SMS_MAX_CHARS).trimEnd();
    if (promotional && !bodyHasOptOut(body)) {
      body = `${body.slice(0, SMS_MAX_CHARS - optOut.length).trimEnd()}${optOut}`;
    }
  }

  // If somehow still multi-segment heavy, trim to 2 segments worth.
  while (smsSegmentCount(body) > 2 && body.length > 40) {
    body = body.slice(0, Math.floor(body.length * 0.9)).trimEnd();
    if (promotional && !bodyHasOptOut(body)) {
      body = `${body.slice(0, SMS_MAX_CHARS - optOut.length).trimEnd()}${optOut}`;
    }
  }

  return body;
}

export async function draftEmailCampaignCopy(
  input: ChannelCampaignDraftInput,
): Promise<EmailCampaignCopyResult> {
  const topic = sanitizeAiUserInput(input.topic).text;
  const objective = sanitizeAiUserInput(input.objective).text;
  const draft = await draftContent({
    company: input.company,
    requestType: "email_newsletter",
    topic,
    objective,
    platform: "email",
    audience: input.audience,
    offer: input.offer,
    callToAction: input.callToAction,
    notes: [
      input.notes,
      "Return EXACTLY: first line 'Subject: <subject>', then a blank line, then the email body as simple HTML (<p> tags).",
      "Personalise with {{name}} and {{company}} tokens. Ready for human review — do not imply the email was sent.",
    ]
      .filter(Boolean)
      .join(" "),
  });

  const { subject, htmlBody } = parseEmailDraft(draft.body, topic);
  return {
    name: `AI draft — ${topic}`.slice(0, 80),
    subject,
    htmlBody,
    model: draft.model,
    sources: draft.sources,
    sourceRefs: draft.sourceRefs,
  };
}

export async function draftSmsCampaignCopy(
  input: ChannelCampaignDraftInput & { promotional?: boolean },
): Promise<SmsCampaignCopyResult> {
  const topic = sanitizeAiUserInput(input.topic).text;
  const objective = sanitizeAiUserInput(input.objective).text;
  const promotional = input.promotional !== false;
  const draft = await draftContent({
    company: input.company,
    requestType: "ad_copy",
    topic,
    objective,
    platform: "sms",
    audience: input.audience,
    offer: input.offer,
    callToAction: input.callToAction,
    tone: "short_punchy",
    notes: [
      input.notes,
      "Write ONE SMS message only — no subject line, no preamble.",
      "Keep under 140 characters before the opt-out so the full message fits in 1–2 segments.",
      "Use {{name}} and {{company}} tokens.",
      promotional
        ? 'End with "Reply STOP to opt out."'
        : "Transactional tone; opt-out line optional.",
    ]
      .filter(Boolean)
      .join(" "),
  });

  const body = enforceSmsLimits(draft.body, promotional);
  return {
    name: `AI draft — ${topic}`.slice(0, 80),
    body,
    model: draft.model,
    sources: draft.sources,
    sourceRefs: draft.sourceRefs,
  };
}
