// Scopes list data to what a user is allowed to see — always within the
// user's ACTIVE TENANT (T1). Tenant admins see the whole tenant; members see
// only their assigned companies (mirrors the RLS policies).

import {
  listCompanies,
  listCompanyReviews,
  listContent,
  listConversionFunnels,
  listFunnelAbExperiments,
  listFunnelJourneys,
  listFunnelLandingPages,
  listRequests,
  listReviewRequestCampaigns,
  listSocial,
} from "@/lib/db";
import { accessibleCompanyIds, isAdmin, type ActingUser } from "@/lib/auth/rbac";
import type {
  Company,
  CompanyReview,
  ContentItem,
  ConversionFunnel,
  FunnelAbExperiment,
  FunnelJourney,
  FunnelLandingPage,
  MarketingRequest,
  ReviewRequestCampaign,
  SocialResponseDraft,
} from "@/lib/types";

export async function visibleCompanies(user: ActingUser): Promise<Company[]> {
  const companies = await listCompanies(user.tenantId);
  if (isAdmin(user)) return companies;
  const ids = new Set(await accessibleCompanyIds(user));
  return companies.filter((c) => ids.has(c.id));
}

export async function visibleRequests(user: ActingUser): Promise<MarketingRequest[]> {
  const requests = await listRequests(user.tenantId);
  if (isAdmin(user)) return requests;
  const ids = new Set(await accessibleCompanyIds(user));
  return requests.filter((r) => ids.has(r.companyId));
}

export async function visibleContent(user: ActingUser): Promise<ContentItem[]> {
  const content = await listContent(user.tenantId);
  if (isAdmin(user)) return content;
  const ids = new Set(await accessibleCompanyIds(user));
  return content.filter((c) => ids.has(c.companyId));
}

export async function visibleSocial(user: ActingUser): Promise<SocialResponseDraft[]> {
  const social = await listSocial(user.tenantId);
  if (isAdmin(user)) return social;
  const ids = new Set(await accessibleCompanyIds(user));
  return social.filter((s) => ids.has(s.companyId));
}

export async function visibleReviews(user: ActingUser): Promise<CompanyReview[]> {
  const reviews = await listCompanyReviews(user.tenantId);
  if (isAdmin(user)) return reviews;
  const ids = new Set(await accessibleCompanyIds(user));
  return reviews.filter((r) => ids.has(r.companyId));
}

export async function visibleReviewCampaigns(user: ActingUser): Promise<ReviewRequestCampaign[]> {
  const campaigns = await listReviewRequestCampaigns(user.tenantId);
  if (isAdmin(user)) return campaigns;
  const ids = new Set(await accessibleCompanyIds(user));
  return campaigns.filter((c) => ids.has(c.companyId));
}

export async function visibleFunnelJourneys(user: ActingUser, companyId: string): Promise<FunnelJourney[]> {
  const journeys = await listFunnelJourneys(user.tenantId, companyId);
  if (isAdmin(user)) return journeys;
  const ids = new Set(await accessibleCompanyIds(user));
  return journeys.filter((j) => ids.has(j.companyId));
}

export async function visibleConversionFunnels(user: ActingUser, companyId: string): Promise<ConversionFunnel[]> {
  const funnels = await listConversionFunnels(user.tenantId, companyId);
  if (isAdmin(user)) return funnels;
  const ids = new Set(await accessibleCompanyIds(user));
  return funnels.filter((f) => ids.has(f.companyId));
}

export async function visibleFunnelLandingPages(user: ActingUser, companyId: string): Promise<FunnelLandingPage[]> {
  const pages = await listFunnelLandingPages(user.tenantId, companyId);
  if (isAdmin(user)) return pages;
  const ids = new Set(await accessibleCompanyIds(user));
  return pages.filter((p) => ids.has(p.companyId));
}

export async function visibleFunnelAbExperiments(user: ActingUser, companyId: string): Promise<FunnelAbExperiment[]> {
  const experiments = await listFunnelAbExperiments(user.tenantId, companyId);
  if (isAdmin(user)) return experiments;
  const ids = new Set(await accessibleCompanyIds(user));
  return experiments.filter((e) => ids.has(e.companyId));
}
