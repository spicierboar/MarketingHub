// AI management summary (Phase 8, §41 "The AI should generate management
// summaries and recommendations"). Claude when configured, deterministic
// template otherwise.

import { AI_MODEL, callClaude } from "@/lib/ai/claude";
import type { AnalyticsReport } from "@/lib/analytics";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-AU")}`;
}

export async function summariseReport(
  report: AnalyticsReport,
  scopeLabel: string,
): Promise<{ text: string; model: string }> {
  const facts = {
    scope: scopeLabel,
    published: report.totals.publishedPosts,
    reach: report.totals.reach,
    engagement: report.totals.engagement,
    clicks: report.totals.clicks,
    leads: report.roi.leads,
    conversionRate: pct(report.roi.conversionRate),
    estRevenue: report.roi.estRevenue,
    aiCost: report.ai.costUsd,
    costPerLead: report.roi.costPerLead,
    topPlatform: report.byPlatform[0]?.label,
    topContent: report.topContent[0]?.title,
    bottomContent: report.bottomContent[0]?.title,
    draftAcceptance: pct(report.ai.acceptanceRate),
    social: report.social.total,
    escalated: report.social.escalated,
    avgApprovalHours: report.timeliness.avgApprovalHours,
  };

  const system = [
    "You are a marketing analytics lead briefing busy small-business owners.",
    "Write a concise management summary (3-5 short paragraphs or bullets) of the performance data below.",
    "Cover what's working, what's underperforming, spend efficiency, and 2-3 concrete recommendations.",
    "Plain English, specific to the numbers, no fluff or invented figures.",
  ].join("\n");
  const ai = await callClaude(system, JSON.stringify(facts, null, 2), 700);
  if (ai) return { text: ai, model: AI_MODEL };

  return { text: templateSummary(report, scopeLabel), model: "template (no API key)" };
}

function templateSummary(report: AnalyticsReport, scope: string): string {
  const { totals, roi, byPlatform, topContent, bottomContent, ai, social, timeliness } = report;
  const lines: string[] = [];
  lines.push(
    `Performance summary — ${scope}. ${totals.publishedPosts} post(s) published, reaching ${totals.reach.toLocaleString("en-AU")} people and driving ${totals.engagement.toLocaleString("en-AU")} engagements, ${totals.clicks.toLocaleString("en-AU")} clicks and ${roi.leads} leads (${pct(roi.conversionRate)} click-to-lead).`,
  );
  lines.push(
    `Estimated marketing-attributed value is ${money(roi.estRevenue)} against ${money(ai.costUsd)} of AI spend${roi.costPerLead !== null ? ` — about ${money(roi.costPerLead)} per lead` : ""}.`,
  );
  if (byPlatform[0]) {
    lines.push(
      `${byPlatform[0].label} is the strongest channel (${byPlatform[0].engagement.toLocaleString("en-AU")} engagements). ${topContent[0] ? `Best performer: "${topContent[0].title}".` : ""} ${bottomContent[0] && bottomContent[0].id !== topContent[0]?.id ? `Weakest: "${bottomContent[0].title}" — consider refreshing or retiring it.` : ""}`,
    );
  }
  lines.push(
    `Governance: ${pct(ai.acceptanceRate)} of AI drafts reached approval, ${pct(ai.editRate)} needed edits${timeliness.avgApprovalHours !== null ? `, averaging ${timeliness.avgApprovalHours.toFixed(1)}h to approve` : ""}. ${social.total} social interaction(s) handled, ${social.escalated} escalated.`,
  );
  const recs: string[] = [];
  if (byPlatform[0]) recs.push(`lean further into ${byPlatform[0].label}`);
  if (bottomContent[0]) recs.push(`rework low-engagement content`);
  if (roi.costPerLead !== null && roi.costPerLead > 40) recs.push(`tighten targeting to lower cost per lead`);
  else recs.push(`scale spend while cost per lead stays low`);
  lines.push(`Recommendations: ${recs.join("; ")}.`);
  return lines.join("\n\n");
}
