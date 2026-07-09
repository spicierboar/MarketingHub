// AI Recommendation Engine (Phase 9, §44). Turns the analytics report + Brand
// Brain signals into company-specific, actionable recommendations. Rule-based
// and grounded in real data (not generic AI text), so each recommendation
// points at a concrete next step — a content request, campaign, or task.

import { buildReport } from "@/lib/analytics";
import {
  detectCalendarGap,
  detectPublishingCadence,
  seasonalPromptsForMonth,
} from "@/lib/calendar-intelligence";
import {
  getLocalProfile,
  listContent,
  listOffers,
  listScheduledPosts,
  listServices,
  listSocial,
  liveOffers,
} from "@/lib/db";
import { now } from "@/lib/utils";
import type { Company, Recommendation } from "@/lib/types";

export type RecommendationDraft = Pick<
  Recommendation,
  "companyId" | "type" | "title" | "rationale" | "action"
>;

const COMPLAINT_INTENTS = new Set([
  "complaint",
  "refund_request",
  "service_issue",
  "safety_concern",
]);
const FAQ_INTENTS = new Set(["pricing_enquiry", "booking_enquiry", "general_enquiry"]);

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  return Math.round((Date.parse(iso) - Date.parse(now())) / 86_400_000);
}

const GAP_STOPWORDS = new Set(["and", "the", "for", "with", "your", "our", "&"]);

// A service is "covered" only when EVERY significant token of its name appears
// as a whole word in published text. Whole-word matching avoids "system"
// matching "Solar System Design"; keeping 3-char tokens covers names like "Spa".
function serviceIsCovered(name: string, publishedText: string): boolean {
  const tokens = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !GAP_STOPWORDS.has(w));
  if (tokens.length === 0) return publishedText.includes(name.toLowerCase());
  return tokens.every((w) => new RegExp(`\\b${w}\\b`).test(publishedText));
}

export async function generateForCompany(company: Company): Promise<RecommendationDraft[]> {
  const cid = company.id;
  const report = await buildReport(company.tenantId, [cid]);
  const services = await listServices(cid);
  const social = (await listSocial(company.tenantId)).filter((s) => s.companyId === cid);
  const content = (await listContent(company.tenantId)).filter((c) => c.companyId === cid);
  const local = await getLocalProfile(cid);
  const recs: RecommendationDraft[] = [];
  const base = { companyId: cid };

  // 1. Best platform — double down on the strongest channel.
  const top = report.byPlatform[0];
  if (top && top.posts > 0) {
    recs.push({
      ...base,
      type: "best_platform",
      title: `Double down on ${top.label}`,
      rationale: `${top.label} is ${company.name}'s strongest channel — ${top.engagement.toLocaleString("en-AU")} engagements and ${top.leads} leads across ${top.posts} post(s). Publish more there.`,
      action: {
        kind: "content_request",
        requestType: "social_post",
        topic: `New ${top.label} post`,
        objective: `Build on strong ${top.label} performance for ${company.name}`,
      },
    });
  }

  // 2. Repurpose the top performer.
  const best = report.topContent[0];
  if (best) {
    recs.push({
      ...base,
      type: "top_performer_repurpose",
      title: `Repurpose your best content`,
      rationale: `"${best.title}" is your top performer (${best.engagement.toLocaleString("en-AU")} engagements). Repurpose it into another format to extend its reach.`,
      action: { kind: "repurpose", contentId: best.id, reviewHref: `/content/${best.id}` },
    });
  }

  // 3. Underperformer alert (only meaningful once there's a distinct tail).
  const worst = report.bottomContent[0];
  if (worst && worst.id !== best?.id) {
    recs.push({
      ...base,
      type: "underperformer",
      title: `Refresh an underperformer`,
      rationale: `"${worst.title}" is your lowest-engagement post (${worst.engagement.toLocaleString("en-AU")}). Refresh the angle or retire it.`,
      action: { kind: "review", reviewHref: `/content/${worst.id}` },
    });
  }

  // 4. Content gap — services never covered in published/approved content.
  const publishedText = content
    .filter((c) => ["approved", "scheduled", "published"].includes(c.status))
    .map((c) => `${c.title} ${c.body}`.toLowerCase())
    .join(" ");
  const gaps = services.filter((svc) => !serviceIsCovered(svc.name, publishedText));
  if (gaps.length > 0) {
    const svc = gaps[0];
    recs.push({
      ...base,
      type: "content_gap",
      title: `Content gap: ${svc.name}`,
      rationale: `You haven't published anything about "${svc.name}" yet${gaps.length > 1 ? ` (and ${gaps.length - 1} other service${gaps.length > 2 ? "s" : ""})` : ""}. Introduce it to customers.`,
      action: {
        kind: "content_request",
        requestType: "social_post",
        topic: svc.name,
        objective: `Introduce ${svc.name} to ${company.profile.targetCustomers ?? "local customers"}`,
        serviceFocus: svc.name,
      },
    });
  }

  // 5. Timing — plan around a known local buying trigger.
  const trigger = (local?.buyingTriggers ?? local?.seasonalPatterns ?? "").split(/[.,;]/)[0]?.trim();
  if (trigger) {
    recs.push({
      ...base,
      type: "timing",
      title: `Time content to a local trigger`,
      rationale: `Local intelligence flags "${trigger}" as a demand driver. Schedule content ahead of it.`,
      action: {
        kind: "content_request",
        requestType: "social_post",
        topic: trigger,
        objective: `Capitalise on: ${trigger}`,
      },
    });
  }

  // 6. Offer refresh — expiring soon, or none live at all.
  const live = await liveOffers(cid);
  const expiringSoon = live.find((o) => {
    const d = daysUntil(o.endDate);
    return d !== null && d <= 30 && d >= 0;
  });
  if (expiringSoon) {
    recs.push({
      ...base,
      type: "offer_refresh",
      title: `Offer "${expiringSoon.name}" is ending soon`,
      rationale: `This offer ends ${expiringSoon.endDate} (in ${daysUntil(expiringSoon.endDate)} days). Plan a follow-up offer so promotion doesn't stall.`,
      action: { kind: "review", reviewHref: `/companies/${cid}/offers` },
    });
  } else if (live.length === 0 && (await listOffers(cid)).length === 0) {
    recs.push({
      ...base,
      type: "offer_refresh",
      title: `No live offer running`,
      rationale: `${company.name} has no live approved offer. A time-boxed offer typically lifts click-to-lead conversion.`,
      action: { kind: "review", reviewHref: `/companies/${cid}/offers` },
    });
  }

  // 7. Complaint insight — recurring negative social interactions.
  const complaints = social.filter((s) => COMPLAINT_INTENTS.has(s.intent));
  if (complaints.length >= 1) {
    recs.push({
      ...base,
      type: "complaint_insight",
      title: `Address ${complaints.length} customer complaint(s)`,
      rationale: `${complaints.length} recent social interaction(s) were complaints or service issues. Review the themes and follow up.`,
      action: {
        kind: "task",
        objective: `Review and resolve ${complaints.length} customer complaint(s) for ${company.name}`,
      },
    });
  }

  // 8. FAQ insight — many enquiries of one kind → publish an FAQ.
  const enquiries = social.filter((s) => FAQ_INTENTS.has(s.intent));
  if (enquiries.length >= 2) {
    recs.push({
      ...base,
      type: "faq_insight",
      title: `Publish an FAQ — ${enquiries.length} similar enquiries`,
      rationale: `Customers keep asking similar questions (${enquiries.length} enquiries). A published FAQ will deflect them and improve response time.`,
      action: {
        kind: "content_request",
        requestType: "faq",
        topic: `Customer FAQ`,
        objective: `Answer the most common customer questions for ${company.name}`,
      },
    });
  }

  // 9. Calendar gap — upcoming schedule thinner than weekly cadence target.
  const today = now().slice(0, 10);
  const scheduledPosts = (await listScheduledPosts(company.tenantId)).filter(
    (p) => p.companyId === cid,
  );
  const calGap = detectCalendarGap(scheduledPosts, cid, today);
  if (calGap) {
    const monthKey = today.slice(0, 7);
    const seasonal = seasonalPromptsForMonth(monthKey, [company.profile.industry ?? ""]).slice(0, 1)[0];
    const gapDetail =
      calGap.scheduledCount === 0
        ? `No posts scheduled in the next ${calGap.lookaheadDays} days`
        : `Only ${calGap.scheduledCount} post(s) scheduled in the next ${calGap.lookaheadDays} days (target ≥${calGap.minExpected})`;
    const longest = calGap.gapDays > 0 ? ` Longest empty stretch: ${calGap.gapDays} day(s).` : "";
    recs.push({
      ...base,
      type: "calendar_gap",
      title: `Fill a ${calGap.gapDays}-day calendar gap`,
      rationale: `${gapDetail}.${longest}${seasonal ? ` Tie-in: ${seasonal.title} (${seasonal.prompt.slice(0, 80)}…).` : ""}`,
      action: {
        kind: "content_request",
        requestType: "social_post",
        topic: seasonal?.title ?? "Upcoming week content",
        objective: `Schedule content to close the ${calGap.gapDays}-day gap for ${company.name}`,
      },
    });
  }

  // 10. Publishing cadence — published frequency below target in last 30 days.
  const cadence = detectPublishingCadence(scheduledPosts, cid, today);
  if (cadence) {
    const since =
      cadence.daysSinceLastPublish !== null
        ? ` Last published ${cadence.daysSinceLastPublish} day(s) ago.`
        : " No published posts on record.";
    recs.push({
      ...base,
      type: "publishing_cadence",
      title: `Boost publishing cadence`,
      rationale: `${cadence.publishedCount} post(s) published in the last ${cadence.lookbackDays} days (target ≥${cadence.minExpected} for steady reach).${since}`,
      action: {
        kind: "content_request",
        requestType: "social_post",
        topic: "Regular publishing cadence",
        objective: `Restore weekly publishing rhythm for ${company.name}`,
      },
    });
  }

  // 11. Next campaign — always offer one, grounded in season/focus.
  const focus = local?.seasonalPatterns?.split(/[.,;]/)[0]?.trim() || services[0]?.name || "core services";
  recs.push({
    ...base,
    type: "next_campaign",
    title: `Plan your next campaign`,
    rationale: `Based on your data, a campaign around "${focus}" is a strong next move for ${company.name}.`,
    action: {
      kind: "campaign",
      objective: `Drive demand around ${focus}`,
      audience: company.profile.targetCustomers,
      serviceFocus: services[0]?.name,
    },
  });

  // 12. Stale content — approved/published past its review or expiry date.
  const stale = content.find(
    (c) =>
      ["approved", "published", "scheduled"].includes(c.status) &&
      ((c.reviewDate && c.reviewDate < today) || (c.expiryDate && c.expiryDate < today)),
  );
  if (stale) {
    recs.push({
      ...base,
      type: "stale_content",
      title: `Review stale content`,
      rationale: `"${stale.title}" is past its review/expiry date and may contain outdated claims or offers.`,
      action: { kind: "review", reviewHref: `/content/${stale.id}` },
    });
  }

  return recs;
}
