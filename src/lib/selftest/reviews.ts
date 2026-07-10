// Self-test helpers for W3 M33 review management.

import { createCompanyReview, createReviewRequestCampaign, listCompanyReviews } from "@/lib/db";
import { analyzeReview } from "@/lib/ai/review";
import { computeReputationScore, importReviewsForCompany, simulateCampaignDispatch } from "@/lib/reviews";
import { reviewsConfigured, simulateImportReviews } from "@/lib/reviews-connectors";
import type { Company } from "@/lib/types";

function stubCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_rev_stub",
    tenantId: "tn_rev_stub",
    name: "Harbour Bistro",
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      industry: "restaurant",
      serviceAreas: ["Harbour"],
      services: ["Dining"],
      callsToAction: ["Book"],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
      targetCustomers: "locals",
    },
    documents: [],
    ...overrides,
  } as Company;
}

export async function checkReviewsSimulatedWhenLiveOff() {
  const simulated = simulateImportReviews(stubCompany(), "google");
  const ok = !reviewsConfigured() && simulated.every((r) => r.source === "simulated");
  return { ok, detail: `count=${simulated.length}` };
}

export async function checkReviewAnalyzeNegativeUrgent() {
  const a = analyzeReview("Terrible service, want refund and manager", 1);
  return { ok: a.sentiment === "negative" && a.urgency !== "low", detail: `${a.sentiment}/${a.urgency}` };
}

export async function checkReputationScoreInRange() {
  const company = stubCompany({ tenantId: "tn_rev_score" });
  const t = new Date().toISOString();
  await createCompanyReview({ companyId: company.id, platform: "google", authorName: "A", rating: 5, body: "Great", reviewedAt: t, sentiment: "positive", topics: ["food"], urgency: "low", escalationRequired: false, status: "responded", importedAt: t, respondedAt: t, createdById: "u" });
  await createCompanyReview({ companyId: company.id, platform: "google", authorName: "B", rating: 2, body: "Bad", reviewedAt: t, sentiment: "negative", topics: ["service"], urgency: "medium", escalationRequired: false, status: "new", importedAt: t, createdById: "u" });
  const s = computeReputationScore(await listCompanyReviews(company.tenantId, [company.id]));
  return { ok: s.score >= 0 && s.score <= 100, detail: `score=${s.score}` };
}

export async function checkReviewImportDedup() {
  const company = stubCompany({ tenantId: "tn_rev_import", id: "co_rev_import" });
  const first = await importReviewsForCompany(company, "yelp", "u");
  const second = await importReviewsForCompany(company, "yelp", "u");
  return { ok: first.imported > 0 && second.imported === 0, detail: `first=${first.imported} second=${second.imported}` };
}

export async function checkReviewCampaignSimulated() {
  const company = stubCompany({ tenantId: "tn_rev_camp", id: "co_rev_camp" });
  const c = await createReviewRequestCampaign({ companyId: company.id, name: "Email nudge", channel: "email", status: "draft", messageTemplate: "Review us", sentCount: 0, clickCount: 0, reviewCount: 0, createdById: "u" });
  const d = await simulateCampaignDispatch({ ...c, status: "active" });
  return { ok: !reviewsConfigured() && d.sentCount > 0, detail: `sent=${d.sentCount}` };
}
