// Supabase data adapter (production persistence).
//
// Implements every repository operation in ./index.ts against the Supabase
// schema (supabase/migrations), using the generic row<->domain mapper in
// ./mapper.ts. Selected by isSupabaseConfigured(); the in-memory store backs
// the demo when Supabase env is absent.
//
// CLIENT CHOICE (RLS is the isolation boundary):
//   • usr() = request-scoped RLS client → company-scoped DATA (companies,
//     content, requests, campaigns, assets, …). Postgres RLS enforces tenant
//     isolation as the signed-in user; this is the surface the live leak test
//     covers.
//   • svc() = service-role client (BYPASSES RLS) → only where an operation must
//     succeed regardless of the caller's RLS scope: the identity/tenancy layer
//     (tenants, members, users, access), append-only audit, the AI-spend meter
//     (a tenant-wide sum a member's scope would undercount), legal holds (RLS is
//     admin-only, but ANY user must be blocked from editing held content),
//     per-tenant settings singletons, and the no-login client-comment path.
//     These are protected by the app-layer guards (assertCompanyAccess /
//     assertAdminCompanyAccess) + the invariant that the app only ever passes
//     the SESSION tenant id — never an id from the request body.
//
// IDs: the schema uses gen_random_uuid(); creates OMIT id and return the
// generated row. The demo's "t_…"/"c_…" ids never appear in Supabase.
//
// KNOWN LIMITATION (documented): the background scheduler/automation cron runs
// with no auth session, so RLS-scoped (usr) reads/writes return nothing for it.
// Driving the cron under Supabase needs a service-context pass (follow-up).

import { getServerSupabase, getServiceSupabase } from "@/lib/db/supabase";
import { serviceContext } from "@/lib/db/service-context";
import { toDomain, toRow, type Row } from "@/lib/db/mapper";
import type { SupabaseClient } from "@supabase/supabase-js";
import { now } from "@/lib/utils";
import { randomUUID } from "node:crypto";
import type {
  AdAccount, AdBudget, AdCampaign, AdPlatform, AddonId, AudienceSegment,
  AiRun, AiMosOpportunity, CalendarAssistSuggestion, ApprovedClaim, ApprovedResponse, Asset, AuditLog, AutomationRun,
  AutomationSettings, BrandTemplate, Campaign, CampaignItem, Company,
  CompanyAccess, CompanyEntitlement, ConsentRecord, ContentComment, ContentItem, EvidenceRecord,
  KnowledgeDocument, KnowledgeGap, Lead, LegalHold, LocalAreaProfile,   MarketingRequest,
  MenuDesign,
  Offer, OrderMenuItem, OrderingSettings, PhotoShoot, PhotographerProfile, PhotographerPackage, PhotoMarketplaceBooking, PromptTemplate, PublishingControls, PublishingIntegration, PublishLog,
  ConnectInvite,
  ApiKey,
  PartnerWebhook,
  RestaurantOrder,
  Recommendation, RecommendationDismissRecord, RoleTitle, ScheduledPost, ScheduledPostStatus, SecuritySettings, ServiceRecord,
  SocialMention, SocialResponseDraft, CompanyReview, ReviewRequestCampaign, Task, Tenant, TenantMember,
  TermsVersion, TermsAcceptance, User, UtmLink,
  EmailTemplate, EmailSubscriber, EmailCampaign,
  CmsPage, CmsPageVersion, CmsSeoMetadata, CmsUpdateRequest,
  ConversionFunnel, FunnelAbExperiment, FunnelJourney, FunnelLandingPage,
} from "@/lib/types";

// Request-scoped RLS client for company-scoped data — EXCEPT inside a trusted
// system/service context (the session-less cron), where it falls back to the
// service-role client so RLS (which has no auth.uid() for the cron) doesn't block
// it. Repo functions still scope every query by tenant/company id, so isolation
// holds at the app layer. See db/service-context.ts.
async function usr(): Promise<ReturnType<typeof getServiceSupabase>> {
  if (serviceContext()) return getServiceSupabase();
  return getServerSupabase();
}
const svc = getServiceSupabase; // service role (sync)

// companies alone map created_by -> createdBy (everyone else -> createdById).
const COMPANY_ALIAS = { created_by: "createdBy" } as const;

// Company profile always carries the structured onboarding arrays; a bare {}
// (older row) is normalised so the app's profile.* access never faults.
function normaliseCompany(c: Company): Company {
  const p = (c.profile ?? {}) as Partial<Company["profile"]>;
  return {
    ...c,
    profile: {
      ...p,
      serviceAreas: p.serviceAreas ?? [],
      services: p.services ?? [],
      callsToAction: p.callsToAction ?? [],
      prohibitedClaims: p.prohibitedClaims ?? [],
      approvedClaims: p.approvedClaims ?? [],
      requiredDisclaimers: p.requiredDisclaimers ?? [],
    },
    documents: c.documents ?? [],
  };
}

const many = <T>(rows: Row[] | null, ov?: Record<string, string>): T[] =>
  (rows ?? []).map((r) => toDomain<T>(r, ov));

// tenant → its company ids (rows carry company_id; companies carry tenant_id).
async function companyIds(sb: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data } = await sb.from("companies").select("id").eq("tenant_id", tenantId);
  return (data ?? []).map((r) => (r as Row).id as string);
}

export const supabaseRepo = {
  // ============================ Identity & tenancy (svc) ====================
  async listTenants(): Promise<Tenant[]> {
    const sb = svc(); if (!sb) return [];
    const { data } = await sb.from("tenants").select("*").order("name");
    return many<Tenant>(data);
  },
  async getTenant(tenantId: string): Promise<Tenant | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("tenants").select("*").eq("id", tenantId).maybeSingle();
    return data ? toDomain<Tenant>(data) : undefined;
  },
  async createTenant(input: Omit<Tenant, "id" | "createdAt" | "updatedAt">): Promise<Tenant> {
    const sb = svc(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("tenants").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createTenant: " + error.message);
    return toDomain<Tenant>(data);
  },
  async updateTenant(tenantId: string, patch: Partial<Tenant>): Promise<Tenant | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("tenants").update({ ...toRow(patch), updated_at: now() }).eq("id", tenantId).select("*").maybeSingle();
    return data ? toDomain<Tenant>(data) : undefined;
  },
  async getTenantByStripeCustomer(customerId: string): Promise<Tenant | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("tenants").select("*").eq("stripe_customer_id", customerId).maybeSingle();
    return data ? toDomain<Tenant>(data) : undefined;
  },

  // Terms & Conditions — platform-level (svc, like identity/audit). Ids passed
  // in are always session-derived (publisher = platform admin, acceptor = the
  // session user), so svc() never touches a caller-supplied cross-tenant id.
  async listTermsVersions(): Promise<TermsVersion[]> {
    const sb = svc(); if (!sb) return [];
    const { data } = await sb.from("terms_versions").select("*").order("version", { ascending: false });
    return many<TermsVersion>(data);
  },
  async currentTerms(): Promise<TermsVersion | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("terms_versions").select("*").eq("active", true).order("version", { ascending: false }).limit(1).maybeSingle();
    return data ? toDomain<TermsVersion>(data) : undefined;
  },
  async publishTermsVersion(input: Omit<TermsVersion, "id" | "version" | "active" | "publishedAt">): Promise<TermsVersion> {
    const sb = svc(); if (!sb) throw new Error("Supabase not configured");
    const { data: rows } = await sb.from("terms_versions").select("version").order("version", { ascending: false }).limit(1);
    const nextVersion = (rows && rows[0] ? Number((rows[0] as Row).version) : 0) + 1;
    // Insert the new active version FIRST, then supersede the OTHERS — a failed
    // insert must never leave zero active versions (which would disable the gate).
    const { data, error } = await sb.from("terms_versions").insert({ ...toRow(input), version: nextVersion, active: true, published_at: now() }).select("*").single();
    if (error) throw new Error("publishTermsVersion: " + error.message);
    await sb.from("terms_versions").update({ active: false }).eq("active", true).neq("id", (data as Row).id as string);
    return toDomain<TermsVersion>(data);
  },
  async recordTermsAcceptance(input: Omit<TermsAcceptance, "id" | "acceptedAt">): Promise<TermsAcceptance> {
    const sb = svc(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("terms_acceptances").insert({ ...toRow(input), accepted_at: now() }).select("*").single();
    if (error) throw new Error("recordTermsAcceptance: " + error.message);
    return toDomain<TermsAcceptance>(data);
  },
  async hasAcceptedTerms(userId: string, version: number): Promise<boolean> {
    const sb = svc(); if (!sb) return false;
    const { data } = await sb.from("terms_acceptances").select("id").eq("user_id", userId).eq("version", version).limit(1);
    return !!(data && data.length > 0);
  },
  async updateTermsVersion(id: string, patch: Partial<TermsVersion>): Promise<TermsVersion | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("terms_versions").update(toRow(patch)).eq("id", id).select("*").maybeSingle();
    return data ? toDomain<TermsVersion>(data) : undefined;
  },
  async listActiveRecipients(): Promise<{ email: string; name: string }[]> {
    const sb = svc(); if (!sb) return [];
    // Page every select — PostgREST caps unbounded selects at a default row
    // limit (~1000), which would silently drop recipients past that at fleet
    // scale. pageAll() ranges until a short page. (Very large id lists could
    // still bump URL length on .in(); revisit if tenants/users exceed a few k.)
    const pageAll = async (build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<Row[]> => {
      const out: Row[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data } = await build(from, from + PAGE - 1);
        const rows = (data ?? []) as Row[];
        out.push(...rows);
        if (rows.length < PAGE) break;
      }
      return out;
    };
    const tenants = await pageAll((f, t) => sb.from("tenants").select("id").eq("status", "active").range(f, t));
    const tenantIds = tenants.map((t) => t.id as string);
    if (tenantIds.length === 0) return [];
    const members = await pageAll((f, t) => sb.from("tenant_members").select("user_id").in("tenant_id", tenantIds).range(f, t));
    const userIds = [...new Set(members.map((m) => m.user_id as string))];
    if (userIds.length === 0) return [];
    const users = await pageAll((f, t) => sb.from("app_users").select("email,name,active").in("id", userIds).range(f, t));
    const byEmail = new Map<string, { email: string; name: string }>();
    for (const row of users) {
      if (row.active && !byEmail.has(row.email as string)) {
        byEmail.set(row.email as string, { email: row.email as string, name: (row.name as string) ?? "" });
      }
    }
    return [...byEmail.values()];
  },

  async membershipsForUser(userId: string): Promise<TenantMember[]> {
    const sb = svc(); if (!sb) return [];
    const { data } = await sb.from("tenant_members").select("*").eq("user_id", userId);
    return many<TenantMember>(data);
  },
  async getMembership(tenantId: string, userId: string): Promise<TenantMember | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("tenant_members").select("*").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle();
    return data ? toDomain<TenantMember>(data) : undefined;
  },
  async addMembership(input: Omit<TenantMember, "createdAt">): Promise<TenantMember> {
    const sb = svc(); if (!sb) throw new Error("Supabase not configured");
    const existing = await this.getMembership(input.tenantId, input.userId);
    if (existing) return existing;
    const { data, error } = await sb.from("tenant_members").insert(toRow(input)).select("*").single();
    if (error) throw new Error("addMembership: " + error.message);
    return toDomain<TenantMember>(data);
  },
  async listMembers(tenantId: string): Promise<TenantMember[]> {
    const sb = svc(); if (!sb) return [];
    const { data } = await sb.from("tenant_members").select("*").eq("tenant_id", tenantId);
    return many<TenantMember>(data);
  },

  async listUsers(tenantId: string): Promise<User[]> {
    const sb = svc(); if (!sb) return [];
    const { data: m } = await sb.from("tenant_members").select("user_id").eq("tenant_id", tenantId);
    const ids = (m ?? []).map((r) => (r as Row).user_id as string);
    if (ids.length === 0) return [];
    const { data } = await sb.from("app_users").select("*").in("id", ids).order("name");
    return many<User>(data);
  },
  async getUser(userId: string): Promise<User | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("app_users").select("*").eq("id", userId).maybeSingle();
    return data ? toDomain<User>(data) : undefined;
  },
  async getUserByEmail(email: string): Promise<User | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("app_users").select("*").ilike("email", email.trim()).maybeSingle();
    return data ? toDomain<User>(data) : undefined;
  },
  // Provisions the Supabase Auth identity so the app_users FK holds. Login
  // delivery (magic link) needs SMTP/Resend — batched; without it the user
  // exists and can be added to a tenant but can't yet sign in.
  async createUser(input: { email: string; name: string; role: User["role"] }): Promise<User> {
    const sb = svc(); if (!sb) throw new Error("Supabase not configured");
    const { data: au, error } = await sb.auth.admin.createUser({
      email: input.email.trim(), email_confirm: true,
    });
    if (error || !au?.user) throw new Error("createUser (auth): " + (error?.message ?? "no user"));
    const { data, error: e2 } = await sb.from("app_users")
      .insert({ id: au.user.id, email: input.email.trim(), name: input.name.trim(), active: true })
      .select("*").single();
    if (e2) throw new Error("createUser (app_users): " + e2.message);
    return toDomain<User>(data);
  },
  async setUserActive(userId: string, active: boolean): Promise<void> {
    const sb = svc(); if (!sb) return;
    await sb.from("app_users").update({ active }).eq("id", userId);
  },
  async setMemberRoleTitle(tenantId: string, userId: string, roleTitle: RoleTitle): Promise<void> {
    const sb = svc(); if (!sb) return;
    const m = await this.getMembership(tenantId, userId);
    if (!m) return;
    const { ROLE_TITLE_TIER } = await import("@/lib/types");
    const patch: Row = { role_title: roleTitle };
    if (m.role !== "owner") patch.role = ROLE_TITLE_TIER[roleTitle] === "user" ? "member" : "admin";
    await sb.from("tenant_members").update(patch).eq("tenant_id", tenantId).eq("user_id", userId);
  },

  async accessForUser(userId: string): Promise<CompanyAccess[]> {
    const sb = svc(); if (!sb) return [];
    const { data } = await sb.from("company_access").select("*").eq("user_id", userId);
    return many<CompanyAccess>(data);
  },
  async usersForCompany(companyId: string): Promise<User[]> {
    const sb = svc(); if (!sb) return [];
    const { data: a } = await sb.from("company_access").select("user_id").eq("company_id", companyId);
    const ids = (a ?? []).map((r) => (r as Row).user_id as string);
    if (ids.length === 0) return [];
    const { data } = await sb.from("app_users").select("*").in("id", ids);
    return many<User>(data);
  },
  async grantAccess(userId: string, companyId: string): Promise<void> {
    const sb = svc(); if (!sb) return;
    await sb.from("company_access").upsert({ user_id: userId, company_id: companyId }, { onConflict: "user_id,company_id" });
  },
  async revokeAccess(userId: string, companyId: string): Promise<void> {
    const sb = svc(); if (!sb) return;
    await sb.from("company_access").delete().eq("user_id", userId).eq("company_id", companyId);
  },

  // ============================ Companies (RLS) ============================
  async listCompanies(tenantId: string): Promise<Company[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("companies").select("*").eq("tenant_id", tenantId).order("name");
    return many<Company>(data, COMPANY_ALIAS).map(normaliseCompany);
  },
  async getCompany(companyId: string): Promise<Company | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("companies").select("*").eq("id", companyId).maybeSingle();
    return data ? normaliseCompany(toDomain<Company>(data, COMPANY_ALIAS)) : undefined;
  },
  async createCompany(input: { tenantId: string; name: string; createdBy: string }): Promise<Company> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("companies").insert({
      tenant_id: input.tenantId, name: input.name.trim(), status: "draft_onboarding",
      created_by: input.createdBy,
      profile: { serviceAreas: [], services: [], callsToAction: [], prohibitedClaims: [], approvedClaims: [], requiredDisclaimers: [] },
      documents: [],
    }).select("*").single();
    if (error) throw new Error("createCompany: " + error.message);
    return normaliseCompany(toDomain<Company>(data, COMPANY_ALIAS));
  },
  async updateCompany(companyId: string, patch: Partial<Company>): Promise<Company | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("companies").update({ ...toRow(patch), updated_at: now() }).eq("id", companyId).select("*").maybeSingle();
    return data ? normaliseCompany(toDomain<Company>(data, COMPANY_ALIAS)) : undefined;
  },

  // ============================ Requests (RLS) ============================
  async listRequests(tenantId: string): Promise<MarketingRequest[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("marketing_requests").select("*").in("company_id", await companyIds(sb, tenantId)).order("created_at", { ascending: false });
    return many<MarketingRequest>(data);
  },
  async getRequest(reqId: string): Promise<MarketingRequest | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("marketing_requests").select("*").eq("id", reqId).maybeSingle();
    return data ? toDomain<MarketingRequest>(data) : undefined;
  },
  async createRequest(input: Omit<MarketingRequest, "id" | "status" | "statusHistory" | "createdAt" | "updatedAt">): Promise<MarketingRequest> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const t = now();
    const { data, error } = await sb.from("marketing_requests").insert({
      ...toRow(input), status: "submitted",
      status_history: [{ status: "submitted", at: t, byId: input.requesterId }],
    }).select("*").single();
    if (error) throw new Error("createRequest: " + error.message);
    return toDomain<MarketingRequest>(data);
  },
  async advanceRequest(reqId: string, status: MarketingRequest["status"], byId: string, note?: string): Promise<MarketingRequest | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const current = await this.getRequest(reqId);
    if (!current) return undefined;
    const at = now();
    const history = [...current.statusHistory, { status, at, byId, note }];
    const { data } = await sb.from("marketing_requests").update({ status, status_history: history, updated_at: at }).eq("id", reqId).select("*").maybeSingle();
    return data ? toDomain<MarketingRequest>(data) : undefined;
  },

  // ============================ Content (RLS) ============================
  async listContent(tenantId: string): Promise<ContentItem[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("content_items").select("*").in("company_id", await companyIds(sb, tenantId)).order("created_at", { ascending: false });
    return many<ContentItem>(data);
  },
  async getContent(contentId: string): Promise<ContentItem | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("content_items").select("*").eq("id", contentId).maybeSingle();
    return data ? toDomain<ContentItem>(data) : undefined;
  },
  async createContent(input: Omit<ContentItem, "id" | "createdAt" | "updatedAt" | "versions">): Promise<ContentItem> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("content_items").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createContent: " + error.message);
    return toDomain<ContentItem>(data);
  },
  async updateContent(contentId: string, patch: Partial<ContentItem>): Promise<ContentItem | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("content_items").update({ ...toRow(patch), updated_at: now() }).eq("id", contentId).select("*").maybeSingle();
    return data ? toDomain<ContentItem>(data) : undefined;
  },

  // ============================ Social responses (RLS) ====================
  async listSocial(tenantId: string): Promise<SocialResponseDraft[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("social_responses").select("*").in("company_id", await companyIds(sb, tenantId)).order("created_at", { ascending: false });
    return many<SocialResponseDraft>(data);
  },
  async getSocial(socialId: string): Promise<SocialResponseDraft | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("social_responses").select("*").eq("id", socialId).maybeSingle();
    return data ? toDomain<SocialResponseDraft>(data) : undefined;
  },
  async createSocial(input: Omit<SocialResponseDraft, "id" | "createdAt">): Promise<SocialResponseDraft> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("social_responses").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createSocial: " + error.message);
    return toDomain<SocialResponseDraft>(data);
  },
  async updateSocial(socialId: string, patch: Partial<SocialResponseDraft>): Promise<SocialResponseDraft | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("social_responses").update(toRow(patch)).eq("id", socialId).select("*").maybeSingle();
    return data ? toDomain<SocialResponseDraft>(data) : undefined;
  },

  // ============================ Comments (svc: public path) ===============
  async listContentComments(contentId: string): Promise<ContentComment[]> {
    const sb = svc(); if (!sb) return [];
    const { data } = await sb.from("content_comments").select("*").eq("content_id", contentId).order("created_at");
    return many<ContentComment>(data);
  },
  async addContentComment(input: Omit<ContentComment, "id" | "createdAt">): Promise<ContentComment> {
    const sb = svc(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("content_comments").insert(toRow(input)).select("*").single();
    if (error) throw new Error("addContentComment: " + error.message);
    return toDomain<ContentComment>(data);
  },

  // ============================ Social inbox mentions (RLS) ===============
  async listSocialMentions(tenantId: string, status?: SocialMention["status"]): Promise<SocialMention[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("social_mentions").select("*").in("company_id", await companyIds(sb, tenantId));
    if (status) q = q.eq("status", status);
    const { data } = await q.order("received_at", { ascending: false });
    return many<SocialMention>(data);
  },
  async getSocialMention(mentionId: string): Promise<SocialMention | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("social_mentions").select("*").eq("id", mentionId).maybeSingle();
    return data ? toDomain<SocialMention>(data) : undefined;
  },
  async createSocialMention(input: Omit<SocialMention, "id" | "createdAt">): Promise<SocialMention> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    if (input.externalId) {
      const { data: dup } = await sb.from("social_mentions").select("*")
        .eq("company_id", input.companyId).eq("platform", input.platform).eq("external_id", input.externalId).maybeSingle();
      if (dup) return toDomain<SocialMention>(dup);
    }
    const { data, error } = await sb.from("social_mentions").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createSocialMention: " + error.message);
    return toDomain<SocialMention>(data);
  },
  async updateSocialMention(mentionId: string, patch: Partial<SocialMention>): Promise<SocialMention | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("social_mentions").update(toRow(patch)).eq("id", mentionId).select("*").maybeSingle();
    return data ? toDomain<SocialMention>(data) : undefined;
  },

  async listCompanyReviews(tenantId: string, companyIdsFilter?: string[], status?: CompanyReview["status"]): Promise<CompanyReview[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("company_reviews").select("*").in("company_id", companyIdsFilter ?? await companyIds(sb, tenantId));
    if (status) q = q.eq("status", status);
    const { data } = await q.order("reviewed_at", { ascending: false });
    return many<CompanyReview>(data);
  },
  async getCompanyReview(reviewId: string): Promise<CompanyReview | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("company_reviews").select("*").eq("id", reviewId).maybeSingle();
    return data ? toDomain<CompanyReview>(data) : undefined;
  },
  async createCompanyReview(input: Omit<CompanyReview, "id">): Promise<CompanyReview> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("company_reviews").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createCompanyReview: " + error.message);
    return toDomain<CompanyReview>(data);
  },
  async updateCompanyReview(reviewId: string, patch: Partial<CompanyReview>): Promise<CompanyReview | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("company_reviews").update(toRow(patch)).eq("id", reviewId).select("*").maybeSingle();
    return data ? toDomain<CompanyReview>(data) : undefined;
  },
  async listReviewRequestCampaigns(tenantId: string, companyIdsFilter?: string[]): Promise<ReviewRequestCampaign[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("review_request_campaigns").select("*")
      .in("company_id", companyIdsFilter ?? await companyIds(sb, tenantId)).order("created_at", { ascending: false });
    return many<ReviewRequestCampaign>(data);
  },
  async getReviewRequestCampaign(campaignId: string): Promise<ReviewRequestCampaign | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("review_request_campaigns").select("*").eq("id", campaignId).maybeSingle();
    return data ? toDomain<ReviewRequestCampaign>(data) : undefined;
  },
  async createReviewRequestCampaign(input: Omit<ReviewRequestCampaign, "id" | "createdAt" | "updatedAt">): Promise<ReviewRequestCampaign> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("review_request_campaigns").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createReviewRequestCampaign: " + error.message);
    return toDomain<ReviewRequestCampaign>(data);
  },
  async updateReviewRequestCampaign(campaignId: string, patch: Partial<ReviewRequestCampaign>): Promise<ReviewRequestCampaign | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("review_request_campaigns").update(toRow(patch)).eq("id", campaignId).select("*").maybeSingle();
    return data ? toDomain<ReviewRequestCampaign>(data) : undefined;
  },

  // ============================ Website CMS (RLS) ============================
  async listCmsPages(tenantId: string, companyId?: string): Promise<CmsPage[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("cms_pages").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("updated_at", { ascending: false });
    return many<CmsPage>(data);
  },
  async getCmsPage(pageId: string): Promise<CmsPage | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("cms_pages").select("*").eq("id", pageId).maybeSingle();
    return data ? toDomain<CmsPage>(data) : undefined;
  },
  async createCmsPage(input: Omit<CmsPage, "id" | "createdAt" | "updatedAt">): Promise<CmsPage> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("cms_pages").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createCmsPage: " + error.message);
    return toDomain<CmsPage>(data);
  },
  async updateCmsPage(pageId: string, patch: Partial<CmsPage>): Promise<CmsPage | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("cms_pages").update({ ...toRow(patch), updated_at: now() }).eq("id", pageId).select("*").maybeSingle();
    return data ? toDomain<CmsPage>(data) : undefined;
  },
  async listCmsPageVersions(tenantId: string, pageId: string): Promise<CmsPageVersion[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb
      .from("cms_page_versions")
      .select("*")
      .eq("page_id", pageId)
      .in("company_id", await companyIds(sb, tenantId))
      .order("version_number", { ascending: false });
    return many<CmsPageVersion>(data);
  },
  async listCmsPageVersionsForPage(pageId: string): Promise<CmsPageVersion[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("cms_page_versions").select("*").eq("page_id", pageId).order("version_number", { ascending: false });
    return many<CmsPageVersion>(data);
  },
  async getCmsPageVersion(versionId: string): Promise<CmsPageVersion | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("cms_page_versions").select("*").eq("id", versionId).maybeSingle();
    return data ? toDomain<CmsPageVersion>(data) : undefined;
  },
  async createCmsPageVersion(input: Omit<CmsPageVersion, "id" | "createdAt">): Promise<CmsPageVersion> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("cms_page_versions").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createCmsPageVersion: " + error.message);
    return toDomain<CmsPageVersion>(data);
  },
  async updateCmsPageVersion(versionId: string, patch: Partial<CmsPageVersion>): Promise<CmsPageVersion | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("cms_page_versions").update(toRow(patch)).eq("id", versionId).select("*").maybeSingle();
    return data ? toDomain<CmsPageVersion>(data) : undefined;
  },
  async getCmsSeoMetadata(pageId: string): Promise<CmsSeoMetadata | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("cms_seo_metadata").select("*").eq("page_id", pageId).maybeSingle();
    return data ? toDomain<CmsSeoMetadata>(data) : undefined;
  },
  async upsertCmsSeoMetadata(
    pageId: string,
    companyId: string,
    input: Omit<CmsSeoMetadata, "id" | "pageId" | "companyId" | "createdAt" | "updatedAt">,
  ): Promise<CmsSeoMetadata> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const existing = await this.getCmsSeoMetadata(pageId);
    if (existing) {
      const { data, error } = await sb
        .from("cms_seo_metadata")
        .update({ ...toRow(input), updated_at: now() })
        .eq("page_id", pageId)
        .select("*")
        .single();
      if (error) throw new Error("upsertCmsSeoMetadata: " + error.message);
      return toDomain<CmsSeoMetadata>(data);
    }
    const { data, error } = await sb
      .from("cms_seo_metadata")
      .insert(toRow({ ...input, pageId, companyId }))
      .select("*")
      .single();
    if (error) throw new Error("upsertCmsSeoMetadata: " + error.message);
    return toDomain<CmsSeoMetadata>(data);
  },
  async listCmsUpdateRequests(tenantId: string, companyId?: string): Promise<CmsUpdateRequest[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("cms_update_requests").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("created_at", { ascending: false });
    return many<CmsUpdateRequest>(data);
  },
  async getCmsUpdateRequest(requestId: string): Promise<CmsUpdateRequest | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("cms_update_requests").select("*").eq("id", requestId).maybeSingle();
    return data ? toDomain<CmsUpdateRequest>(data) : undefined;
  },
  async createCmsUpdateRequest(input: Omit<CmsUpdateRequest, "id" | "createdAt" | "updatedAt">): Promise<CmsUpdateRequest> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("cms_update_requests").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createCmsUpdateRequest: " + error.message);
    return toDomain<CmsUpdateRequest>(data);
  },
  async updateCmsUpdateRequest(requestId: string, patch: Partial<CmsUpdateRequest>): Promise<CmsUpdateRequest | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("cms_update_requests").update({ ...toRow(patch), updated_at: now() }).eq("id", requestId).select("*").maybeSingle();
    return data ? toDomain<CmsUpdateRequest>(data) : undefined;
  },

  async listFunnelJourneys(tenantId: string, companyId?: string): Promise<FunnelJourney[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("funnel_journeys").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("updated_at", { ascending: false });
    return many<FunnelJourney>(data);
  },
  async getFunnelJourney(journeyId: string): Promise<FunnelJourney | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("funnel_journeys").select("*").eq("id", journeyId).maybeSingle();
    return data ? toDomain<FunnelJourney>(data) : undefined;
  },
  async createFunnelJourney(input: Omit<FunnelJourney, "id" | "createdAt" | "updatedAt">): Promise<FunnelJourney> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("funnel_journeys").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createFunnelJourney: " + error.message);
    return toDomain<FunnelJourney>(data);
  },
  async updateFunnelJourney(journeyId: string, patch: Partial<FunnelJourney>): Promise<FunnelJourney | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("funnel_journeys").update(toRow({ ...patch, updatedAt: now() })).eq("id", journeyId).select("*").maybeSingle();
    return data ? toDomain<FunnelJourney>(data) : undefined;
  },
  async listConversionFunnels(tenantId: string, companyId?: string): Promise<ConversionFunnel[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("conversion_funnels").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("updated_at", { ascending: false });
    return many<ConversionFunnel>(data);
  },
  async getConversionFunnel(funnelId: string): Promise<ConversionFunnel | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("conversion_funnels").select("*").eq("id", funnelId).maybeSingle();
    return data ? toDomain<ConversionFunnel>(data) : undefined;
  },
  async createConversionFunnel(input: Omit<ConversionFunnel, "id" | "createdAt" | "updatedAt">): Promise<ConversionFunnel> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("conversion_funnels").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createConversionFunnel: " + error.message);
    return toDomain<ConversionFunnel>(data);
  },
  async updateConversionFunnel(funnelId: string, patch: Partial<ConversionFunnel>): Promise<ConversionFunnel | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("conversion_funnels").update(toRow({ ...patch, updatedAt: now() })).eq("id", funnelId).select("*").maybeSingle();
    return data ? toDomain<ConversionFunnel>(data) : undefined;
  },
  async listFunnelLandingPages(tenantId: string, companyId?: string): Promise<FunnelLandingPage[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("funnel_landing_pages").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("updated_at", { ascending: false });
    return many<FunnelLandingPage>(data);
  },
  async getFunnelLandingPage(pageId: string): Promise<FunnelLandingPage | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("funnel_landing_pages").select("*").eq("id", pageId).maybeSingle();
    return data ? toDomain<FunnelLandingPage>(data) : undefined;
  },
  async createFunnelLandingPage(input: Omit<FunnelLandingPage, "id" | "createdAt" | "updatedAt">): Promise<FunnelLandingPage> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("funnel_landing_pages").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createFunnelLandingPage: " + error.message);
    return toDomain<FunnelLandingPage>(data);
  },
  async updateFunnelLandingPage(pageId: string, patch: Partial<FunnelLandingPage>): Promise<FunnelLandingPage | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("funnel_landing_pages").update(toRow({ ...patch, updatedAt: now() })).eq("id", pageId).select("*").maybeSingle();
    return data ? toDomain<FunnelLandingPage>(data) : undefined;
  },
  async listFunnelAbExperiments(tenantId: string, companyId?: string): Promise<FunnelAbExperiment[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("funnel_ab_experiments").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("updated_at", { ascending: false });
    return many<FunnelAbExperiment>(data);
  },
  async getFunnelAbExperiment(experimentId: string): Promise<FunnelAbExperiment | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("funnel_ab_experiments").select("*").eq("id", experimentId).maybeSingle();
    return data ? toDomain<FunnelAbExperiment>(data) : undefined;
  },
  async createFunnelAbExperiment(input: Omit<FunnelAbExperiment, "id" | "createdAt" | "updatedAt">): Promise<FunnelAbExperiment> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("funnel_ab_experiments").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createFunnelAbExperiment: " + error.message);
    return toDomain<FunnelAbExperiment>(data);
  },
  async updateFunnelAbExperiment(experimentId: string, patch: Partial<FunnelAbExperiment>): Promise<FunnelAbExperiment | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("funnel_ab_experiments").update(toRow({ ...patch, updatedAt: now() })).eq("id", experimentId).select("*").maybeSingle();
    return data ? toDomain<FunnelAbExperiment>(data) : undefined;
  },

  // ============================ Brand Brain (RLS) ==========================
  async listKnowledgeDocs(companyId: string, includeArchived = false, includeDrafts = false): Promise<KnowledgeDocument[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("knowledge_documents").select("*").eq("company_id", companyId);
    if (!includeArchived && !includeDrafts) {
      q = q.eq("status", "approved");
    } else if (!includeArchived && includeDrafts) {
      q = q.in("status", ["draft", "approved"]);
    }
    const { data } = await q.order("updated_at", { ascending: false });
    return many<KnowledgeDocument>(data);
  },
  async getKnowledgeDoc(docId: string): Promise<KnowledgeDocument | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("knowledge_documents").select("*").eq("id", docId).maybeSingle();
    return data ? toDomain<KnowledgeDocument>(data) : undefined;
  },
  async createKnowledgeDoc(input: Omit<KnowledgeDocument, "id" | "version" | "previousVersions" | "status" | "createdAt" | "updatedAt">, status: KnowledgeDocument["status"] = "approved"): Promise<KnowledgeDocument> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("knowledge_documents").insert({ ...toRow(input), status, version: 1, previous_versions: [] }).select("*").single();
    if (error) throw new Error("createKnowledgeDoc: " + error.message);
    return toDomain<KnowledgeDocument>(data);
  },
  async reviseKnowledgeDoc(docId: string, patch: { title: string; content: string }, byId: string): Promise<KnowledgeDocument | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const doc = await this.getKnowledgeDoc(docId);
    if (!doc) return undefined;
    const previousVersions = [...doc.previousVersions, { title: doc.title, content: doc.content, version: doc.version, replacedAt: now(), byId }];
    const { data } = await sb.from("knowledge_documents").update({
      title: patch.title, content: patch.content, version: doc.version + 1, previous_versions: previousVersions, updated_at: now(),
    }).eq("id", docId).select("*").maybeSingle();
    return data ? toDomain<KnowledgeDocument>(data) : undefined;
  },
  async setKnowledgeDocStatus(docId: string, status: KnowledgeDocument["status"]): Promise<void> {
    const sb = await usr(); if (!sb) return;
    await sb.from("knowledge_documents").update({ status, updated_at: now() }).eq("id", docId);
  },

  async listServices(companyId: string, activeOnly = true): Promise<ServiceRecord[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("services").select("*").eq("company_id", companyId);
    if (activeOnly) q = q.eq("active", true);
    const { data } = await q.order("name");
    return many<ServiceRecord>(data);
  },
  async getService(serviceId: string): Promise<ServiceRecord | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("services").select("*").eq("id", serviceId).maybeSingle();
    return data ? toDomain<ServiceRecord>(data) : undefined;
  },
  async createService(input: Omit<ServiceRecord, "id" | "createdAt" | "updatedAt">): Promise<ServiceRecord> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("services").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createService: " + error.message);
    return toDomain<ServiceRecord>(data);
  },
  async updateService(serviceId: string, patch: Partial<ServiceRecord>): Promise<ServiceRecord | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("services").update({ ...toRow(patch), updated_at: now() }).eq("id", serviceId).select("*").maybeSingle();
    return data ? toDomain<ServiceRecord>(data) : undefined;
  },

  async getLocalProfile(companyId: string): Promise<LocalAreaProfile | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("local_area_profiles").select("*").eq("company_id", companyId).maybeSingle();
    return data ? toDomain<LocalAreaProfile>(data) : undefined;
  },
  async upsertLocalProfile(profile: Omit<LocalAreaProfile, "updatedAt">): Promise<LocalAreaProfile> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("local_area_profiles").upsert({ ...toRow(profile), updated_at: now() }, { onConflict: "company_id" }).select("*").single();
    if (error) throw new Error("upsertLocalProfile: " + error.message);
    return toDomain<LocalAreaProfile>(data);
  },

  async listGaps(filter: { companyId?: string; requestId?: string; openOnly?: boolean }): Promise<KnowledgeGap[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("knowledge_gaps").select("*");
    if (filter.companyId) q = q.eq("company_id", filter.companyId);
    if (filter.requestId) q = q.eq("request_id", filter.requestId);
    if (filter.openOnly) q = q.eq("status", "open");
    const { data } = await q.order("created_at", { ascending: false });
    return many<KnowledgeGap>(data);
  },
  async getGap(gapId: string): Promise<KnowledgeGap | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("knowledge_gaps").select("*").eq("id", gapId).maybeSingle();
    return data ? toDomain<KnowledgeGap>(data) : undefined;
  },
  async createGap(input: Omit<KnowledgeGap, "id" | "status" | "createdAt">): Promise<KnowledgeGap> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("knowledge_gaps").insert({ ...toRow(input), status: "open" }).select("*").single();
    if (error) throw new Error("createGap: " + error.message);
    return toDomain<KnowledgeGap>(data);
  },
  async answerGap(gapId: string, answer: string, byId: string): Promise<KnowledgeGap | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("knowledge_gaps").update({ status: "answered", answer, answered_by: byId, answered_at: now() }).eq("id", gapId).select("*").maybeSingle();
    return data ? toDomain<KnowledgeGap>(data) : undefined;
  },

  async listConsents(companyId: string): Promise<ConsentRecord[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("consents").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
    return many<ConsentRecord>(data);
  },
  async getConsent(consentId: string): Promise<ConsentRecord | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("consents").select("*").eq("id", consentId).maybeSingle();
    return data ? toDomain<ConsentRecord>(data) : undefined;
  },
  async createConsent(input: Omit<ConsentRecord, "id" | "createdAt">): Promise<ConsentRecord> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("consents").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createConsent: " + error.message);
    return toDomain<ConsentRecord>(data);
  },
  async withdrawConsent(consentId: string): Promise<void> {
    const sb = await usr(); if (!sb) return;
    await sb.from("consents").update({ withdrawn: true }).eq("id", consentId);
  },

  async listEvidence(companyId: string): Promise<EvidenceRecord[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("evidence").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
    return many<EvidenceRecord>(data);
  },
  async createEvidence(input: Omit<EvidenceRecord, "id" | "createdAt">): Promise<EvidenceRecord> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("evidence").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createEvidence: " + error.message);
    return toDomain<EvidenceRecord>(data);
  },

  async listClaims(companyId: string, activeOnly = true): Promise<ApprovedClaim[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("approved_claims").select("*").eq("company_id", companyId);
    if (activeOnly) q = q.eq("active", true);
    const { data } = await q.order("claim_text");
    return many<ApprovedClaim>(data);
  },
  async createClaim(input: Omit<ApprovedClaim, "id" | "createdAt">): Promise<ApprovedClaim> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("approved_claims").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createClaim: " + error.message);
    return toDomain<ApprovedClaim>(data);
  },
  async setClaimActive(claimId: string, active: boolean): Promise<void> {
    const sb = await usr(); if (!sb) return;
    await sb.from("approved_claims").update({ active }).eq("id", claimId);
  },
  async getClaim(claimId: string): Promise<ApprovedClaim | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("approved_claims").select("*").eq("id", claimId).maybeSingle();
    return data ? toDomain<ApprovedClaim>(data) : undefined;
  },

  // Approved responses: platform library (tenant_id null) + tenant-wide + company.
  async listResponses(tenantId: string, companyId?: string, activeOnly = true): Promise<ApprovedResponse[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("approved_responses").select("*").or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    if (activeOnly) q = q.eq("active", true);
    if (companyId) q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
    const { data } = await q.order("category");
    return many<ApprovedResponse>(data);
  },
  async createResponse(input: Omit<ApprovedResponse, "id" | "createdAt">): Promise<ApprovedResponse> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("approved_responses").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createResponse: " + error.message);
    return toDomain<ApprovedResponse>(data);
  },
  async setResponseActive(responseId: string, active: boolean): Promise<void> {
    const sb = await usr(); if (!sb) return;
    await sb.from("approved_responses").update({ active }).eq("id", responseId);
  },
  async getResponse(responseId: string): Promise<ApprovedResponse | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("approved_responses").select("*").eq("id", responseId).maybeSingle();
    return data ? toDomain<ApprovedResponse>(data) : undefined;
  },

  // ============================ Campaigns + offers (RLS) ===================
  async listCampaigns(tenantId: string): Promise<Campaign[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("campaigns").select("*").in("company_id", await companyIds(sb, tenantId)).order("created_at", { ascending: false });
    return many<Campaign>(data);
  },
  async getCampaign(campaignId: string): Promise<Campaign | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("campaigns").select("*").eq("id", campaignId).maybeSingle();
    return data ? toDomain<Campaign>(data) : undefined;
  },
  async createCampaign(input: Omit<Campaign, "id" | "createdAt" | "updatedAt">): Promise<Campaign> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("campaigns").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createCampaign: " + error.message);
    return toDomain<Campaign>(data);
  },
  async updateCampaign(campaignId: string, patch: Partial<Campaign>): Promise<Campaign | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("campaigns").update({ ...toRow(patch), updated_at: now() }).eq("id", campaignId).select("*").maybeSingle();
    return data ? toDomain<Campaign>(data) : undefined;
  },
  async listCampaignItems(campaignId: string): Promise<CampaignItem[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("campaign_items").select("*").eq("campaign_id", campaignId).order("day_offset");
    return many<CampaignItem>(data);
  },
  async getCampaignItem(itemId: string): Promise<CampaignItem | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("campaign_items").select("*").eq("id", itemId).maybeSingle();
    return data ? toDomain<CampaignItem>(data) : undefined;
  },
  async createCampaignItem(input: Omit<CampaignItem, "id" | "createdAt" | "updatedAt">): Promise<CampaignItem> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("campaign_items").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createCampaignItem: " + error.message);
    return toDomain<CampaignItem>(data);
  },
  async updateCampaignItem(itemId: string, patch: Partial<CampaignItem>): Promise<CampaignItem | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("campaign_items").update({ ...toRow(patch), updated_at: now() }).eq("id", itemId).select("*").maybeSingle();
    return data ? toDomain<CampaignItem>(data) : undefined;
  },

  async listOffers(companyId: string): Promise<Offer[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("offers").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
    return many<Offer>(data);
  },
  async getOffer(offerId: string): Promise<Offer | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("offers").select("*").eq("id", offerId).maybeSingle();
    return data ? toDomain<Offer>(data) : undefined;
  },
  async createOffer(input: Omit<Offer, "id" | "createdAt" | "updatedAt">): Promise<Offer> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("offers").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createOffer: " + error.message);
    return toDomain<Offer>(data);
  },
  async updateOffer(offerId: string, patch: Partial<Offer>): Promise<Offer | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("offers").update({ ...toRow(patch), updated_at: now() }).eq("id", offerId).select("*").maybeSingle();
    return data ? toDomain<Offer>(data) : undefined;
  },

  // ============================ Scheduled posts (RLS) ======================
  async listScheduledPosts(tenantId: string): Promise<ScheduledPost[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("scheduled_posts").select("*").in("company_id", await companyIds(sb, tenantId)).order("scheduled_date");
    return many<ScheduledPost>(data);
  },
  async getScheduledPost(postId: string): Promise<ScheduledPost | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("scheduled_posts").select("*").eq("id", postId).maybeSingle();
    return data ? toDomain<ScheduledPost>(data) : undefined;
  },
  async createScheduledPost(input: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">): Promise<ScheduledPost> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("scheduled_posts").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createScheduledPost: " + error.message);
    return toDomain<ScheduledPost>(data);
  },
  async updateScheduledPost(postId: string, patch: Partial<ScheduledPost>): Promise<ScheduledPost | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const row = toRow(patch);
    if (!patch.updatedAt) row.updated_at = now();
    const { data } = await sb.from("scheduled_posts").update(row).eq("id", postId).select("*").maybeSingle();
    return data ? toDomain<ScheduledPost>(data) : undefined;
  },
  async activeSchedulesForContent(contentId: string): Promise<ScheduledPost[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("scheduled_posts").select("*").eq("content_id", contentId).in("status", ["scheduled", "publishing"]);
    return many<ScheduledPost>(data);
  },
  async cancellableSchedulesForContent(contentId: string): Promise<ScheduledPost[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("scheduled_posts").select("*").eq("content_id", contentId).in("status", ["scheduled", "failed", "dead"]);
    return many<ScheduledPost>(data);
  },
  // Atomic conditional status transition (publish-queue claim / recover / dead-
  // letter / requeue). The UPDATE's own WHERE guards make it race-safe: two
  // workers can both try to claim, but Postgres applies one row update — the
  // loser matches zero rows and gets null back. QUEUE-CRITICAL: a backend
  // error THROWS (null strictly means "guard didn't match") — conflating the
  // two would make a transient outage read as a lost claim.
  async transitionScheduledPost(
    tenantId: string,
    postId: string,
    opts: { from: ScheduledPostStatus[]; to: ScheduledPostStatus; updatedBefore?: string },
  ): Promise<ScheduledPost | null> {
    const sb = await usr(); if (!sb) return null;
    let q = sb.from("scheduled_posts")
      .update({ status: opts.to, updated_at: now() })
      .eq("id", postId)
      .in("status", opts.from)
      .in("company_id", await companyIds(sb, tenantId));
    if (opts.updatedBefore) q = q.lt("updated_at", opts.updatedBefore);
    const { data, error } = await q.select("*").maybeSingle();
    if (error) throw new Error("transitionScheduledPost: " + error.message);
    return data ? toDomain<ScheduledPost>(data) : null;
  },

  // ============================ Publishing (RLS) ===========================
  async listIntegrations(tenantId: string, companyId?: string): Promise<PublishingIntegration[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("publishing_integrations").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("platform");
    return many<PublishingIntegration>(data);
  },
  async getIntegration(integrationId: string): Promise<PublishingIntegration | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("publishing_integrations").select("*").eq("id", integrationId).maybeSingle();
    return data ? toDomain<PublishingIntegration>(data) : undefined;
  },
  async findConnectedIntegration(companyId: string, platform: string): Promise<PublishingIntegration | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("publishing_integrations").select("*").eq("company_id", companyId).eq("status", "connected").ilike("platform", platform).maybeSingle();
    return data ? toDomain<PublishingIntegration>(data) : undefined;
  },
  async createIntegration(input: Omit<PublishingIntegration, "id" | "connectedAt" | "updatedAt">): Promise<PublishingIntegration> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("publishing_integrations").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createIntegration: " + error.message);
    return toDomain<PublishingIntegration>(data);
  },
  async updateIntegration(integrationId: string, patch: Partial<PublishingIntegration>): Promise<PublishingIntegration | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("publishing_integrations").update({ ...toRow(patch), updated_at: now() }).eq("id", integrationId).select("*").maybeSingle();
    return data ? toDomain<PublishingIntegration>(data) : undefined;
  },

  // ============================ Connect invites (RLS + svc token lookup) =====
  async listConnectInvites(tenantId: string, companyId?: string): Promise<ConnectInvite[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("connect_invites").select("*").eq("tenant_id", tenantId);
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("created_at", { ascending: false });
    return many<ConnectInvite>(data);
  },
  async getConnectInvite(inviteId: string): Promise<ConnectInvite | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("connect_invites").select("*").eq("id", inviteId).maybeSingle();
    return data ? toDomain<ConnectInvite>(data) : undefined;
  },
  // Public /connect/[token] — token is the secret; service role only.
  async getConnectInviteByToken(token: string): Promise<ConnectInvite | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("connect_invites").select("*").eq("token", token).maybeSingle();
    return data ? toDomain<ConnectInvite>(data) : undefined;
  },
  async createConnectInvite(input: Omit<ConnectInvite, "id" | "createdAt" | "updatedAt">): Promise<ConnectInvite> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("connect_invites").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createConnectInvite: " + error.message);
    return toDomain<ConnectInvite>(data);
  },
  async updateConnectInvite(inviteId: string, patch: Partial<ConnectInvite>): Promise<ConnectInvite | undefined> {
    const sb = await usr(); if (!sb) {
      const sbs = svc();
      if (!sbs) return undefined;
      const { data } = await sbs.from("connect_invites").update({ ...toRow(patch), updated_at: now() }).eq("id", inviteId).select("*").maybeSingle();
      return data ? toDomain<ConnectInvite>(data) : undefined;
    }
    const { data } = await sb.from("connect_invites").update({ ...toRow(patch), updated_at: now() }).eq("id", inviteId).select("*").maybeSingle();
    return data ? toDomain<ConnectInvite>(data) : undefined;
  },

  async listApiKeys(tenantId: string): Promise<ApiKey[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("api_keys").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    return many<ApiKey>(data);
  },
  async getApiKey(keyId: string): Promise<ApiKey | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("api_keys").select("*").eq("id", keyId).maybeSingle();
    return data ? toDomain<ApiKey>(data) : undefined;
  },
  async getApiKeyByPrefix(prefix: string): Promise<ApiKey | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("api_keys").select("*").eq("key_prefix", prefix).maybeSingle();
    return data ? toDomain<ApiKey>(data) : undefined;
  },
  async createApiKey(input: Omit<ApiKey, "id" | "createdAt" | "updatedAt">): Promise<ApiKey> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("api_keys").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createApiKey: " + error.message);
    return toDomain<ApiKey>(data);
  },
  async updateApiKey(keyId: string, patch: Partial<ApiKey>): Promise<ApiKey | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("api_keys").update({ ...toRow(patch), updated_at: now() }).eq("id", keyId).select("*").maybeSingle();
    return data ? toDomain<ApiKey>(data) : undefined;
  },
  async listPartnerWebhooks(tenantId: string): Promise<PartnerWebhook[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("partner_webhooks").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    return many<PartnerWebhook>(data);
  },
  async getPartnerWebhook(webhookId: string): Promise<PartnerWebhook | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("partner_webhooks").select("*").eq("id", webhookId).maybeSingle();
    return data ? toDomain<PartnerWebhook>(data) : undefined;
  },
  async createPartnerWebhook(input: Omit<PartnerWebhook, "id" | "createdAt" | "updatedAt">): Promise<PartnerWebhook> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("partner_webhooks").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createPartnerWebhook: " + error.message);
    return toDomain<PartnerWebhook>(data);
  },
  async updatePartnerWebhook(webhookId: string, patch: Partial<PartnerWebhook>): Promise<PartnerWebhook | undefined> {
    const sb = await usr(); if (!sb) {
      const sbs = svc(); if (!sbs) return undefined;
      const { data } = await sbs.from("partner_webhooks").update({ ...toRow(patch), updated_at: now() }).eq("id", webhookId).select("*").maybeSingle();
      return data ? toDomain<PartnerWebhook>(data) : undefined;
    }
    const { data } = await sb.from("partner_webhooks").update({ ...toRow(patch), updated_at: now() }).eq("id", webhookId).select("*").maybeSingle();
    return data ? toDomain<PartnerWebhook>(data) : undefined;
  },

  async appendPublishLog(input: Omit<PublishLog, "id" | "createdAt">): Promise<PublishLog> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("publish_logs").insert(toRow(input)).select("*").single();
    if (error) throw new Error("appendPublishLog: " + error.message);
    return toDomain<PublishLog>(data);
  },
  async listPublishLogs(tenantId: string): Promise<PublishLog[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("publish_logs").select("*").in("company_id", await companyIds(sb, tenantId)).order("created_at", { ascending: false });
    return many<PublishLog>(data);
  },
  // QUEUE-CRITICAL reads: attempts/backoff and ceiling usage are DERIVED from
  // these. A transient error must THROW (the tick skips safely and retries
  // next run) — a silent [] would zero the attempt count and blow ceilings.
  async listPublishLogsForPosts(tenantId: string, postIds: string[]): Promise<PublishLog[]> {
    const sb = await usr(); if (!sb || postIds.length === 0) return [];
    const { data, error } = await sb.from("publish_logs").select("*").in("scheduled_post_id", postIds).in("company_id", await companyIds(sb, tenantId)).order("created_at", { ascending: false });
    if (error) throw new Error("listPublishLogsForPosts: " + error.message);
    return many<PublishLog>(data);
  },
  async listPublishLogsSince(tenantId: string, sinceIso: string): Promise<PublishLog[]> {
    const sb = await usr(); if (!sb) return [];
    const { data, error } = await sb.from("publish_logs").select("*").gte("created_at", sinceIso).in("company_id", await companyIds(sb, tenantId)).order("created_at", { ascending: false });
    if (error) throw new Error("listPublishLogsSince: " + error.message);
    return many<PublishLog>(data);
  },

  // ============================ Per-tenant singletons (svc) ================
  async getPublishingControls(tenantId: string): Promise<PublishingControls> {
    const def: PublishingControls = { tenantId, freezeAll: false, automatedPublishingDisabled: false, socialRepliesDisabled: false, frozenCompanyIds: [], frozenPlatforms: [], frozenCampaignIds: [] };
    const sb = svc(); if (!sb) return def;
    const { data } = await sb.from("publishing_controls").select("*").eq("tenant_id", tenantId).maybeSingle();
    return data ? toDomain<PublishingControls>(data) : def;
  },
  async updatePublishingControls(tenantId: string, patch: Partial<Omit<PublishingControls, "tenantId">>): Promise<PublishingControls> {
    const sb = svc(); if (!sb) return this.getPublishingControls(tenantId);
    const current = await this.getPublishingControls(tenantId);
    const { data } = await sb.from("publishing_controls").upsert({ ...toRow(current), ...toRow(patch), tenant_id: tenantId }, { onConflict: "tenant_id" }).select("*").single();
    return data ? toDomain<PublishingControls>(data) : { ...current, ...patch };
  },
  async getSecuritySettings(tenantId: string): Promise<SecuritySettings> {
    const def: SecuritySettings = { tenantId, crisisMode: false, sandboxMode: false, retentionDays: 730, aiMonthlyCapUsd: 50, updatedAt: now() };
    const sb = svc(); if (!sb) return def;
    const { data } = await sb.from("security_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
    return data ? toDomain<SecuritySettings>(data) : def;
  },
  async updateSecuritySettings(tenantId: string, patch: Partial<Omit<SecuritySettings, "tenantId">>): Promise<SecuritySettings> {
    const sb = svc(); if (!sb) return this.getSecuritySettings(tenantId);
    const current = await this.getSecuritySettings(tenantId);
    const { data } = await sb.from("security_settings").upsert({ ...toRow(current), ...toRow(patch), tenant_id: tenantId, updated_at: now() }, { onConflict: "tenant_id" }).select("*").single();
    return data ? toDomain<SecuritySettings>(data) : { ...current, ...patch, updatedAt: now() };
  },
  async getAutomationSettings(tenantId: string): Promise<AutomationSettings> {
    const def: AutomationSettings = { tenantId, enabled: false, draftCampaignSuggestions: true, monthlyContentGeneration: true, analyticsSummaries: true, contentAlerts: true, lowRiskAutoResponses: false, maxCampaignsPerRun: 2, maxDraftsPerCompany: 2, updatedAt: now() };
    const sb = svc(); if (!sb) return def;
    const { data } = await sb.from("automation_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
    return data ? toDomain<AutomationSettings>(data) : def;
  },
  async updateAutomationSettings(tenantId: string, patch: Partial<Omit<AutomationSettings, "tenantId">>): Promise<AutomationSettings> {
    const sb = svc(); if (!sb) return this.getAutomationSettings(tenantId);
    const current = await this.getAutomationSettings(tenantId);
    const { data } = await sb.from("automation_settings").upsert({ ...toRow(current), ...toRow(patch), tenant_id: tenantId, updated_at: now() }, { onConflict: "tenant_id" }).select("*").single();
    return data ? toDomain<AutomationSettings>(data) : { ...current, ...patch, updatedAt: now() };
  },
  async appendAutomationRun(input: Omit<AutomationRun, "id" | "createdAt">): Promise<AutomationRun> {
    const sb = svc(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("automation_runs").insert(toRow(input)).select("*").single();
    if (error) throw new Error("appendAutomationRun: " + error.message);
    return toDomain<AutomationRun>(data);
  },
  async listAutomationRuns(tenantId: string): Promise<AutomationRun[]> {
    const sb = svc(); if (!sb) return [];
    const { data } = await sb.from("automation_runs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    return many<AutomationRun>(data);
  },

  // ============================ Legal holds (svc — see header) =============
  async listLegalHolds(tenantId: string, activeOnly = false): Promise<LegalHold[]> {
    const sb = svc(); if (!sb) return [];
    let q = sb.from("legal_holds").select("*").eq("tenant_id", tenantId);
    if (activeOnly) q = q.eq("active", true);
    const { data } = await q.order("applied_at", { ascending: false });
    return many<LegalHold>(data);
  },
  async getLegalHold(holdId: string): Promise<LegalHold | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("legal_holds").select("*").eq("id", holdId).maybeSingle();
    return data ? toDomain<LegalHold>(data) : undefined;
  },
  async createLegalHold(input: Omit<LegalHold, "id" | "appliedAt" | "active">): Promise<LegalHold> {
    const sb = svc(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("legal_holds").insert({ ...toRow(input), active: true }).select("*").single();
    if (error) throw new Error("createLegalHold: " + error.message);
    return toDomain<LegalHold>(data);
  },
  async releaseLegalHold(holdId: string, byId: string): Promise<void> {
    const sb = svc(); if (!sb) return;
    await sb.from("legal_holds").update({ active: false, released_by: byId, released_at: now() }).eq("id", holdId).eq("active", true);
  },
  async isUnderLegalHold(scope: LegalHold["scope"], targetId: string, companyId?: string): Promise<boolean> {
    const sb = svc(); if (!sb) return false;
    // Active hold that targets this record directly, OR a company-scope hold on
    // the owning company. targetId/companyId are globally-unique uuids.
    const targets = companyId ? [targetId, companyId] : [targetId];
    const { data } = await sb.from("legal_holds").select("scope,target_id").eq("active", true).in("target_id", targets);
    return (data ?? []).some((h) => {
      const r = h as Row;
      return (r.scope === scope && r.target_id === targetId) ||
        (r.scope === "company" && companyId !== undefined && r.target_id === companyId);
    });
  },

  // ============================ AI meter (svc) ============================
  async aiSpendThisMonth(tenantId: string): Promise<number> {
    const sb = svc(); if (!sb) return 0;
    const month = now().slice(0, 7);
    const { data } = await sb.from("ai_runs").select("est_cost_usd,created_at").eq("tenant_id", tenantId).gte("created_at", `${month}-01`);
    return (data ?? []).filter((r) => (((r as Row).created_at as string) ?? "").slice(0, 7) === month)
      .reduce((sum, r) => sum + Number((r as Row).est_cost_usd ?? 0), 0);
  },
  async aiTokensThisMonth(tenantId: string): Promise<number> {
    const sb = svc(); if (!sb) return 0;
    const month = now().slice(0, 7);
    const { data } = await sb.from("ai_runs").select("input_tokens,output_tokens,created_at").eq("tenant_id", tenantId).gte("created_at", `${month}-01`);
    return (data ?? []).filter((r) => (((r as Row).created_at as string) ?? "").slice(0, 7) === month)
      .reduce((sum, r) => sum + Number((r as Row).input_tokens ?? 0) + Number((r as Row).output_tokens ?? 0), 0);
  },
  async logAiRun(input: Omit<AiRun, "id" | "createdAt">): Promise<AiRun> {
    const sb = svc(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("ai_runs").insert(toRow(input)).select("*").single();
    if (error) throw new Error("logAiRun: " + error.message);
    return toDomain<AiRun>(data);
  },
  async listAiRuns(tenantId: string, companyIdsFilter?: string[]): Promise<AiRun[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("ai_runs").select("*").eq("tenant_id", tenantId);
    if (companyIdsFilter) q = q.or(`company_id.is.null,company_id.in.(${companyIdsFilter.join(",")})`);
    const { data } = await q.order("created_at", { ascending: false });
    return many<AiRun>(data);
  },

  // ============================ Recommendations + tasks (RLS) =============
  async listRecommendations(tenantId: string, companyIdsFilter?: string[], status?: Recommendation["status"]): Promise<Recommendation[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("recommendations").select("*").in("company_id", companyIdsFilter ?? await companyIds(sb, tenantId));
    if (status) q = q.eq("status", status);
    const { data } = await q.order("created_at", { ascending: false });
    return many<Recommendation>(data);
  },
  async getRecommendation(recId: string): Promise<Recommendation | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("recommendations").select("*").eq("id", recId).maybeSingle();
    return data ? toDomain<Recommendation>(data) : undefined;
  },
  async createRecommendation(input: Omit<Recommendation, "id" | "createdAt">): Promise<Recommendation> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("recommendations").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createRecommendation: " + error.message);
    return toDomain<Recommendation>(data);
  },
  async updateRecommendation(recId: string, patch: Partial<Recommendation>): Promise<Recommendation | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("recommendations").update(toRow(patch)).eq("id", recId).select("*").maybeSingle();
    return data ? toDomain<Recommendation>(data) : undefined;
  },
  async listRecommendationDismissHistory(companyId: string): Promise<RecommendationDismissRecord[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb
      .from("recommendation_dismiss_history")
      .select("*")
      .eq("company_id", companyId)
      .order("dismissed_at", { ascending: false });
    return many<RecommendationDismissRecord>(data);
  },
  async createRecommendationDismissRecord(
    input: Omit<RecommendationDismissRecord, "id" | "dismissedAt">,
  ): Promise<RecommendationDismissRecord> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb
      .from("recommendation_dismiss_history")
      .insert(toRow(input))
      .select("*")
      .single();
    if (error) throw new Error("createRecommendationDismissRecord: " + error.message);
    return toDomain<RecommendationDismissRecord>(data);
  },
  async resurfaceExpiredSnoozedRecommendations(
    tenantId: string,
    companyIdsFilter: string[],
  ): Promise<number> {
    const sb = await usr(); if (!sb) return 0;
    const ids = companyIdsFilter.length
      ? companyIdsFilter
      : await companyIds(sb, tenantId);
    const { data } = await sb
      .from("recommendations")
      .select("id, snoozed_until")
      .in("company_id", ids)
      .eq("status", "snoozed");
    let count = 0;
    for (const row of data ?? []) {
      const until = row.snoozed_until as string | null;
      if (!until || Date.parse(until) > Date.now()) continue;
      const { error } = await sb
        .from("recommendations")
        .update({ status: "open", snoozed_until: null })
        .eq("id", row.id);
      if (!error) count += 1;
    }
    return count;
  },

  async listTasks(tenantId: string, companyIdsFilter?: string[], status?: Task["status"]): Promise<Task[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("tasks").select("*").in("company_id", companyIdsFilter ?? await companyIds(sb, tenantId));
    if (status) q = q.eq("status", status);
    const { data } = await q.order("created_at", { ascending: false });
    return many<Task>(data);
  },
  async getTask(taskId: string): Promise<Task | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("tasks").select("*").eq("id", taskId).maybeSingle();
    return data ? toDomain<Task>(data) : undefined;
  },
  async createTask(input: Omit<Task, "id" | "createdAt">): Promise<Task> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("tasks").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createTask: " + error.message);
    return toDomain<Task>(data);
  },
  async updateTask(taskId: string, patch: Partial<Task>): Promise<Task | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("tasks").update(toRow(patch)).eq("id", taskId).select("*").maybeSingle();
    return data ? toDomain<Task>(data) : undefined;
  },

  // ============================ AI-MOS opportunities (profile jsonb) ======
  async listAiMosOpportunities(
    tenantId: string,
    companyIdsFilter?: string[],
    status?: AiMosOpportunity["status"],
  ): Promise<AiMosOpportunity[]> {
    const sb = await usr(); if (!sb) return [];
    const ids = companyIdsFilter ?? (await companyIds(sb, tenantId));
    if (!ids.length) return [];
    const { data } = await sb.from("companies").select("id,tenant_id,profile").in("id", ids);
    const out: AiMosOpportunity[] = [];
    for (const row of data ?? []) {
      const company = normaliseCompany(toDomain<Company>(row as Row, COMPANY_ALIAS));
      for (const opp of company.profile.aiMos?.opportunities ?? []) {
        if (status && opp.status !== status) continue;
        out.push({ ...opp, tenantId: company.tenantId, companyId: company.id });
      }
    }
    return out.sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt));
  },
  async getAiMosOpportunity(oppId: string): Promise<AiMosOpportunity | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("companies").select("id,tenant_id,profile");
    for (const row of data ?? []) {
      const company = normaliseCompany(toDomain<Company>(row as Row, COMPANY_ALIAS));
      const hit = company.profile.aiMos?.opportunities?.find((o) => o.id === oppId);
      if (hit) return { ...hit, tenantId: company.tenantId, companyId: company.id };
    }
    return undefined;
  },
  async createAiMosOpportunity(
    input: Omit<AiMosOpportunity, "id" | "createdAt">,
  ): Promise<AiMosOpportunity> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const company = await this.getCompany(input.companyId);
    if (!company) throw new Error("createAiMosOpportunity: company not found");
    const opp: AiMosOpportunity = {
      ...input,
      id: randomUUID(),
      createdAt: now(),
    };
    const opportunities = [...(company.profile.aiMos?.opportunities ?? []), opp];
    await this.updateCompany(company.id, {
      profile: { ...company.profile, aiMos: { opportunities } },
    });
    return opp;
  },
  async updateAiMosOpportunity(
    oppId: string,
    patch: Partial<AiMosOpportunity>,
  ): Promise<AiMosOpportunity | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const existing = await this.getAiMosOpportunity(oppId);
    if (!existing) return undefined;
    const company = await this.getCompany(existing.companyId);
    if (!company) return undefined;
    const opportunities = (company.profile.aiMos?.opportunities ?? []).map((o) =>
      o.id === oppId ? { ...o, ...patch, id: o.id } : o,
    );
    await this.updateCompany(company.id, {
      profile: { ...company.profile, aiMos: { opportunities } },
    });
    return opportunities.find((o) => o.id === oppId);
  },

  // ============================ Calendar assist (profile jsonb) ===========
  async listCalendarAssistSuggestions(
    tenantId: string,
    companyIdsFilter?: string[],
    status?: CalendarAssistSuggestion["status"],
  ): Promise<CalendarAssistSuggestion[]> {
    const sb = await usr(); if (!sb) return [];
    const ids = companyIdsFilter ?? (await companyIds(sb, tenantId));
    if (!ids.length) return [];
    const { data } = await sb.from("companies").select("id,tenant_id,profile").in("id", ids);
    const out: CalendarAssistSuggestion[] = [];
    for (const row of data ?? []) {
      const company = normaliseCompany(toDomain<Company>(row as Row, COMPANY_ALIAS));
      for (const s of company.profile.calendarAssist?.suggestions ?? []) {
        if (status && s.status !== status) continue;
        out.push({ ...s, tenantId: company.tenantId, companyId: company.id });
      }
    }
    return out.sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt));
  },
  async getCalendarAssistSuggestion(suggestionId: string): Promise<CalendarAssistSuggestion | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("companies").select("id,tenant_id,profile");
    for (const row of data ?? []) {
      const company = normaliseCompany(toDomain<Company>(row as Row, COMPANY_ALIAS));
      const hit = company.profile.calendarAssist?.suggestions?.find((s) => s.id === suggestionId);
      if (hit) return { ...hit, tenantId: company.tenantId, companyId: company.id };
    }
    return undefined;
  },
  async createCalendarAssistSuggestion(
    input: Omit<CalendarAssistSuggestion, "id" | "createdAt">,
  ): Promise<CalendarAssistSuggestion> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const company = await this.getCompany(input.companyId);
    if (!company) throw new Error("createCalendarAssistSuggestion: company not found");
    const row: CalendarAssistSuggestion = {
      ...input,
      id: randomUUID(),
      createdAt: now(),
    };
    const suggestions = [...(company.profile.calendarAssist?.suggestions ?? []), row];
    await this.updateCompany(company.id, {
      profile: { ...company.profile, calendarAssist: { suggestions } },
    });
    return row;
  },
  async updateCalendarAssistSuggestion(
    suggestionId: string,
    patch: Partial<CalendarAssistSuggestion>,
  ): Promise<CalendarAssistSuggestion | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const existing = await this.getCalendarAssistSuggestion(suggestionId);
    if (!existing) return undefined;
    const company = await this.getCompany(existing.companyId);
    if (!company) return undefined;
    const suggestions = (company.profile.calendarAssist?.suggestions ?? []).map((s) =>
      s.id === suggestionId ? { ...s, ...patch, id: s.id } : s,
    );
    await this.updateCompany(company.id, {
      profile: { ...company.profile, calendarAssist: { suggestions } },
    });
    return suggestions.find((s) => s.id === suggestionId);
  },

  // ============================ UTM links (RLS) ============================
  async listUtmLinks(tenantId: string, companyIdsFilter?: string[]): Promise<UtmLink[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("utm_links").select("*").in("company_id", companyIdsFilter ?? await companyIds(sb, tenantId)).order("created_at", { ascending: false });
    return many<UtmLink>(data);
  },
  async createUtmLink(input: Omit<UtmLink, "id" | "createdAt">): Promise<UtmLink> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("utm_links").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createUtmLink: " + error.message);
    return toDomain<UtmLink>(data);
  },

  // ============================ Paid advertising (RLS) =====================
  async listAdAccounts(tenantId: string, companyId?: string): Promise<AdAccount[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("ad_accounts").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("platform");
    return many<AdAccount>(data);
  },
  async getAdAccount(adAccountId: string): Promise<AdAccount | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("ad_accounts").select("*").eq("id", adAccountId).maybeSingle();
    return data ? toDomain<AdAccount>(data) : undefined;
  },
  async findConnectedAdAccount(companyId: string, platform: AdPlatform): Promise<AdAccount | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    // order + limit(1), NOT maybeSingle() on the bare filter: a rare double-
    // connected (racing connects) would make maybeSingle() THROW. Most-recent
    // grant wins, matching the in-memory branch.
    const { data } = await sb.from("ad_accounts").select("*").eq("company_id", companyId).eq("platform", platform).eq("status", "connected").order("connected_at", { ascending: false }).limit(1).maybeSingle();
    return data ? toDomain<AdAccount>(data) : undefined;
  },
  // Session-less webhook resolution: map a platform's external ad-account id to
  // our delegated AdAccount row (mirrors getTenantByStripeCustomer).
  async findAdAccountByExternalId(platform: AdPlatform, externalAccountId: string): Promise<AdAccount | undefined> {
    const sb = svc(); if (!sb) return undefined;
    const { data } = await sb.from("ad_accounts").select("*").eq("platform", platform).eq("external_account_id", externalAccountId).eq("status", "connected").order("connected_at", { ascending: false }).limit(1).maybeSingle();
    return data ? toDomain<AdAccount>(data) : undefined;
  },
  async createAdAccount(input: Omit<AdAccount, "id" | "connectedAt" | "updatedAt">): Promise<AdAccount> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("ad_accounts").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createAdAccount: " + error.message);
    return toDomain<AdAccount>(data);
  },
  async updateAdAccount(adAccountId: string, patch: Partial<AdAccount>): Promise<AdAccount | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("ad_accounts").update({ ...toRow(patch), updated_at: now() }).eq("id", adAccountId).select("*").maybeSingle();
    return data ? toDomain<AdAccount>(data) : undefined;
  },
  async getAdBudget(companyId: string): Promise<AdBudget | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("ad_budgets").select("*").eq("company_id", companyId).maybeSingle();
    return data ? toDomain<AdBudget>(data) : undefined;
  },
  async listAdBudgets(tenantId: string): Promise<AdBudget[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("ad_budgets").select("*").in("company_id", await companyIds(sb, tenantId));
    return many<AdBudget>(data);
  },
  async upsertAdBudget(input: Omit<AdBudget, "updatedAt">): Promise<AdBudget> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("ad_budgets").upsert({ ...toRow(input), updated_at: now() }, { onConflict: "company_id" }).select("*").single();
    if (error) throw new Error("upsertAdBudget: " + error.message);
    return toDomain<AdBudget>(data);
  },
  async listAdCampaigns(tenantId: string, companyId?: string): Promise<AdCampaign[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("ad_campaigns").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("start_date", { ascending: false });
    return many<AdCampaign>(data);
  },
  async getAdCampaign(campaignId: string): Promise<AdCampaign | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("ad_campaigns").select("*").eq("id", campaignId).maybeSingle();
    return data ? toDomain<AdCampaign>(data) : undefined;
  },
  async createAdCampaign(input: Omit<AdCampaign, "id" | "createdAt" | "updatedAt">): Promise<AdCampaign> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("ad_campaigns").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createAdCampaign: " + error.message);
    return toDomain<AdCampaign>(data);
  },
  async updateAdCampaign(campaignId: string, patch: Partial<AdCampaign>): Promise<AdCampaign | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("ad_campaigns").update({ ...toRow(patch), updated_at: now() }).eq("id", campaignId).select("*").maybeSingle();
    return data ? toDomain<AdCampaign>(data) : undefined;
  },
  async listAudienceSegments(tenantId: string, companyId?: string): Promise<AudienceSegment[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("audience_segments").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("name");
    return many<AudienceSegment>(data);
  },
  async getAudienceSegment(segmentId: string): Promise<AudienceSegment | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("audience_segments").select("*").eq("id", segmentId).maybeSingle();
    return data ? toDomain<AudienceSegment>(data) : undefined;
  },
  async createAudienceSegment(input: Omit<AudienceSegment, "id" | "createdAt" | "updatedAt">): Promise<AudienceSegment> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("audience_segments").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createAudienceSegment: " + error.message);
    return toDomain<AudienceSegment>(data);
  },
  async updateAudienceSegment(segmentId: string, patch: Partial<AudienceSegment>): Promise<AudienceSegment | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("audience_segments").update({ ...toRow(patch), updated_at: now() }).eq("id", segmentId).select("*").maybeSingle();
    return data ? toDomain<AudienceSegment>(data) : undefined;
  },
  async deleteAudienceSegment(segmentId: string): Promise<void> {
    const sb = await usr(); if (!sb) return;
    // ad_campaigns.audience_segment_id is ON DELETE SET NULL, so referencing
    // campaigns detach automatically — no orphan pointer.
    await sb.from("audience_segments").delete().eq("id", segmentId);
  },
  async listLeads(tenantId: string, companyId?: string): Promise<Lead[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("leads").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("captured_at", { ascending: false });
    return many<Lead>(data);
  },
  async createLead(input: Omit<Lead, "id">): Promise<Lead> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("leads").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createLead: " + error.message);
    return toDomain<Lead>(data);
  },
  async findLeadByExternalId(companyId: string, platform: AdPlatform, externalLeadId: string): Promise<Lead | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("leads").select("*").eq("company_id", companyId).eq("platform", platform).eq("external_lead_id", externalLeadId).maybeSingle();
    return data ? toDomain<Lead>(data) : undefined;
  },

  // ============================ Email marketing (RLS) ======================
  async listEmailTemplates(tenantId: string, companyId?: string): Promise<EmailTemplate[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("email_templates").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("name");
    return many<EmailTemplate>(data);
  },
  async getEmailTemplate(templateId: string): Promise<EmailTemplate | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("email_templates").select("*").eq("id", templateId).maybeSingle();
    return data ? toDomain<EmailTemplate>(data) : undefined;
  },
  async createEmailTemplate(input: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt">): Promise<EmailTemplate> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("email_templates").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createEmailTemplate: " + error.message);
    return toDomain<EmailTemplate>(data);
  },
  async updateEmailTemplate(templateId: string, patch: Partial<EmailTemplate>): Promise<EmailTemplate | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("email_templates").update(toRow({ ...patch, updatedAt: now() })).eq("id", templateId).select("*").maybeSingle();
    return data ? toDomain<EmailTemplate>(data) : undefined;
  },
  async listEmailSubscribers(companyId: string): Promise<EmailSubscriber[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("email_subscribers").select("*").eq("company_id", companyId).order("email");
    return many<EmailSubscriber>(data);
  },
  async getEmailSubscriber(subscriberId: string): Promise<EmailSubscriber | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("email_subscribers").select("*").eq("id", subscriberId).maybeSingle();
    return data ? toDomain<EmailSubscriber>(data) : undefined;
  },
  async createEmailSubscriber(input: Omit<EmailSubscriber, "id" | "createdAt" | "updatedAt">): Promise<EmailSubscriber> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("email_subscribers").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createEmailSubscriber: " + error.message);
    return toDomain<EmailSubscriber>(data);
  },
  async updateEmailSubscriber(subscriberId: string, patch: Partial<EmailSubscriber>): Promise<EmailSubscriber | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("email_subscribers").update(toRow({ ...patch, updatedAt: now() })).eq("id", subscriberId).select("*").maybeSingle();
    return data ? toDomain<EmailSubscriber>(data) : undefined;
  },
  async listEmailCampaigns(tenantId: string, companyId?: string): Promise<EmailCampaign[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("email_campaigns").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("created_at", { ascending: false });
    return many<EmailCampaign>(data);
  },
  async getEmailCampaign(campaignId: string): Promise<EmailCampaign | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("email_campaigns").select("*").eq("id", campaignId).maybeSingle();
    return data ? toDomain<EmailCampaign>(data) : undefined;
  },
  async createEmailCampaign(input: Omit<EmailCampaign, "id" | "createdAt" | "updatedAt">): Promise<EmailCampaign> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("email_campaigns").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createEmailCampaign: " + error.message);
    return toDomain<EmailCampaign>(data);
  },
  async updateEmailCampaign(campaignId: string, patch: Partial<EmailCampaign>): Promise<EmailCampaign | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("email_campaigns").update(toRow({ ...patch, updatedAt: now() })).eq("id", campaignId).select("*").maybeSingle();
    return data ? toDomain<EmailCampaign>(data) : undefined;
  },

  // ============================ Add-on entitlements (RLS) ==================
  async listCompanyEntitlements(tenantId: string, companyId?: string): Promise<CompanyEntitlement[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("company_entitlements").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("addon_id");
    return many<CompanyEntitlement>(data);
  },
  async getCompanyEntitlement(companyId: string, addonId: AddonId): Promise<CompanyEntitlement | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("company_entitlements").select("*").eq("company_id", companyId).eq("addon_id", addonId).maybeSingle();
    return data ? toDomain<CompanyEntitlement>(data) : undefined;
  },
  async upsertCompanyEntitlement(input: {
    companyId: string; addonId: AddonId; status: "active" | "cancelled"; enabledById: string; stripeSubscriptionId?: string;
  }): Promise<CompanyEntitlement> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const t = now();
    // Build the conflict-target row explicitly (not toRow) so the timestamp
    // semantics match the in-memory branch: activating (re)stamps enabled_at and
    // clears cancelled_at; cancelling stamps cancelled_at and leaves enabled_at.
    // Omitting `id` preserves the existing row's id on the ON CONFLICT update and
    // defaults gen_random_uuid() on insert.
    const row: Row = {
      company_id: input.companyId,
      addon_id: input.addonId,
      status: input.status,
      enabled_by: input.enabledById,
      updated_at: t,
    };
    if (input.stripeSubscriptionId !== undefined) row.stripe_subscription_id = input.stripeSubscriptionId;
    if (input.status === "active") {
      row.enabled_at = t;
      row.cancelled_at = null;
    } else {
      row.cancelled_at = t;
    }
    const { data, error } = await sb
      .from("company_entitlements")
      .upsert(row, { onConflict: "company_id,addon_id" })
      .select("*")
      .single();
    if (error) throw new Error("upsertCompanyEntitlement: " + error.message);
    return toDomain<CompanyEntitlement>(data);
  },

  // ============================ Photo shoots (RLS) ===========================
  async listPhotoShoots(tenantId: string, companyId?: string): Promise<PhotoShoot[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("photo_shoots").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("created_at", { ascending: false });
    return many<PhotoShoot>(data);
  },
  async getPhotoShoot(shootId: string): Promise<PhotoShoot | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("photo_shoots").select("*").eq("id", shootId).maybeSingle();
    return data ? toDomain<PhotoShoot>(data) : undefined;
  },
  async createPhotoShoot(input: Omit<PhotoShoot, "id" | "createdAt" | "updatedAt">): Promise<PhotoShoot> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const row = toRow({ ...input, updatedAt: now() });
    const { data, error } = await sb.from("photo_shoots").insert(row).select("*").single();
    if (error) throw new Error("createPhotoShoot: " + error.message);
    return toDomain<PhotoShoot>(data);
  },
  async updatePhotoShoot(shootId: string, patch: Partial<PhotoShoot>): Promise<PhotoShoot | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const row = toRow({ ...patch, updatedAt: now() });
    const { data, error } = await sb.from("photo_shoots").update(row).eq("id", shootId).select("*").maybeSingle();
    if (error) throw new Error("updatePhotoShoot: " + error.message);
    return data ? toDomain<PhotoShoot>(data) : undefined;
  },

  // ============================ Photographer marketplace (RLS) =================
  async listPhotographerProfiles(tenantId: string): Promise<PhotographerProfile[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb
      .from("photographer_profiles")
      .select("*")
      .eq("active", true)
      .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
      .order("name");
    return many<PhotographerProfile>(data);
  },
  async getPhotographerProfile(photographerId: string): Promise<PhotographerProfile | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("photographer_profiles").select("*").eq("id", photographerId).maybeSingle();
    return data ? toDomain<PhotographerProfile>(data) : undefined;
  },
  async listPhotographerPackages(photographerId: string): Promise<PhotographerPackage[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb
      .from("photographer_packages")
      .select("*")
      .eq("photographer_id", photographerId)
      .eq("active", true)
      .order("price_cents");
    return many<PhotographerPackage>(data);
  },
  async getPhotographerPackage(packageId: string): Promise<PhotographerPackage | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("photographer_packages").select("*").eq("id", packageId).maybeSingle();
    return data ? toDomain<PhotographerPackage>(data) : undefined;
  },
  async listPhotoMarketplaceBookings(
    tenantId: string,
    companyId?: string,
  ): Promise<PhotoMarketplaceBooking[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb
      .from("photo_marketplace_bookings")
      .select("*")
      .in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("created_at", { ascending: false });
    return many<PhotoMarketplaceBooking>(data);
  },
  async getPhotoMarketplaceBooking(bookingId: string): Promise<PhotoMarketplaceBooking | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb
      .from("photo_marketplace_bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();
    return data ? toDomain<PhotoMarketplaceBooking>(data) : undefined;
  },
  async createPhotoMarketplaceBooking(
    input: Omit<PhotoMarketplaceBooking, "id" | "createdAt" | "updatedAt">,
  ): Promise<PhotoMarketplaceBooking> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const row = toRow({ ...input, updatedAt: now() });
    const { data, error } = await sb.from("photo_marketplace_bookings").insert(row).select("*").single();
    if (error) throw new Error("createPhotoMarketplaceBooking: " + error.message);
    return toDomain<PhotoMarketplaceBooking>(data);
  },
  async updatePhotoMarketplaceBooking(
    bookingId: string,
    patch: Partial<PhotoMarketplaceBooking>,
  ): Promise<PhotoMarketplaceBooking | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const row = toRow({ ...patch, updatedAt: now() });
    const { data, error } = await sb
      .from("photo_marketplace_bookings")
      .update(row)
      .eq("id", bookingId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error("updatePhotoMarketplaceBooking: " + error.message);
    return data ? toDomain<PhotoMarketplaceBooking>(data) : undefined;
  },

  // ============================ Menu designs (RLS) =============================
  async listMenuDesigns(tenantId: string, companyId?: string): Promise<MenuDesign[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("menu_designs").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("created_at", { ascending: false });
    return many<MenuDesign>(data);
  },
  async getMenuDesign(designId: string): Promise<MenuDesign | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("menu_designs").select("*").eq("id", designId).maybeSingle();
    return data ? toDomain<MenuDesign>(data) : undefined;
  },
  async createMenuDesign(input: Omit<MenuDesign, "id" | "createdAt" | "updatedAt">): Promise<MenuDesign> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const row = toRow({ ...input, updatedAt: now() });
    const { data, error } = await sb.from("menu_designs").insert(row).select("*").single();
    if (error) throw new Error("createMenuDesign: " + error.message);
    return toDomain<MenuDesign>(data);
  },
  async updateMenuDesign(designId: string, patch: Partial<MenuDesign>): Promise<MenuDesign | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const row = toRow({ ...patch, updatedAt: now() });
    const { data, error } = await sb.from("menu_designs").update(row).eq("id", designId).select("*").maybeSingle();
    if (error) throw new Error("updateMenuDesign: " + error.message);
    return data ? toDomain<MenuDesign>(data) : undefined;
  },

  // ============================ Order Now (RLS) ==================================
  async listOrderMenuItems(tenantId: string, companyId?: string): Promise<OrderMenuItem[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("order_menu_items").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("sort_order").order("name");
    return many<OrderMenuItem>(data);
  },
  async listOrderMenuItemsByCompany(companyId: string): Promise<OrderMenuItem[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("order_menu_items").select("*").eq("company_id", companyId).eq("available", true).order("sort_order").order("name");
    return many<OrderMenuItem>(data);
  },
  async getOrderMenuItem(itemId: string): Promise<OrderMenuItem | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("order_menu_items").select("*").eq("id", itemId).maybeSingle();
    return data ? toDomain<OrderMenuItem>(data) : undefined;
  },
  async createOrderMenuItem(input: Omit<OrderMenuItem, "id" | "createdAt" | "updatedAt">): Promise<OrderMenuItem> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const row = toRow({ ...input, updatedAt: now() });
    const { data, error } = await sb.from("order_menu_items").insert(row).select("*").single();
    if (error) throw new Error("createOrderMenuItem: " + error.message);
    return toDomain<OrderMenuItem>(data);
  },
  async updateOrderMenuItem(itemId: string, patch: Partial<OrderMenuItem>): Promise<OrderMenuItem | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const row = toRow({ ...patch, updatedAt: now() });
    const { data, error } = await sb.from("order_menu_items").update(row).eq("id", itemId).select("*").maybeSingle();
    if (error) throw new Error("updateOrderMenuItem: " + error.message);
    return data ? toDomain<OrderMenuItem>(data) : undefined;
  },
  async deleteOrderMenuItem(itemId: string): Promise<void> {
    const sb = await usr(); if (!sb) return;
    await sb.from("order_menu_items").delete().eq("id", itemId);
  },
  async getOrderingSettings(companyId: string): Promise<OrderingSettings | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("ordering_settings").select("*").eq("company_id", companyId).maybeSingle();
    return data ? toDomain<OrderingSettings>(data) : undefined;
  },
  async upsertOrderingSettings(input: OrderingSettings): Promise<OrderingSettings> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const row = toRow({ ...input, updatedAt: now() });
    const { data, error } = await sb.from("ordering_settings").upsert(row, { onConflict: "company_id" }).select("*").single();
    if (error) throw new Error("upsertOrderingSettings: " + error.message);
    return toDomain<OrderingSettings>(data);
  },
  async listRestaurantOrders(tenantId: string, companyId?: string): Promise<RestaurantOrder[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("restaurant_orders").select("*").in("company_id", await companyIds(sb, tenantId));
    if (companyId) q = q.eq("company_id", companyId);
    const { data } = await q.order("created_at", { ascending: false });
    return many<RestaurantOrder>(data);
  },
  async getRestaurantOrder(orderId: string): Promise<RestaurantOrder | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("restaurant_orders").select("*").eq("id", orderId).maybeSingle();
    return data ? toDomain<RestaurantOrder>(data) : undefined;
  },
  async createRestaurantOrder(input: Omit<RestaurantOrder, "id" | "createdAt" | "updatedAt">): Promise<RestaurantOrder> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const row = toRow({ ...input, updatedAt: now() });
    const { data, error } = await sb.from("restaurant_orders").insert(row).select("*").single();
    if (error) throw new Error("createRestaurantOrder: " + error.message);
    return toDomain<RestaurantOrder>(data);
  },
  async updateRestaurantOrder(orderId: string, patch: Partial<RestaurantOrder>): Promise<RestaurantOrder | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const row = toRow({ ...patch, updatedAt: now() });
    const { data, error } = await sb.from("restaurant_orders").update(row).eq("id", orderId).select("*").maybeSingle();
    if (error) throw new Error("updateRestaurantOrder: " + error.message);
    return data ? toDomain<RestaurantOrder>(data) : undefined;
  },

  // ============================ Prompt templates (RLS, platform lib) =======
  async listPromptTemplates(tenantId: string, companyId?: string): Promise<PromptTemplate[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("prompt_templates").select("*").eq("active", true).or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    if (companyId) q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
    const { data } = await q.order("name");
    return many<PromptTemplate>(data);
  },
  async getPromptTemplate(templateId: string): Promise<PromptTemplate | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("prompt_templates").select("*").eq("id", templateId).maybeSingle();
    return data ? toDomain<PromptTemplate>(data) : undefined;
  },
  async createPromptTemplate(input: Omit<PromptTemplate, "id" | "createdAt">): Promise<PromptTemplate> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("prompt_templates").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createPromptTemplate: " + error.message);
    return toDomain<PromptTemplate>(data);
  },
  async setPromptTemplateActive(templateId: string, active: boolean): Promise<void> {
    const sb = await usr(); if (!sb) return;
    await sb.from("prompt_templates").update({ active }).eq("id", templateId);
  },

  // ============================ Assets + brand templates (RLS) =============
  async listAssets(tenantId: string, companyIdsFilter?: string[], opts: { status?: Asset["status"]; approvedOnly?: boolean } = {}): Promise<Asset[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("assets").select("*").in("company_id", companyIdsFilter ?? await companyIds(sb, tenantId));
    if (opts.approvedOnly) q = q.eq("status", "approved");
    else if (opts.status) q = q.eq("status", opts.status);
    const { data } = await q.order("updated_at", { ascending: false });
    return many<Asset>(data);
  },
  async getAsset(assetId: string): Promise<Asset | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("assets").select("*").eq("id", assetId).maybeSingle();
    return data ? toDomain<Asset>(data) : undefined;
  },
  async createAsset(input: Omit<Asset, "id" | "createdAt" | "updatedAt">): Promise<Asset> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("assets").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createAsset: " + error.message);
    return toDomain<Asset>(data);
  },
  async updateAsset(assetId: string, patch: Partial<Asset>): Promise<Asset | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("assets").update({ ...toRow(patch), updated_at: now() }).eq("id", assetId).select("*").maybeSingle();
    return data ? toDomain<Asset>(data) : undefined;
  },

  async listBrandTemplates(tenantId: string, companyId?: string): Promise<BrandTemplate[]> {
    const sb = await usr(); if (!sb) return [];
    let q = sb.from("brand_templates").select("*").eq("active", true).or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    if (companyId) q = q.or(`company_id.is.null,company_id.eq.${companyId}`);
    const { data } = await q.order("name");
    return many<BrandTemplate>(data);
  },
  async getBrandTemplate(templateId: string): Promise<BrandTemplate | undefined> {
    const sb = await usr(); if (!sb) return undefined;
    const { data } = await sb.from("brand_templates").select("*").eq("id", templateId).maybeSingle();
    return data ? toDomain<BrandTemplate>(data) : undefined;
  },
  async createBrandTemplate(input: Omit<BrandTemplate, "id" | "createdAt" | "updatedAt">): Promise<BrandTemplate> {
    const sb = await usr(); if (!sb) throw new Error("Supabase not configured");
    const { data, error } = await sb.from("brand_templates").insert(toRow(input)).select("*").single();
    if (error) throw new Error("createBrandTemplate: " + error.message);
    return toDomain<BrandTemplate>(data);
  },
  async setBrandTemplateActive(templateId: string, active: boolean): Promise<void> {
    const sb = await usr(); if (!sb) return;
    await sb.from("brand_templates").update({ active, updated_at: now() }).eq("id", templateId);
  },

  // ============================ Audit (svc write / RLS read) ===============
  async appendAudit(e: { action: string; actorId: string; actorEmail: string; tenantId?: string; targetType?: string; targetId?: string; companyId?: string; detail?: string }): Promise<void> {
    const sb = svc(); if (!sb) return;
    await sb.from("audit_logs").insert({
      action: e.action, actor_id: e.actorId, actor_email: e.actorEmail, tenant_id: e.tenantId,
      target_type: e.targetType, target_id: e.targetId, company_id: e.companyId, detail: e.detail,
    });
  },
  async listAudit(tenantId: string, companyIdsFilter?: string[]): Promise<AuditLog[]> {
    const sb = await usr(); if (!sb) return [];
    const { data } = await sb.from("audit_logs").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    let entries = many<AuditLog>(data);
    if (companyIdsFilter) {
      const allowed = new Set(companyIdsFilter);
      entries = entries.filter((e) => !e.companyId || allowed.has(e.companyId));
    }
    return entries;
  },

  // ============================ GDPR export + purge (svc) ==================
  async exportTenantData(tenantId: string): Promise<Record<string, unknown>> {
    const sb = svc(); if (!sb) return { exportedAt: now(), tenant: undefined };
    const ids = await companyIds(sb, tenantId);
    const byCompany = async (table: string) => (await sb.from(table).select("*").in("company_id", ids)).data ?? [];
    const byTenant = async (table: string) => (await sb.from(table).select("*").eq("tenant_id", tenantId)).data ?? [];
    const one = async (table: string) => (await sb.from(table).select("*").eq("tenant_id", tenantId)).data ?? [];
    const [tenant, members] = await Promise.all([
      sb.from("tenants").select("*").eq("id", tenantId).maybeSingle(),
      sb.from("tenant_members").select("*").eq("tenant_id", tenantId),
    ]);
    const memberIds = (members.data ?? []).map((m) => (m as Row).user_id as string);
    const users = memberIds.length ? (await sb.from("app_users").select("*").in("id", memberIds)).data ?? [] : [];
    const integrations = (await byCompany("publishing_integrations")).map(({ encrypted_token: _t, ...rest }) => rest);
    const adAccounts = (await byCompany("ad_accounts")).map(({ encrypted_token: _t, ...rest }) => rest);
    return {
      exportedAt: now(),
      tenant: tenant.data ? toDomain<Tenant>(tenant.data) : undefined,
      members: many<TenantMember>(members.data),
      users: many<User>(users),
      companyAccess: many(((await sb.from("company_access").select("*").in("company_id", ids)).data)),
      companies: many<Company>((await sb.from("companies").select("*").eq("tenant_id", tenantId)).data, COMPANY_ALIAS),
      requests: many(await byCompany("marketing_requests")),
      content: many(await byCompany("content_items")),
      contentComments: many(await byCompany("content_comments")),
      socialResponses: many(await byCompany("social_responses")),
      socialMentions: many(await byCompany("social_mentions")),
      companyReviews: many(await byCompany("company_reviews")),
      reviewRequestCampaigns: many(await byCompany("review_request_campaigns")),
      knowledgeDocs: many(await byCompany("knowledge_documents")),
      services: many(await byCompany("services")),
      localProfiles: many(await byCompany("local_area_profiles")),
      knowledgeGaps: many(await byCompany("knowledge_gaps")),
      consents: many(await byCompany("consents")),
      evidence: many(await byCompany("evidence")),
      approvedClaims: many(await byCompany("approved_claims")),
      approvedResponses: many(await byTenant("approved_responses")),
      campaigns: many(await byCompany("campaigns")),
      campaignItems: many(await byCompany("campaign_items")),
      offers: many(await byCompany("offers")),
      promptTemplates: many(await byTenant("prompt_templates")),
      scheduledPosts: many(await byCompany("scheduled_posts")),
      integrations: integrations.map((r) => toDomain(r)),
      connectInvites: many(await byTenant("connect_invites")),
      publishLogs: many(await byCompany("publish_logs")),
      publishingControls: many(await one("publishing_controls")),
      utmLinks: many(await byCompany("utm_links")),
      adAccounts: adAccounts.map((r) => toDomain(r)),
      adBudgets: many(await byCompany("ad_budgets")),
      adCampaigns: many(await byCompany("ad_campaigns")),
      audienceSegments: many(await byCompany("audience_segments")),
      leads: many(await byCompany("leads")),
      emailTemplates: many(await byCompany("email_templates")),
      emailSubscribers: many(await byCompany("email_subscribers")),
      emailCampaigns: many(await byCompany("email_campaigns")),
      companyEntitlements: many(await byCompany("company_entitlements")),
      photoShoots: many(await byCompany("photo_shoots")),
      photographerProfiles: many(
        (
          await sb
            .from("photographer_profiles")
            .select("*")
            .or(`tenant_id.is.null,tenant_id.eq.${tenantId}`)
        ).data,
      ),
      photographerPackages: many((await sb.from("photographer_packages").select("*")).data),
      photoMarketplaceBookings: many(await byCompany("photo_marketplace_bookings")),
      menuDesigns: many(await byCompany("menu_designs")),
      orderMenuItems: many(await byCompany("order_menu_items")),
      orderingSettings: many(await byCompany("ordering_settings")),
      restaurantOrders: many(await byCompany("restaurant_orders")),
      recommendations: many(await byCompany("recommendations")),
      tasks: many(await byCompany("tasks")),
      securitySettings: many(await one("security_settings")),
      legalHolds: many(await byTenant("legal_holds")),
      assets: many(await byCompany("assets")),
      brandTemplates: many(await byTenant("brand_templates")),
      automationSettings: many(await one("automation_settings")),
      automationRuns: many(await byTenant("automation_runs")),
      aiRuns: many(await byTenant("ai_runs")),
      termsAcceptances: many(await byTenant("terms_acceptances")),
      auditLog: many(await one("audit_logs")),
    };
  },
  async purgeTenant(tenantId: string): Promise<void> {
    const sb = svc(); if (!sb) return;
    // Former members, so we can delete now-orphaned global identities after.
    const { data: members } = await sb.from("tenant_members").select("user_id").eq("tenant_id", tenantId);
    const wasMember = (members ?? []).map((m) => (m as Row).user_id as string);
    // Deleting the tenant cascades companies (→ content/requests/…), members,
    // ai_runs, audit, settings, holds, tenant-keyed templates/responses. Platform
    // library rows (tenant_id null) are not cascaded and survive.
    await sb.from("tenants").delete().eq("id", tenantId);
    // Delete auth identities that no longer belong to ANY tenant (cascades app_users).
    for (const uid of wasMember) {
      const { data: still } = await sb.from("tenant_members").select("tenant_id").eq("user_id", uid).limit(1);
      if (!still || still.length === 0) await sb.auth.admin.deleteUser(uid).catch(() => {});
    }
  },
};

export type SupabaseRepo = typeof supabaseRepo;
