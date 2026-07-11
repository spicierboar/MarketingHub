// Self-test helpers for AI discovery (GEO) — readiness, prompts, scorecard math.

import {
  buildAiDiscoveryPrompts,
  buildAiDiscoveryReport,
  computeMentionRate,
  readinessScoreFromChecks,
} from "@/lib/ai-discovery";
import { stubGbpCompany } from "@/lib/selftest/gbp-audit";
import type { AiDiscoveryObservationRow, CompanyReview } from "@/lib/types";

function stubReview(companyId: string, id: string, rating: number): CompanyReview {
  return {
    id,
    companyId,
    platform: "google",
    authorName: "Tester",
    rating,
    body: "Good service",
    reviewedAt: new Date().toISOString(),
    sentiment: rating >= 4 ? "positive" : "neutral",
    topics: [],
    urgency: "low",
    escalationRequired: false,
    status: "new",
    importedAt: new Date().toISOString(),
  };
}

export async function checkAiDiscoveryPromptPack(): Promise<{ ok: boolean; detail: string }> {
  const company = stubGbpCompany();
  const prompts = buildAiDiscoveryPrompts(company);
  const ok =
    prompts.length >= 4 &&
    prompts.some((p) => /dentist/i.test(p.text)) &&
    prompts.some((p) => /Harbourside/i.test(p.text));
  return {
    ok,
    detail: ok
      ? `${prompts.length} prompts · sample="${prompts[0]?.text}"`
      : `prompt pack weak: ${prompts.map((p) => p.text).join(" | ")}`,
  };
}

export async function checkAiDiscoveryReadinessScore(): Promise<{ ok: boolean; detail: string }> {
  const base = stubGbpCompany();
  const thin = stubGbpCompany({
    profile: {
      ...base.profile,
      website: undefined,
      approvalContact: undefined,
      serviceAreas: [],
      services: [],
      socialLinks: [],
      aiDiscovery: undefined,
    },
  });
  const rich = stubGbpCompany({
    profile: {
      ...base.profile,
      aiDiscovery: {
        directories: {
          bingPlacesClaimed: true,
          yelpListed: true,
          yelpUrl: "https://yelp.example/hvd",
        },
      },
    },
  });

  const thinReport = buildAiDiscoveryReport({ company: thin, faqItemCount: 0, reviews: [] });
  const richReport = buildAiDiscoveryReport({
    company: rich,
    faqItemCount: 3,
    reviews: [
      stubReview(rich.id, "rv1", 5),
      stubReview(rich.id, "rv2", 5),
      stubReview(rich.id, "rv3", 4),
    ],
  });

  const thinScore = readinessScoreFromChecks(thinReport.checks);
  const richScore = readinessScoreFromChecks(richReport.checks);
  const ok = richScore > thinScore && thinReport.disclaimer.includes("do not control");
  return {
    ok,
    detail: ok
      ? `thin=${thinScore} rich=${richScore} · disclaimer ok`
      : `expected rich > thin; got thin=${thinScore} rich=${richScore}`,
  };
}

export async function checkAiDiscoveryMentionRate(): Promise<{ ok: boolean; detail: string }> {
  const rows: AiDiscoveryObservationRow[] = [
    { promptId: "a", platform: "chatgpt", result: "mentioned" },
    { promptId: "a", platform: "gemini", result: "not_mentioned" },
    { promptId: "a", platform: "perplexity", result: "not_run" },
    { promptId: "b", platform: "chatgpt", result: "mentioned" },
  ];
  const { mentionRate, completedCount } = computeMentionRate(rows);
  const ok = completedCount === 3 && mentionRate !== null && Math.abs(mentionRate - 2 / 3) < 0.001;
  return {
    ok,
    detail: ok
      ? `rate=${mentionRate?.toFixed(3)} completed=${completedCount}`
      : `bad math rate=${mentionRate} completed=${completedCount}`,
  };
}
