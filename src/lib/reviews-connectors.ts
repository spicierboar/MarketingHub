// Review-platform connectors — simulated when REVIEWS_LIVE is off.

import { decryptToken } from "@/lib/crypto";
import type { Company, PublishingIntegration, ReviewPlatform } from "@/lib/types";

export function reviewsLive(): boolean {
  return process.env.REVIEWS_LIVE === "true";
}

export function reviewsPlatformConfigured(): boolean {
  const google = !!process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && !!process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const meta = !!process.env.META_APP_ID?.trim() && !!process.env.META_APP_SECRET?.trim();
  return google || meta;
}

export function reviewsConfigured(): boolean {
  return reviewsLive() && !!process.env.PUBLISHING_TOKEN_KEY?.trim() && reviewsPlatformConfigured();
}

export interface ExternalReview {
  externalId: string;
  authorName: string;
  rating: number;
  body: string;
  reviewedAt: string;
  source: "live" | "simulated";
}

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

const SIM: Record<ReviewPlatform, { author: string; rating: number; body: string; daysAgo: number }[]> = {
  google: [
    { author: "Sarah M.", rating: 5, body: "Fantastic service and friendly staff.", daysAgo: 2 },
    { author: "James K.", rating: 2, body: "Waited too long and the order was wrong.", daysAgo: 5 },
  ],
  facebook: [
    { author: "Local Guide", rating: 5, body: "Highly recommend every visit.", daysAgo: 3 },
    { author: "Chris T.", rating: 1, body: "Terrible experience. Staff were rude.", daysAgo: 7 },
  ],
  yelp: [
    { author: "Alex R.", rating: 4, body: "Solid choice in the area.", daysAgo: 4 },
    { author: "Morgan L.", rating: 3, body: "Average visit.", daysAgo: 11 },
  ],
  tripadvisor: [
    { author: "Traveler_882", rating: 5, body: "Exceeded expectations for a short stay.", daysAgo: 6 },
    { author: "WeekendGuest", rating: 2, body: "Noise from the street all night.", daysAgo: 8 },
  ],
};

export function simulateImportReviews(company: Company, platform: ReviewPlatform): ExternalReview[] {
  const seed = hashSeed(`${company.id}:${platform}`);
  return SIM[platform].map((t, i) => {
    const reviewedAt = new Date();
    reviewedAt.setDate(reviewedAt.getDate() - t.daysAgo - (seed % 3));
    return {
      externalId: `sim_${platform}_${company.id.slice(-4)}_${i}`,
      authorName: t.author,
      rating: t.rating,
      body: t.body,
      reviewedAt: reviewedAt.toISOString(),
      source: "simulated" as const,
    };
  });
}

export async function fetchLiveReviews(
  _company: Company,
  _platform: ReviewPlatform,
  integration?: PublishingIntegration,
): Promise<ExternalReview[] | null> {
  if (!reviewsConfigured() || !integration?.encryptedToken) return null;
  try {
    decryptToken(integration.encryptedToken);
  } catch {
    return null;
  }
  return null;
}

export async function publishReviewResponse(
  platform: ReviewPlatform,
  externalId: string,
  responseText: string,
  integration?: PublishingIntegration,
): Promise<{ ok: boolean; detail: string; mode: "live" | "simulated" }> {
  if (!reviewsConfigured() || !integration?.encryptedToken) {
    return { ok: true, detail: `Simulated publish to ${platform} ${externalId}`, mode: "simulated" };
  }
  return { ok: false, detail: "Live review reply adapter pending", mode: "live" };
}
