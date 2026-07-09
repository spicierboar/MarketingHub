// Campaign Planner (Phase 4). Generates a full 30/90-day campaign plan grounded
// in the Brand Brain, Service Catalogue, Local Area Profile and a live approved
// offer. Uses Claude when configured (JSON plan, validated before use) and a
// deterministic planner otherwise — so plans always materialise.
//
// Local event campaigns (§48) get an event sequence: announcement → reminder →
// last-chance → day-of → thank-you/recap, positioned around the event date.

import { AI_MODEL, callClaude } from "@/lib/ai/claude";
import { buildBusinessProfileAiContext } from "@/lib/business-profiles";
import { getLocalProfile, listServices } from "@/lib/db";
import type { Company, Offer, RequestType } from "@/lib/types";

export interface CampaignPlanInput {
  company: Company;
  objective: string;
  audience?: string;
  serviceFocus?: string;
  channels: string[];
  durationDays: 30 | 90;
  startDate: string; // ISO date
  offer?: Offer | null;
  eventName?: string;
  eventDate?: string; // ISO date
}

export interface PlannedItem {
  dayOffset: number; // 1-based day within the plan
  channel: string;
  contentType: RequestType;
  title: string;
  brief: string;
}

export interface CampaignPlan {
  keyMessage: string;
  items: PlannedItem[];
  model: string;
}

const VALID_TYPES: RequestType[] = [
  "social_post",
  "campaign",
  "blog_article",
  "email_newsletter",
  "ad_copy",
  "landing_page",
  "creative_request",
];

const DEFAULT_CHANNELS = ["Facebook", "Instagram", "Google Business Profile"];

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000,
  );
}

function clampDay(day: number, duration: number): number {
  return Math.max(1, Math.min(duration, Math.round(day)));
}

// ---- Claude path ------------------------------------------------------------------

async function planContext(input: CampaignPlanInput): Promise<string> {
  const { company } = input;
  const p = company.profile;
  const services = await listServices(company.id);
  const local = await getLocalProfile(company.id);
  return [
    `Company: ${company.name} (${p.industry ?? "—"})`,
    p.brandVoice && `Brand voice: ${p.brandVoice}`,
    p.targetCustomers && `Target customers: ${p.targetCustomers}`,
    services.length &&
      `Services: ${services.map((s) => s.name).join(", ")}`,
    local?.seasonalPatterns && `Seasonal patterns: ${local.seasonalPatterns}`,
    local?.localEvents && `Local events: ${local.localEvents}`,
    input.offer &&
      `Live approved offer (the ONLY offer to promote): ${input.offer.name} — ${input.offer.approvedWording}${input.offer.endDate ? ` (ends ${input.offer.endDate})` : ""}`,
    p.prohibitedClaims.length &&
      `PROHIBITED claims: ${p.prohibitedClaims.join(" | ")}`,
    buildBusinessProfileAiContext(company),
  ]
    .filter(Boolean)
    .join("\n");
}

async function claudePlan(input: CampaignPlanInput): Promise<CampaignPlan | null> {
  const channels = input.channels.length ? input.channels : DEFAULT_CHANNELS;
  const itemCount = input.durationDays === 30 ? 10 : 13;
  const system = [
    "You are a senior marketing campaign planner. Design a content calendar as JSON.",
    "Return ONLY a JSON object, no prose, shaped exactly:",
    `{"keyMessage": string, "items": [{"dayOffset": number (1-${input.durationDays}), "channel": string, "contentType": one of ${VALID_TYPES.join("|")}, "title": string, "brief": string (1-2 sentences on what the piece must say)}]}`,
    `Produce ${itemCount} items spread across the ${input.durationDays} days, using only these channels: ${channels.join(", ")}.`,
    input.eventName && input.eventDate
      ? `This is an EVENT campaign for "${input.eventName}" on ${input.eventDate} (day ${clampDay(daysBetween(input.startDate, input.eventDate) + 1, input.durationDays)} of the plan): include announcement, reminder, last-chance, day-of and thank-you/recap items around that day.`
      : "",
    "",
    await planContext(input),
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Objective: ${input.objective}`,
    input.audience && `Audience: ${input.audience}`,
    input.serviceFocus && `Service focus: ${input.serviceFocus}`,
    `Campaign starts: ${input.startDate}`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callClaude(system, user, 2400);
  if (!raw) return null;
  try {
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const parsed = JSON.parse(cleaned) as {
      keyMessage?: unknown;
      items?: unknown;
    };
    if (typeof parsed.keyMessage !== "string" || !Array.isArray(parsed.items)) {
      return null;
    }
    const items: PlannedItem[] = [];
    for (const it of parsed.items as Record<string, unknown>[]) {
      if (
        typeof it?.dayOffset !== "number" ||
        typeof it?.channel !== "string" ||
        typeof it?.title !== "string" ||
        typeof it?.brief !== "string" ||
        !VALID_TYPES.includes(it?.contentType as RequestType)
      ) {
        return null; // any malformed item → fall back to the deterministic plan
      }
      items.push({
        dayOffset: clampDay(it.dayOffset, input.durationDays),
        channel: it.channel,
        contentType: it.contentType as RequestType,
        title: it.title.slice(0, 140),
        brief: it.brief.slice(0, 500),
      });
    }
    if (items.length === 0) return null;
    items.sort((a, b) => a.dayOffset - b.dayOffset);
    return { keyMessage: parsed.keyMessage.slice(0, 300), items, model: AI_MODEL };
  } catch {
    return null;
  }
}

// ---- Deterministic fallback planner ------------------------------------------------

export async function generateCampaignPlan(
  input: CampaignPlanInput,
): Promise<CampaignPlan> {
  const ai = await claudePlan(input);
  if (ai) return ai;

  const { company, durationDays } = input;
  const p = company.profile;
  const channels = input.channels.length ? input.channels : DEFAULT_CHANNELS;
  const services = await listServices(company.id);
  const local = await getLocalProfile(company.id);
  const focus =
    input.serviceFocus ||
    services[0]?.name ||
    p.services[0] ||
    "our services";
  const cta = p.callsToAction[0] || "Get in touch";
  const ch = (i: number) => channels[i % channels.length];
  const wantsAds = channels.some((c) => /ad/i.test(c));

  const items: PlannedItem[] = [];
  const keyMessage = `${input.objective} — ${focus} for ${input.audience || p.targetCustomers || "local customers"}.`;

  if (input.eventName && input.eventDate) {
    // Event sequence (§48) positioned around the event day. buildCampaign
    // validates the event falls inside the window; sequence items whose
    // natural day lands outside the window or collides are DROPPED, not
    // clamped — clamping produced wrong-day copy ("one week to go" on day 1).
    const eventDay = daysBetween(input.startDate, input.eventDate) + 1;
    const usedDays = new Set<number>();
    const pushEvent = (day: number, item: Omit<PlannedItem, "dayOffset">) => {
      if (day < 1 || day > durationDays || usedDays.has(day)) return;
      usedDays.add(day);
      items.push({ ...item, dayOffset: day });
    };
    pushEvent(1, {
      channel: ch(0),
      contentType: "social_post",
      title: `Announcing: ${input.eventName}`,
      brief: `Announce ${input.eventName} on ${input.eventDate}. Lead with what it means for ${input.audience || "locals"}; CTA: ${cta}.`,
    });
    pushEvent(eventDay - 7, {
      channel: ch(1),
      contentType: "social_post",
      title: `${input.eventName} — one week to go`,
      brief: `Reminder post one week out. Practical details (date, place, how to take part).`,
    });
    pushEvent(eventDay - 2, {
      channel: ch(2),
      contentType: "social_post",
      title: `Last chance: ${input.eventName}`,
      brief: `Urgency post two days out.${input.offer ? ` Tie in the offer: ${input.offer.approvedWording}` : ""}`,
    });
    pushEvent(eventDay, {
      channel: ch(0),
      contentType: "social_post",
      title: `${input.eventName} is on today`,
      brief: `Day-of post with atmosphere and a clear ${cta}.`,
    });
    pushEvent(eventDay + 2, {
      channel: ch(1),
      contentType: "social_post",
      title: `Thank you, ${p.serviceAreas[0] || "everyone"}!`,
      brief: `Post-event recap and thank-you; invite followers to ${cta.toLowerCase()}.`,
    });
  }

  // Core cadence filling the rest of the plan.
  const cadence =
    durationDays === 30
      ? [1, 4, 7, 10, 13, 16, 19, 22, 25, 28]
      : [1, 8, 15, 22, 29, 36, 43, 50, 57, 64, 71, 78, 85];
  const phase = (day: number) =>
    durationDays === 90
      ? day <= 30
        ? "[Awareness] "
        : day <= 60
          ? "[Engagement] "
          : "[Conversion] "
      : "";

  const roles: ((day: number, i: number) => PlannedItem | null)[] = [
    (day, i) => ({
      dayOffset: day,
      channel: ch(i),
      contentType: "social_post",
      title: `Kick-off: ${input.objective}`,
      brief: `${phase(day)}Open the campaign. Introduce the key message: ${keyMessage}`,
    }),
    (day, i) => ({
      dayOffset: day,
      channel: ch(i),
      contentType: "social_post",
      title: `Spotlight: ${focus}`,
      brief: `${phase(day)}Deep-dive on ${focus} — what it is, who it helps, why ${company.name}.`,
    }),
    (day, i) =>
      input.offer
        ? {
            dayOffset: day,
            channel: ch(i),
            contentType: "social_post",
            title: `Offer: ${input.offer.name}`,
            brief: `${phase(day)}Promote the live offer using the approved wording: "${input.offer.approvedWording}"${input.offer.endDate ? ` Mention it ends ${input.offer.endDate}.` : ""}`,
          }
        : null,
    (day, i) => ({
      dayOffset: day,
      channel: ch(i),
      contentType: "social_post",
      title: "Answer the big question",
      brief: `${phase(day)}Educational post answering a common customer question about ${focus}.`,
    }),
    (day, i) =>
      local?.localEvents
        ? {
            dayOffset: day,
            channel: ch(i),
            contentType: "social_post",
            title: "Local tie-in",
            brief: `${phase(day)}Connect the campaign to local life: ${local.localEvents.split(",")[0]}.`,
          }
        : null,
    (day) => ({
      dayOffset: day,
      channel: "Email",
      contentType: "email_newsletter",
      title: `Newsletter: ${input.objective}`,
      brief: `${phase(day)}Mid-campaign email to the customer list carrying the key message${input.offer ? " and the offer" : ""}.`,
    }),
    (day, i) =>
      wantsAds
        ? {
            dayOffset: day,
            channel: channels.find((c) => /ad/i.test(c)) ?? ch(i),
            contentType: "ad_copy",
            title: `Ad: ${focus}`,
            brief: `${phase(day)}Paid ad variant of the key message. NOTE: routes to senior approval.`,
          }
        : null,
    (day, i) => ({
      dayOffset: day,
      channel: ch(i),
      contentType: "social_post",
      title: "Proof & credentials",
      brief: `${phase(day)}Trust post using ONLY approved claims${p.approvedClaims[0] ? ` (e.g. "${p.approvedClaims[0]}")` : ""}.`,
    }),
    (day, i) => ({
      dayOffset: day,
      channel: ch(i),
      contentType: "social_post",
      title: "Reminder & momentum",
      brief: `${phase(day)}Re-state the key message for people who missed it; fresh angle.`,
    }),
    (day, i) => ({
      dayOffset: day,
      channel: ch(i),
      contentType: "social_post",
      title: "Final call / wrap-up",
      brief: `${phase(day)}Close the campaign${input.offer?.endDate ? ` — last days of the offer` : ""}; strong ${cta}.`,
    }),
  ];

  // One pass through the role sequence (no wraparound — a second "Kick-off"
  // mid-plan is worse than a repeated filler). Conditional roles that yield
  // null are skipped without consuming a day; once one-shot roles run out,
  // repeatable fillers rotate. The wrap-up role always takes the LAST day.
  const eventDays = new Set(items.map((i) => i.dayOffset));
  const fillDays = cadence.filter((d) => !eventDays.has(d));
  const lastDay = fillDays[fillDays.length - 1];
  const bodyDays = fillDays.slice(0, -1);
  const wrapUpRole = roles[roles.length - 1];
  const oneShotRoles = roles.slice(0, -1);
  // Repeatable fillers: spotlight, education, reminder (indexes 1, 3, 8).
  const fillerRoles = [roles[1], roles[3], roles[8]];

  let roleIdx = 0;
  let fillerIdx = 0;
  for (const day of bodyDays) {
    let item: PlannedItem | null = null;
    while (roleIdx < oneShotRoles.length && !item) {
      item = oneShotRoles[roleIdx](day, roleIdx);
      roleIdx++;
    }
    if (!item) {
      item = fillerRoles[fillerIdx % fillerRoles.length](day, fillerIdx);
      fillerIdx++;
    }
    if (item) items.push(item);
  }
  if (lastDay !== undefined) {
    const closer = wrapUpRole(lastDay, roleIdx);
    if (closer) items.push(closer);
  }

  items.sort((a, b) => a.dayOffset - b.dayOffset);
  return { keyMessage, items, model: "template (no API key)" };
}
