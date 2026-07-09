// Scopes list data to what a user is allowed to see — always within the
// user's ACTIVE TENANT (T1). Tenant admins see the whole tenant; members see
// only their assigned companies (mirrors the RLS policies).

import {
  listCompanies,
  listContent,
  listRequests,
  listSocial,
} from "@/lib/db";
import { accessibleCompanyIds, isAdmin, type ActingUser } from "@/lib/auth/rbac";
import type {
  Company,
  ContentItem,
  MarketingRequest,
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
