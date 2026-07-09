// AI image-brief generator (Phase 11, §46). Produces a structured creative
// brief for a photographer / designer — grounded in the company Brand Brain so
// it respects brand voice, approved claims and prohibited claims, and always
// reminds the team that only rights-cleared, approved assets may be used.
//
// Claude when ANTHROPIC_API_KEY is set; a deterministic template otherwise, so
// it runs with zero external accounts. (Video scripts already live in Studio.)

import { AI_MODEL, callClaude } from "@/lib/ai/claude";
import { getLocalProfile } from "@/lib/db";
import type { BrandTemplate, Company } from "@/lib/types";

export interface ImageBriefInput {
  company: Company;
  topic: string;
  objective: string;
  channel?: string;
  template?: BrandTemplate | null;
}

export interface ImageBriefResult {
  title: string;
  body: string;
  model: string;
}

function brandContext(c: Company): string {
  const p = c.profile;
  return [
    `Company: ${c.name}`,
    p.brandVoice && `Brand voice: ${p.brandVoice}`,
    p.services.length && `Services: ${p.services.join(", ")}`,
    p.serviceAreas.length && `Service areas: ${p.serviceAreas.join(", ")}`,
    p.approvedClaims.length && `Approved claims: ${p.approvedClaims.join("; ")}`,
    p.prohibitedClaims.length &&
      `PROHIBITED claims (never depict/imply): ${p.prohibitedClaims.join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateImageBrief(
  input: ImageBriefInput,
): Promise<ImageBriefResult> {
  const { company, topic, objective, channel, template } = input;
  const title = `Image brief — ${topic}`.slice(0, 120);

  const system = [
    "You are an in-house art director for a group of local businesses.",
    "Write a concise, practical creative brief a photographer or designer can shoot from.",
    "Ground everything in the approved brand information below. Never propose imagery that depicts or implies a prohibited claim.",
    "Always include a Usage rights section reminding the team to use only approved, rights-cleared assets (check consent, licence, expiry and permitted channels before publishing).",
    "Use these exact headed sections: Concept, Shot list, Composition, Style & mood, Must include, Must avoid, Usage rights, Suggested template.",
    "",
    brandContext(company),
    template ? `\nBrand template to follow: ${template.name} (${template.dimensions ?? template.kind}) — ${template.spec ?? template.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Topic / message: ${topic}`,
    `Objective: ${objective}`,
    channel && `Channel: ${channel}`,
  ]
    .filter(Boolean)
    .join("\n");

  const ai = await callClaude(system, user, 800);
  if (ai) return { title, body: ai, model: AI_MODEL };

  return { title, body: await templateBrief(input), model: "template (no API key)" };
}

async function templateBrief(input: ImageBriefInput): Promise<string> {
  const { company, topic, objective, channel, template } = input;
  const p = company.profile;
  const local = await getLocalProfile(company.id);
  const area = p.serviceAreas[0] ?? "the local area";
  const dims = template?.dimensions ?? (channel?.toLowerCase().includes("story") ? "1080x1920" : "1080x1080");

  return [
    `# Image brief: ${topic}`,
    channel ? `Channel: ${channel} · Format: ${dims}` : `Format: ${dims}`,
    "",
    `## Concept`,
    `${objective}. A single, honest hero image that feels genuinely ${company.name} — ${p.brandVoice ?? "warm and local"}.`,
    "",
    `## Shot list`,
    `1. Hero: ${topic} in a real ${company.name} setting (${area}).`,
    `2. Detail: a close-up that supports the message.`,
    `3. Context: a wider frame showing the place / people (rights permitting).`,
    "",
    `## Composition`,
    `Leave clear space for a headline and the logo. Rule-of-thirds; natural light; product/subject sharp and in focus.`,
    "",
    `## Style & mood`,
    `${p.brandVoice ?? "Warm, authentic, unpretentious"}. True-to-life colour — no heavy filters. Local and real over glossy stock.`,
    "",
    `## Must include`,
    `- ${company.name} logo space` +
      (p.approvedClaims[0] ? `\n- Room for an approved claim (e.g. "${p.approvedClaims[0]}")` : "") +
      (local?.suburbs?.length ? `\n- A recognisable ${local.suburbs[0]} feel` : ""),
    "",
    `## Must avoid`,
    (p.prohibitedClaims.length
      ? p.prohibitedClaims.map((c) => `- Any imagery implying "${c}"`).join("\n")
      : "- Anything that overstates or implies an unverifiable claim") +
      `\n- Recognisable customers without a signed release\n- Unlicensed music, logos or third-party imagery`,
    "",
    `## Usage rights`,
    `Only approved, rights-cleared assets may be published. Before use, confirm: owner/licence recorded, consent on file for anyone shown, licence not expired, and the asset's permitted channels include ${channel ?? "the target channel"}. Register the final asset in the Asset Library and route it for creative approval.`,
    "",
    `## Suggested template`,
    template ? `${template.name} — ${template.spec ?? template.description}` : `Use the group "Square social post — Wattle brand" template (or a channel-appropriate brand template).`,
  ].join("\n");
}
