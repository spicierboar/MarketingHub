"use server";

import { revalidatePath } from "next/cache";
import {
  createReviewRequestCampaign,
  getCompany,
  getCompanyReview,
  getReviewRequestCampaign,
  listIntegrations,
  listResponses,
  logAiRun,
  updateCompanyReview,
  updateReviewRequestCampaign,
} from "@/lib/db";
import { assertCompanyAccess, canAccessCompany, requireUser, isAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { analyzeReview, draftReviewResponse } from "@/lib/ai/review";
import { assertAiBudget } from "@/lib/ai/budget";
import { assertAiRateLimit } from "@/lib/ratelimit";
import { checkCompliance } from "@/lib/ai/compliance";
import { defaultCampaignMessage, importReviewsForCompany, simulateCampaignDispatch } from "@/lib/reviews";
import { publishReviewResponse, reviewsConfigured } from "@/lib/reviews-connectors";
import type { ReviewPlatform, ReviewRequestChannel } from "@/lib/types";

const PLATFORMS: ReviewPlatform[] = ["google", "facebook", "yelp", "tripadvisor"];

export async function importReviewsAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const platform = String(formData.get("platform") || "google") as ReviewPlatform;
  if (!PLATFORMS.includes(platform)) throw new Error("Invalid platform");
  const user = await assertCompanyAccess(companyId);
  const company = (await getCompany(companyId))!;
  const result = await importReviewsForCompany(company, platform, user.id);
  await logAction(user, "reviews.imported", { targetType: "company", targetId: companyId, companyId, detail: `${result.imported} imported` });
  revalidatePath("/reviews");
}

export async function draftReviewResponseAction(formData: FormData) {
  const reviewId = String(formData.get("reviewId") || "");
  const review = await getCompanyReview(reviewId);
  if (!review) throw new Error("Review not found");
  const user = await assertCompanyAccess(review.companyId);
  const company = (await getCompany(review.companyId))!;
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);
  const analysis = analyzeReview(review.body, review.rating);
  const library = await listResponses(user.tenantId, review.companyId);
  const { response, model } = await draftReviewResponse(company, review.body, review.rating, analysis, library);
  const replyCheck = await checkCompliance(response, company);
  await updateCompanyReview(reviewId, { draftResponse: response, sentiment: analysis.sentiment, topics: analysis.topics, urgency: analysis.urgency, escalationRequired: analysis.escalationRequired || !replyCheck.canProceed, status: "drafted" });
  await logAiRun({ tenantId: company.tenantId, companyId: company.id, userId: user.id, kind: "review_response", model, promptSummary: review.body.slice(0, 120), outputChars: response.length, estCostUsd: 0, sourcesUsed: [] });
  revalidatePath("/reviews");
}

export async function publishReviewResponseAction(formData: FormData) {
  const reviewId = String(formData.get("reviewId") || "");
  const review = await getCompanyReview(reviewId);
  if (!review?.draftResponse) throw new Error("Draft a response first");
  const user = await requireUser();
  if (!isAdmin(user) || !(await canAccessCompany(user, review.companyId))) throw new Error("Forbidden");
  const company = await getCompany(review.companyId);
  const integration = company ? (await listIntegrations(company.tenantId)).find((i) => i.companyId === review.companyId) : undefined;
  const result = await publishReviewResponse(review.platform, review.externalId ?? review.id, review.draftResponse, integration);
  if (!result.ok && reviewsConfigured()) throw new Error(result.detail);
  await updateCompanyReview(reviewId, { status: "responded", publishedResponse: review.draftResponse, respondedAt: new Date().toISOString() });
  await logAction(user, "reviews.response_published", { targetType: "review", targetId: reviewId, companyId: review.companyId, detail: result.detail });
  revalidatePath("/reviews");
}

export async function createReviewCampaignAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "");
  const name = String(formData.get("name") || "").trim();
  const channel = String(formData.get("channel") || "email") as ReviewRequestChannel;
  const user = await assertCompanyAccess(companyId);
  const company = (await getCompany(companyId))!;
  if (!name) throw new Error("Campaign name required");
  await createReviewRequestCampaign({ companyId, name, channel, status: "draft", messageTemplate: defaultCampaignMessage(company.name, channel), sentCount: 0, clickCount: 0, reviewCount: 0, createdById: user.id });
  revalidatePath("/reviews");
}

export async function activateReviewCampaignAction(formData: FormData) {
  const campaignId = String(formData.get("campaignId") || "");
  const campaign = await getReviewRequestCampaign(campaignId);
  if (!campaign) throw new Error("Not found");
  const user = await assertCompanyAccess(campaign.companyId);
  if (!isAdmin(user)) throw new Error("Admin only");
  await updateReviewRequestCampaign(campaignId, { status: "active", activatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await simulateCampaignDispatch({ ...campaign, status: "active" });
  revalidatePath("/reviews");
}