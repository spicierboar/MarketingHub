// Review management engine (W3 M33).
import {
  createCompanyReview,
  getCompanyReview,
  listCompanyReviews,
  listIntegrations,
  updateReviewRequestCampaign,
} from "@/lib/db";
import { analyzeReview, draftReviewResponse } from "@/lib/ai/review";
import {
  fetchLiveReviews,
  reviewsConfigured,
  simulateImportReviews,
  type ExternalReview,
} from "@/lib/reviews-connectors";
import type {
  Company,
  CompanyReview,
  ReviewPlatform,
  ReviewRequestCampaign,
  ReviewRequestChannel,
} from "@/lib/types";

export { analyzeReview, draftReviewResponse };

export function computeReputationScore(reviews: CompanyReview[]) {
  if (!reviews.length) return { score: 0, averageRating: 0, totalReviews: 0, responseRate: 0, negativeOpen: 0 };
  const total = reviews.length;
  const avg = reviews.reduce((s, r) => s + r.rating, 0) / total;
  const responded = reviews.filter((r) => r.status === "responded").length;
  const negativeOpen = reviews.filter((r) => r.sentiment === "negative" && r.status !== "responded").length;
  const score = Math.round(Math.max(0, Math.min(100, avg * 20 + (responded / total) * 25 + 15 - Math.min(15, negativeOpen * 5))));
  return { score, averageRating: Math.round(avg * 10) / 10, totalReviews: total, responseRate: responded / total, negativeOpen };
}

async function resolveExternal(company: Company, platform: ReviewPlatform): Promise<ExternalReview[]> {
  if (reviewsConfigured()) {
    const integration = (await listIntegrations(company.tenantId)).find((i) => i.companyId === company.id);
    const live = await fetchLiveReviews(company, platform, integration);
    if (live?.length) return live;
  }
  return simulateImportReviews(company, platform);
}

export async function importReviewsForCompany(company: Company, platform: ReviewPlatform, createdById: string) {
  const existing = await listCompanyReviews(company.tenantId, [company.id]);
  const known = new Set(existing.filter((r) => r.platform === platform).map((r) => r.externalId ?? r.body.slice(0, 40)));
  let imported = 0;
  let skipped = 0;
  for (const ext of await resolveExternal(company, platform)) {
    const key = ext.externalId ?? ext.body.slice(0, 40);
    if (known.has(key)) {
      skipped++;
      continue;
    }
    const analysis = analyzeReview(ext.body, ext.rating);
    await createCompanyReview({
      companyId: company.id,
      platform,
      externalId: ext.externalId,
      authorName: ext.authorName,
      rating: ext.rating,
      body: ext.body,
      reviewedAt: ext.reviewedAt,
      sentiment: analysis.sentiment,
      topics: analysis.topics,
      urgency: analysis.urgency,
      escalationRequired: analysis.escalationRequired,
      status: "new",
      importedAt: new Date().toISOString(),
      createdById,
    });
    known.add(key);
    imported++;
  }
  return { imported, skipped, mode: reviewsConfigured() ? ("live" as const) : ("simulated" as const) };
}

export function defaultCampaignMessage(companyName: string, channel: ReviewRequestCampaign["channel"]) {
  const base = `Thanks for choosing ${companyName}! We'd love your feedback.`;
  if (channel === "sms") return `${base} Review us: {link}`;
  if (channel === "qr") return `Scan to rate your visit at ${companyName}.`;
  return `${base}\n\n{link}`;
}

export async function simulateCampaignDispatch(campaign: ReviewRequestCampaign) {
  if (reviewsConfigured()) return campaign;
  const sent = campaign.sentCount + 12;
  const clicks = campaign.clickCount + Math.floor(sent * 0.18);
  const reviews = campaign.reviewCount + Math.floor(clicks * 0.35);
  return (await updateReviewRequestCampaign(campaign.id, {
    sentCount: sent,
    clickCount: clicks,
    reviewCount: reviews,
    updatedAt: new Date().toISOString(),
  })) ?? { ...campaign, sentCount: sent, clickCount: clicks, reviewCount: reviews };
}