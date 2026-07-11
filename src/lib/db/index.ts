// Repository functions over the data store. Server actions and server
// components call these — never the store directly — so the Supabase adapter
// can later replace the bodies without touching callers.

import { db } from "@/lib/db/store";
import { id, now } from "@/lib/utils";
import { planFor } from "@/lib/plans";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { supabaseRepo } from "@/lib/db/supabase-adapter";
import { ROLE_TITLE_TIER, type RoleTitle } from "@/lib/types";
import type {
  AdAccount,
  AdBudget,
  AdCampaign,
  AdPlatform,
  AudienceSegment,
  AiRun,
  AiMosOpportunity,
  AiMosSignalRun,
  CalendarAssistSuggestion,
  ApprovedClaim,
  ApprovedResponse,
  Asset,
  AutomationRun,
  AutomationSettings,
  BrandTemplate,
  Campaign,
  CampaignBuilderRun,
  CampaignDraftScheduleItem,
  CampaignItem,
  CampaignPlanVersion,
  Company,
  CompanyAccess,
  CompanyEntitlement,
  AddonId,
  MenuDesign,
  OrderMenuItem,
  OrderingSettings,
  PhotoShoot,
  PhotographerProfile,
  PhotographerPackage,
  PhotoMarketplaceBooking,
  RestaurantOrder,
  BookingSettings,
  ServicePeriod,
  Reservation,
  Lead,
  Tenant,
  TenantMember,
  ConsentRecord,
  ContentComment,
  ContentItem,
  EmailCampaign,
  EmailSubscriber,
  EmailTemplate,
  CrmContact,
  CrmInteraction,
  CrmSegment,
  CmsPage,
  CmsPageVersion,
  CmsSeoMetadata,
  CmsUpdateRequest,
  RagKnowledgeSource,
  RagKnowledgeVersion,
  ConversionFunnel,
  FunnelAbExperiment,
  FunnelJourney,
  FunnelLandingPage,
  CampaignExperiment,
  CompanyReview,
  ReviewRequestCampaign,
  SmsCampaign,
  SmsCompanySettings,
  SmsSubscriber,
  LoyaltyProgram,
  LoyaltyTier,
  LoyaltyMember,
  LoyaltyCoupon,
  LoyaltyReferral,
  LoyaltyRedemption,
  MarketingWorkflow,
  MarketingWorkflowSettings,
  WorkflowDispatchLog,
  EvidenceRecord,
  KnowledgeDocument,
  KnowledgeGap,
  LocalAreaProfile,
  MarketingRequest,
  Offer,
  PromptTemplate,
  LegalHold,
  PublishingControls,
  PublishingIntegration,
  ConnectInvite,
  ApiKey,
  PartnerWebhook,
  PublishLog,
  Recommendation,
  RecommendationDismissRecord,
  LearningHypothesis,
  LearningLesson,
  ApprovalPolicy,
  AiCampaignRecommendation,
  AiOrchestrationRun,
  AiPromptVersion,
  CampaignPerformanceSnapshot,
  PrivacyRequest,
  PrivacyRequestStatus,
  PrivacyRequestType,
  ManagedDeliveryRun,
  CompanyCreditWallet,
  CompanyCreditLedgerEntry,
  CreditLedgerKind,
  ScheduledPost,
  ScheduledPostStatus,
  SecuritySettings,
  TermsVersion,
  TermsAcceptance,
  ServiceRecord,
  Session,
  SocialMention,
  SocialResponseDraft,
  Task,
  User,
  UtmLink,
} from "@/lib/types";

export type { Tenant } from "@/lib/types";

// ---- Tenancy (SaaS T1) --------------------------------------------------------
//
// Tenants are the isolation boundary. Company-scoped entities derive their
// tenant through their company; the helpers here are the ONLY place that
// mapping lives. List functions below take a REQUIRED tenantId so an unscoped
// (cross-tenant) read is a compile error, not a code-review hope.

export async function listTenants(): Promise<Tenant[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listTenants();
  return [...db().tenants].sort((a, b) => a.name.localeCompare(b.name));
}
export async function getTenant(tenantId: string): Promise<Tenant | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getTenant(tenantId);
  return db().tenants.find((t) => t.id === tenantId);
}
export async function createTenant(
  input: Omit<Tenant, "id" | "createdAt" | "updatedAt">,
): Promise<Tenant> {
  if (isSupabaseConfigured()) return supabaseRepo.createTenant(input);
  const t = now();
  const tenant: Tenant = { ...input, id: id("t"), createdAt: t, updatedAt: t };
  db().tenants.push(tenant);
  return tenant;
}
// T4 billing: plan changes (demo mode + Stripe webhook) and Stripe linkage.
export async function updateTenant(
  tenantId: string,
  patch: Partial<Omit<Tenant, "id" | "createdAt">>,
): Promise<Tenant | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateTenant(tenantId, patch);
  const tenant = db().tenants.find((t) => t.id === tenantId);
  if (!tenant) return undefined;
  Object.assign(tenant, patch, { updatedAt: now() });
  return tenant;
}
// Webhook lookup — Stripe events carry the customer id, not our tenant id.
export async function getTenantByStripeCustomer(
  customerId: string,
): Promise<Tenant | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getTenantByStripeCustomer(customerId);
  return db().tenants.find((t) => t.stripeCustomerId === customerId);
}

// ---- Terms & Conditions (versioned, platform-level) + acceptance --------------
//
// Platform-global — NOT tenant-scoped. currentTerms = the active version with
// the highest number; publishing bumps the number, deactivates prior versions,
// and thereby forces every user to re-accept (the /accept-terms gate checks
// hasAcceptedTerms(userId, currentVersion)).
export async function listTermsVersions(): Promise<TermsVersion[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listTermsVersions();
  return [...db().termsVersions].sort((a, b) => b.version - a.version);
}
export async function currentTerms(): Promise<TermsVersion | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.currentTerms();
  return db()
    .termsVersions.filter((v) => v.active)
    .sort((a, b) => b.version - a.version)[0];
}
export async function publishTermsVersion(
  input: Omit<TermsVersion, "id" | "version" | "active" | "publishedAt">,
): Promise<TermsVersion> {
  if (isSupabaseConfigured()) return supabaseRepo.publishTermsVersion(input);
  const s = db();
  const nextVersion = s.termsVersions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
  // Insert the new active version FIRST, then supersede the OTHERS — so a failed
  // insert can never leave zero active versions (which would disable the gate).
  const rec: TermsVersion = {
    ...input,
    id: id("tv"),
    version: nextVersion,
    active: true,
    publishedAt: now(),
  };
  s.termsVersions.push(rec);
  for (const v of s.termsVersions) if (v.id !== rec.id) v.active = false;
  return rec;
}
export async function recordTermsAcceptance(
  input: Omit<TermsAcceptance, "id" | "acceptedAt">,
): Promise<TermsAcceptance> {
  if (isSupabaseConfigured()) return supabaseRepo.recordTermsAcceptance(input);
  const rec: TermsAcceptance = { ...input, id: id("ta"), acceptedAt: now() };
  db().termsAcceptances.push(rec);
  return rec;
}
export async function hasAcceptedTerms(userId: string, version: number): Promise<boolean> {
  if (isSupabaseConfigured()) return supabaseRepo.hasAcceptedTerms(userId, version);
  return db().termsAcceptances.some((a) => a.userId === userId && a.version === version);
}
export async function updateTermsVersion(
  id: string,
  patch: Partial<TermsVersion>,
): Promise<TermsVersion | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateTermsVersion(id, patch);
  const rec = db().termsVersions.find((v) => v.id === id);
  if (!rec) return undefined;
  Object.assign(rec, patch);
  return rec;
}
// Every ACTIVE user who is a member of an ACTIVE tenant — the recipients of a
// platform-wide notice (e.g. a Terms update). Deduped by email (identity is
// global). Platform-level (svc under Supabase); no tenant scoping — this IS the
// cross-tenant recipient list, only used for platform notices.
export async function listActiveRecipients(): Promise<{ email: string; name: string }[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listActiveRecipients();
  const s = db();
  const activeTenantIds = new Set(s.tenants.filter((t) => t.status === "active").map((t) => t.id));
  const memberUserIds = new Set(
    s.tenantMembers.filter((m) => activeTenantIds.has(m.tenantId)).map((m) => m.userId),
  );
  const byEmail = new Map<string, { email: string; name: string }>();
  for (const u of s.users) {
    if (u.active && memberUserIds.has(u.id) && !byEmail.has(u.email)) {
      byEmail.set(u.email, { email: u.email, name: u.name });
    }
  }
  return [...byEmail.values()];
}

export async function membershipsForUser(userId: string): Promise<TenantMember[]> {
  if (isSupabaseConfigured()) return supabaseRepo.membershipsForUser(userId);
  return db().tenantMembers.filter((m) => m.userId === userId);
}
export async function getMembership(
  tenantId: string,
  userId: string,
): Promise<TenantMember | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getMembership(tenantId, userId);
  return db().tenantMembers.find(
    (m) => m.tenantId === tenantId && m.userId === userId,
  );
}
export async function addMembership(
  input: Omit<TenantMember, "createdAt">,
): Promise<TenantMember> {
  if (isSupabaseConfigured()) return supabaseRepo.addMembership(input);
  const existing = await getMembership(input.tenantId, input.userId);
  if (existing) return existing;
  const member: TenantMember = { ...input, createdAt: now() };
  db().tenantMembers.push(member);
  return member;
}
export async function listMembers(tenantId: string): Promise<TenantMember[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listMembers(tenantId);
  return db().tenantMembers.filter((m) => m.tenantId === tenantId);
}

// The company-id set of one tenant — the derivation every tenant-scoped list
// function below uses. Internal fast path.
function tenantCompanyIdSet(tenantId: string): Set<string> {
  return new Set(
    db()
      .companies.filter((c) => c.tenantId === tenantId)
      .map((c) => c.id),
  );
}

// ---- Users ------------------------------------------------------------------

// Users of ONE tenant (via membership). Identity is global; listing is not.
export async function listUsers(tenantId: string): Promise<User[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listUsers(tenantId);
  const memberIds = new Set(
    db().tenantMembers.filter((m) => m.tenantId === tenantId).map((m) => m.userId),
  );
  return db()
    .users.filter((u) => memberIds.has(u.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function getUser(userId: string): Promise<User | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getUser(userId);
  return db().users.find((u) => u.id === userId);
}
export async function getUserByEmail(email: string): Promise<User | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getUserByEmail(email);
  const e = email.trim().toLowerCase();
  return db().users.find((u) => u.email.toLowerCase() === e);
}
export async function createUser(input: {
  email: string;
  name: string;
  role: User["role"];
}): Promise<User> {
  if (isSupabaseConfigured()) return supabaseRepo.createUser(input);
  const user: User = {
    id: id("u"),
    email: input.email.trim(),
    name: input.name.trim(),
    role: input.role,
    active: true,
    createdAt: now(),
  };
  db().users.push(user);
  return user;
}
export async function setUserActive(userId: string, active: boolean): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.setUserActive(userId, active);
  const u = await getUser(userId);
  if (u) u.active = active;
}
// Assign a granular role title (§9) on the user's TENANT MEMBERSHIP and sync
// the membership tier to match. Owner stays owner regardless of title.
export async function setMemberRoleTitle(
  tenantId: string,
  userId: string,
  roleTitle: RoleTitle,
): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.setMemberRoleTitle(tenantId, userId, roleTitle);
  const m = await getMembership(tenantId, userId);
  if (!m) return;
  m.roleTitle = roleTitle;
  if (m.role !== "owner") {
    m.role = ROLE_TITLE_TIER[roleTitle] === "user" ? "member" : "admin";
  }
}

/** Set additive capability strings on a membership (migration 0036). */
export async function setMemberCapabilities(
  tenantId: string,
  userId: string,
  capabilities: string[],
): Promise<void> {
  if (isSupabaseConfigured()) {
    return supabaseRepo.setMemberCapabilities(tenantId, userId, capabilities);
  }
  const m = await getMembership(tenantId, userId);
  if (!m) return;
  m.capabilities = [...capabilities];
}

// ---- Company access ---------------------------------------------------------

export async function accessForUser(userId: string): Promise<CompanyAccess[]> {
  if (isSupabaseConfigured()) return supabaseRepo.accessForUser(userId);
  return db().access.filter((a) => a.userId === userId);
}
export async function usersForCompany(companyId: string): Promise<User[]> {
  if (isSupabaseConfigured()) return supabaseRepo.usersForCompany(companyId);
  const ids = new Set(
    db().access.filter((a) => a.companyId === companyId).map((a) => a.userId),
  );
  return db().users.filter((u) => ids.has(u.id));
}
export async function grantAccess(userId: string, companyId: string): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.grantAccess(userId, companyId);
  const exists = db().access.some(
    (a) => a.userId === userId && a.companyId === companyId,
  );
  if (!exists) db().access.push({ userId, companyId });
}
export async function revokeAccess(userId: string, companyId: string): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.revokeAccess(userId, companyId);
  const store = db();
  store.access = store.access.filter(
    (a) => !(a.userId === userId && a.companyId === companyId),
  );
}

// ---- Sessions ---------------------------------------------------------------

export async function createSessionRecord(
  userId: string,
  tenantId?: string,
): Promise<Session> {
  const s: Session = {
    token: id("sess"),
    userId,
    tenantId,
    createdAt: now(),
    revoked: false,
  };
  db().sessions.push(s);
  return s;
}
export async function getSessionByToken(token: string): Promise<Session | undefined> {
  return db().sessions.find((s) => s.token === token && !s.revoked);
}
export async function revokeSession(token: string): Promise<void> {
  const s = db().sessions.find((x) => x.token === token);
  if (s) s.revoked = true;
}
export async function revokeUserSessions(userId: string): Promise<void> {
  for (const s of db().sessions) if (s.userId === userId) s.revoked = true;
}

// ---- Companies --------------------------------------------------------------

export async function listCompanies(tenantId: string): Promise<Company[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCompanies(tenantId);
  return db()
    .companies.filter((c) => c.tenantId === tenantId)
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function getCompany(companyId: string): Promise<Company | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCompany(companyId);
  return db().companies.find((c) => c.id === companyId);
}
export async function createCompany(input: {
  tenantId: string;
  name: string;
  createdBy: string;
}): Promise<Company> {
  if (isSupabaseConfigured()) return supabaseRepo.createCompany(input);
  const t = now();
  const company: Company = {
    id: id("c"),
    tenantId: input.tenantId,
    name: input.name.trim(),
    status: "draft_onboarding",
    profile: {
      serviceAreas: [],
      services: [],
      callsToAction: [],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
    },
    documents: [],
    createdBy: input.createdBy,
    createdAt: t,
    updatedAt: t,
  };
  db().companies.push(company);
  return company;
}
export async function updateCompany(
  companyId: string,
  patch: Partial<Company>,
): Promise<Company | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateCompany(companyId, patch);
  const c = await getCompany(companyId);
  if (!c) return undefined;
  Object.assign(c, patch, { updatedAt: now() });
  return c;
}

// ---- Marketing requests -----------------------------------------------------

export async function listRequests(tenantId: string): Promise<MarketingRequest[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listRequests(tenantId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .requests.filter((r) => ids.has(r.companyId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getRequest(reqId: string): Promise<MarketingRequest | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getRequest(reqId);
  return db().requests.find((r) => r.id === reqId);
}
export async function createRequest(
  input: Omit<
    MarketingRequest,
    "id" | "status" | "statusHistory" | "createdAt" | "updatedAt"
  >,
): Promise<MarketingRequest> {
  if (isSupabaseConfigured()) return supabaseRepo.createRequest(input);
  const t = now();
  const req: MarketingRequest = {
    ...input,
    id: id("r"),
    status: "submitted",
    statusHistory: [{ status: "submitted", at: t, byId: input.requesterId }],
    createdAt: t,
    updatedAt: t,
  };
  db().requests.push(req);
  return req;
}
export async function advanceRequest(
  reqId: string,
  status: MarketingRequest["status"],
  byId: string,
  note?: string,
): Promise<MarketingRequest | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.advanceRequest(reqId, status, byId, note);
  const r = await getRequest(reqId);
  if (!r) return undefined;
  r.status = status;
  r.updatedAt = now();
  r.statusHistory.push({ status, at: r.updatedAt, byId, note });
  return r;
}

// ---- Content ----------------------------------------------------------------

export async function listContent(tenantId: string): Promise<ContentItem[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listContent(tenantId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .content.filter((c) => ids.has(c.companyId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getContent(contentId: string): Promise<ContentItem | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getContent(contentId);
  return db().content.find((c) => c.id === contentId);
}
export async function createContent(
  input: Omit<ContentItem, "id" | "createdAt" | "updatedAt" | "versions">,
): Promise<ContentItem> {
  if (isSupabaseConfigured()) return supabaseRepo.createContent(input);
  const t = now();
  const item: ContentItem = {
    ...input,
    id: id("ct"),
    versions: [],
    createdAt: t,
    updatedAt: t,
  };
  db().content.push(item);
  return item;
}
export async function updateContent(
  contentId: string,
  patch: Partial<ContentItem>,
): Promise<ContentItem | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateContent(contentId, patch);
  const c = await getContent(contentId);
  if (!c) return undefined;
  Object.assign(c, patch, { updatedAt: now() });
  return c;
}

// ---- Social responses -------------------------------------------------------

export async function listSocial(tenantId: string): Promise<SocialResponseDraft[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listSocial(tenantId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .socialResponses.filter((s) => ids.has(s.companyId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getSocial(socialId: string): Promise<SocialResponseDraft | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getSocial(socialId);
  return db().socialResponses.find((s) => s.id === socialId);
}
export async function createSocial(
  input: Omit<SocialResponseDraft, "id" | "createdAt">,
): Promise<SocialResponseDraft> {
  if (isSupabaseConfigured()) return supabaseRepo.createSocial(input);
  const item: SocialResponseDraft = { ...input, id: id("sr"), createdAt: now() };
  db().socialResponses.push(item);
  return item;
}
export async function updateSocial(
  socialId: string,
  patch: Partial<SocialResponseDraft>,
): Promise<SocialResponseDraft | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateSocial(socialId, patch);
  const s = await getSocial(socialId);
  if (!s) return undefined;
  Object.assign(s, patch);
  return s;
}

// ---- Tenant data export + erasure (GDPR / Privacy Act, T7 subset) --------------
//
// A tenant owns all data derived from its companies plus its tenant-keyed rows.
// Platform-library rows (tenantId null) belong to the platform, never a tenant.
// Users are GLOBAL identities: erasure removes this tenant's memberships/access
// and only deletes a user record when they have no membership in any OTHER
// tenant (so a shared consultant survives).

function tenantScope(tenantId: string): { companyIds: Set<string> } {
  return {
    companyIds: new Set(
      db().companies.filter((c) => c.tenantId === tenantId).map((c) => c.id),
    ),
  };
}

export async function exportTenantData(tenantId: string): Promise<Record<string, unknown>> {
  if (isSupabaseConfigured()) return supabaseRepo.exportTenantData(tenantId);
  const s = db();
  const { companyIds } = tenantScope(tenantId);
  const byCompany = <T extends { companyId: string }>(a: T[]) => a.filter((x) => companyIds.has(x.companyId));
  const byTenant = <T extends { tenantId?: string | null }>(a: T[]) => a.filter((x) => x.tenantId === tenantId);
  const memberIds = new Set(s.tenantMembers.filter((m) => m.tenantId === tenantId).map((m) => m.userId));

  return {
    exportedAt: now(),
    tenant: s.tenants.find((t) => t.id === tenantId),
    members: s.tenantMembers.filter((m) => m.tenantId === tenantId),
    users: s.users.filter((u) => memberIds.has(u.id)),
    companyAccess: s.access.filter((a) => companyIds.has(a.companyId)),
    companies: s.companies.filter((c) => c.tenantId === tenantId),
    requests: byCompany(s.requests),
    content: byCompany(s.content),
    contentComments: byCompany(s.contentComments),
    socialResponses: byCompany(s.socialResponses),
    socialMentions: byCompany(s.socialMentions),
    knowledgeDocs: byCompany(s.knowledgeDocs),
    services: byCompany(s.services),
    localProfiles: byCompany(s.localProfiles),
    knowledgeGaps: byCompany(s.gaps),
    consents: byCompany(s.consents),
    evidence: byCompany(s.evidence),
    approvedClaims: byCompany(s.claims),
    approvedResponses: byTenant(s.responses),
    campaigns: byCompany(s.campaigns),
    campaignItems: byCompany(s.campaignItems),
    offers: byCompany(s.offers),
    promptTemplates: byTenant(s.promptTemplates),
    scheduledPosts: byCompany(s.scheduledPosts),
    // Never export the encrypted publishing tokens themselves.
    integrations: byCompany(s.integrations).map(({ encryptedToken: _t, ...rest }) => rest),
    connectInvites: byTenant(s.connectInvites),
    publishLogs: byCompany(s.publishLogs),
    publishingControls: s.publishingControls.filter((p) => p.tenantId === tenantId),
    utmLinks: byCompany(s.utmLinks),
    // Module 6 paid advertising — the delegated ad-account TOKEN is never
    // exported (same rule as publishing integrations).
    adAccounts: byCompany(s.adAccounts).map(({ encryptedToken: _t, ...rest }) => rest),
    adBudgets: byCompany(s.adBudgets),
    adCampaigns: byCompany(s.adCampaigns),
    audienceSegments: byCompany(s.audienceSegments),
    leads: byCompany(s.leads),
    emailTemplates: byCompany(s.emailTemplates ?? []),
    emailSubscribers: byCompany(s.emailSubscribers ?? []),
    emailCampaigns: byCompany(s.emailCampaigns ?? []),
    funnelAbExperiments: byCompany(s.funnelAbExperiments ?? []),
    campaignExperiments: byCompany(s.campaignExperiments ?? []),
    companyEntitlements: byCompany(s.companyEntitlements),
    photoShoots: byCompany(s.photoShoots),
    photographerProfiles: s.photographerProfiles.filter(
      (p) => p.tenantId === null || p.tenantId === tenantId,
    ),
    photographerPackages: s.photographerPackages.filter((pkg) => {
      const prof = s.photographerProfiles.find((p) => p.id === pkg.photographerId);
      return prof && (prof.tenantId === null || prof.tenantId === tenantId);
    }),
    photoMarketplaceBookings: byCompany(s.photoMarketplaceBookings),
    menuDesigns: byCompany(s.menuDesigns),
    orderMenuItems: byCompany(s.orderMenuItems),
    orderingSettings: byCompany(s.orderingSettings),
    restaurantOrders: byCompany(s.restaurantOrders),
    bookingServicePeriods: byCompany(s.bookingServicePeriods ?? []),
    bookingSettings: byCompany(s.bookingSettings ?? []),
    reservations: byCompany(s.reservations ?? []),
    recommendations: byCompany(s.recommendations),
    tasks: byCompany(s.tasks),
    aiMosOpportunities: byTenant(s.aiMosOpportunities),
    aiMosSignalRuns: byTenant(s.aiMosSignalRuns),
    calendarAssistSuggestions: byTenant(s.calendarAssistSuggestions),
    securitySettings: s.security.filter((x) => x.tenantId === tenantId),
    legalHolds: byTenant(s.legalHolds),
    assets: byCompany(s.assets),
    brandTemplates: byTenant(s.brandTemplates),
    automationSettings: s.automation.filter((x) => x.tenantId === tenantId),
    automationRuns: byTenant(s.automationRuns),
    aiRuns: byTenant(s.aiRuns),
    // Terms acceptances made in this tenant's context (platform terms_versions
    // themselves are global and are not part of a tenant export).
    termsAcceptances: byTenant(s.termsAcceptances),
    auditLog: s.audit.filter((a) => a.tenantId === tenantId),
  };
}

export async function purgeTenant(tenantId: string): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.purgeTenant(tenantId);
  const s = db();
  const { companyIds } = tenantScope(tenantId);
  const keepCompany = <T extends { companyId: string }>(a: T[]) => a.filter((x) => !companyIds.has(x.companyId));
  const keepTenant = <T extends { tenantId?: string | null }>(a: T[]) => a.filter((x) => x.tenantId !== tenantId);

  s.requests = keepCompany(s.requests);
  s.content = keepCompany(s.content);
  s.contentComments = keepCompany(s.contentComments);
  s.socialResponses = keepCompany(s.socialResponses);
  s.socialMentions = keepCompany(s.socialMentions);
  s.knowledgeDocs = keepCompany(s.knowledgeDocs);
  s.services = keepCompany(s.services);
  s.localProfiles = keepCompany(s.localProfiles);
  s.gaps = keepCompany(s.gaps);
  s.consents = keepCompany(s.consents);
  s.evidence = keepCompany(s.evidence);
  s.claims = keepCompany(s.claims);
  s.campaigns = keepCompany(s.campaigns);
  s.campaignItems = keepCompany(s.campaignItems);
  s.offers = keepCompany(s.offers);
  s.scheduledPosts = keepCompany(s.scheduledPosts);
  s.integrations = keepCompany(s.integrations);
  s.connectInvites = keepTenant(s.connectInvites);
  s.apiKeys = keepTenant(s.apiKeys);
  s.partnerWebhooks = keepTenant(s.partnerWebhooks);
  s.publishLogs = keepCompany(s.publishLogs);
  s.utmLinks = keepCompany(s.utmLinks);
  s.adAccounts = keepCompany(s.adAccounts);
  s.adBudgets = keepCompany(s.adBudgets);
  s.adCampaigns = keepCompany(s.adCampaigns);
  s.audienceSegments = keepCompany(s.audienceSegments);
  s.leads = keepCompany(s.leads);
  s.emailTemplates = keepCompany(s.emailTemplates ?? []);
  s.emailSubscribers = keepCompany(s.emailSubscribers ?? []);
  s.emailCampaigns = keepCompany(s.emailCampaigns ?? []);
  s.crmContacts = keepCompany(s.crmContacts ?? []);
  s.crmSegments = keepCompany(s.crmSegments ?? []);
  s.crmInteractions = keepCompany(s.crmInteractions ?? []);
  s.funnelJourneys = keepCompany(s.funnelJourneys ?? []);
  s.conversionFunnels = keepCompany(s.conversionFunnels ?? []);
  s.funnelLandingPages = keepCompany(s.funnelLandingPages ?? []);
  s.funnelAbExperiments = keepCompany(s.funnelAbExperiments ?? []);
  s.campaignExperiments = keepCompany(s.campaignExperiments ?? []);
  s.smsSubscribers = keepCompany(s.smsSubscribers ?? []);
  s.smsCampaigns = keepCompany(s.smsCampaigns ?? []);
  s.smsCompanySettings = keepCompany(s.smsCompanySettings ?? []);
  s.marketingWorkflows = keepTenant(s.marketingWorkflows ?? []);
  s.workflowDispatchLogs = keepCompany(s.workflowDispatchLogs ?? []);
  s.marketingWorkflowSettings = keepCompany(s.marketingWorkflowSettings ?? []);
  s.cmsPages = keepCompany(s.cmsPages ?? []);
  s.cmsPageVersions = keepCompany(s.cmsPageVersions ?? []);
  s.cmsSeoMetadata = keepCompany(s.cmsSeoMetadata ?? []);
  s.cmsUpdateRequests = keepCompany(s.cmsUpdateRequests ?? []);
  s.ragKnowledgeSources = keepCompany(s.ragKnowledgeSources ?? []);
  s.ragKnowledgeVersions = keepCompany(s.ragKnowledgeVersions ?? []);
  s.campaignPlanVersions = keepCompany(s.campaignPlanVersions ?? []);
  s.campaignBuilderRuns = keepCompany(s.campaignBuilderRuns ?? []);
  s.campaignDraftScheduleItems = keepCompany(s.campaignDraftScheduleItems ?? []);
  s.loyaltyPrograms = keepCompany(s.loyaltyPrograms ?? []);
  s.loyaltyTiers = keepCompany(s.loyaltyTiers ?? []);
  s.loyaltyMembers = keepCompany(s.loyaltyMembers ?? []);
  s.loyaltyCoupons = keepCompany(s.loyaltyCoupons ?? []);
  s.loyaltyReferrals = keepCompany(s.loyaltyReferrals ?? []);
  s.loyaltyRedemptions = keepCompany(s.loyaltyRedemptions ?? []);
  s.companyEntitlements = keepCompany(s.companyEntitlements);
  s.photoShoots = keepCompany(s.photoShoots);
  s.photoMarketplaceBookings = keepCompany(s.photoMarketplaceBookings);
  const purgedPhotographerIds = new Set(
    s.photographerProfiles.filter((p) => p.tenantId === tenantId).map((p) => p.id),
  );
  s.photographerPackages = s.photographerPackages.filter(
    (pkg) => !purgedPhotographerIds.has(pkg.photographerId),
  );
  s.photographerProfiles = s.photographerProfiles.filter((p) => p.tenantId !== tenantId);
  s.menuDesigns = keepCompany(s.menuDesigns);
  s.orderMenuItems = keepCompany(s.orderMenuItems);
  s.orderingSettings = keepCompany(s.orderingSettings);
  s.restaurantOrders = keepCompany(s.restaurantOrders);
  s.bookingServicePeriods = keepCompany(s.bookingServicePeriods ?? []);
  s.bookingSettings = keepCompany(s.bookingSettings ?? []);
  s.reservations = keepCompany(s.reservations ?? []);
  s.recommendations = keepCompany(s.recommendations);
  s.recommendationDismissHistory = keepCompany(s.recommendationDismissHistory);
  s.tasks = keepCompany(s.tasks);
  s.aiMosOpportunities = keepTenant(s.aiMosOpportunities);
  s.aiMosSignalRuns = keepTenant(s.aiMosSignalRuns);
  s.calendarAssistSuggestions = keepTenant(s.calendarAssistSuggestions);
  s.privacyRequests = keepCompany(s.privacyRequests ?? []);
  s.managedDeliveryRuns = keepCompany(s.managedDeliveryRuns ?? []);
  s.companyCreditWallets = keepCompany(s.companyCreditWallets ?? []);
  s.companyCreditLedger = keepCompany(s.companyCreditLedger ?? []);
  s.aiCampaignRecommendations = keepCompany(s.aiCampaignRecommendations ?? []);
  s.aiOrchestrationRuns = keepCompany(s.aiOrchestrationRuns ?? []);
  s.approvalPolicies = keepTenant(s.approvalPolicies ?? []);
  s.campaignPerformanceSnapshots = keepCompany(s.campaignPerformanceSnapshots ?? []);
  s.assets = keepCompany(s.assets);
  // Tenant-keyed rows (platform-library null rows survive).
  s.responses = keepTenant(s.responses);
  s.brandTemplates = keepTenant(s.brandTemplates);
  s.promptTemplates = keepTenant(s.promptTemplates);
  s.legalHolds = keepTenant(s.legalHolds);
  s.automationRuns = keepTenant(s.automationRuns);
  s.aiRuns = keepTenant(s.aiRuns);
  s.termsAcceptances = keepTenant(s.termsAcceptances);
  s.audit = s.audit.filter((a) => a.tenantId !== tenantId);
  s.publishingControls = s.publishingControls.filter((p) => p.tenantId !== tenantId);
  s.security = s.security.filter((x) => x.tenantId !== tenantId);
  s.automation = s.automation.filter((x) => x.tenantId !== tenantId);
  s.access = keepCompany(s.access);
  s.companies = s.companies.filter((c) => c.tenantId !== tenantId);

  // Memberships + orphaned global identities.
  const wasMember = new Set(
    s.tenantMembers.filter((m) => m.tenantId === tenantId).map((m) => m.userId),
  );
  s.tenantMembers = s.tenantMembers.filter((m) => m.tenantId !== tenantId);
  const stillMember = new Set(s.tenantMembers.map((m) => m.userId));
  const orphans = new Set([...wasMember].filter((uid) => !stillMember.has(uid)));
  s.users = s.users.filter((u) => !orphans.has(u.id));
  s.sessions = s.sessions.filter((sess) => !orphans.has(sess.userId));
  s.tenants = s.tenants.filter((t) => t.id !== tenantId);
}

// ---- Collaborative comments on content drafts ---------------------------------

// CONTRACT: keyed by contentId, which already resolves to exactly one company/
// tenant. Callers MUST have authorised that content first (getContent +
// canAccessCompany, assertCompanyAccess, or a token bound to the content) — this
// fn does not re-check, so never call it with a client-supplied, unresolved id.
export async function listContentComments(contentId: string): Promise<ContentComment[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listContentComments(contentId);
  return db()
    .contentComments.filter((c) => c.contentId === contentId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export async function addContentComment(
  input: Omit<ContentComment, "id" | "createdAt">,
): Promise<ContentComment> {
  if (isSupabaseConfigured()) return supabaseRepo.addContentComment(input);
  const item: ContentComment = { ...input, id: id("cm"), createdAt: now() };
  db().contentComments.push(item);
  return item;
}

// ---- Unified social inbox (ingested mentions) ---------------------------------

export async function listSocialMentions(
  tenantId: string,
  status?: SocialMention["status"],
): Promise<SocialMention[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listSocialMentions(tenantId, status);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .socialMentions.filter(
      (m) => ids.has(m.companyId) && (!status || m.status === status),
    )
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}
export async function getSocialMention(mentionId: string): Promise<SocialMention | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getSocialMention(mentionId);
  return db().socialMentions.find((m) => m.id === mentionId);
}
export async function createSocialMention(
  input: Omit<SocialMention, "id" | "createdAt">,
): Promise<SocialMention> {
  if (isSupabaseConfigured()) return supabaseRepo.createSocialMention(input);
  // Dedup on (company, platform, externalId) so re-ingesting the same feed
  // doesn't pile up duplicates.
  if (input.externalId) {
    const existing = db().socialMentions.find(
      (m) =>
        m.companyId === input.companyId &&
        m.platform === input.platform &&
        m.externalId === input.externalId,
    );
    if (existing) return existing;
  }
  const item: SocialMention = { ...input, id: id("sm"), createdAt: now() };
  db().socialMentions.push(item);
  return item;
}
export async function updateSocialMention(
  mentionId: string,
  patch: Partial<SocialMention>,
): Promise<SocialMention | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateSocialMention(mentionId, patch);
  const m = await getSocialMention(mentionId);
  if (!m) return undefined;
  Object.assign(m, patch);
  return m;
}

// ---- Phase 2: Brand Brain -----------------------------------------------------

export async function listKnowledgeDocs(
  companyId: string,
  includeArchived = false,
  includeDrafts = false,
): Promise<KnowledgeDocument[]> {
  if (isSupabaseConfigured()) {
    return supabaseRepo.listKnowledgeDocs(companyId, includeArchived, includeDrafts);
  }
  return db()
    .knowledgeDocs.filter((d) => {
      if (d.companyId !== companyId) return false;
      if (d.status === "archived") return includeArchived;
      if (d.status === "draft") return includeDrafts;
      return d.status === "approved";
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getKnowledgeDoc(docId: string): Promise<KnowledgeDocument | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getKnowledgeDoc(docId);
  return db().knowledgeDocs.find((d) => d.id === docId);
}
export async function createKnowledgeDoc(
  input: Omit<
    KnowledgeDocument,
    "id" | "version" | "previousVersions" | "status" | "createdAt" | "updatedAt"
  >,
  status: KnowledgeDocument["status"] = "approved",
): Promise<KnowledgeDocument> {
  if (isSupabaseConfigured()) return supabaseRepo.createKnowledgeDoc(input, status);
  const t = now();
  const doc: KnowledgeDocument = {
    ...input,
    id: id("kd"),
    status,
    version: 1,
    previousVersions: [],
    createdAt: t,
    updatedAt: t,
  };
  db().knowledgeDocs.push(doc);
  return doc;
}
// Replacing content keeps the prior body as a version (master prompt P2:
// document versioning + archive old documents).
export async function reviseKnowledgeDoc(
  docId: string,
  patch: { title: string; content: string },
  byId: string,
): Promise<KnowledgeDocument | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.reviseKnowledgeDoc(docId, patch, byId);
  const doc = await getKnowledgeDoc(docId);
  if (!doc) return undefined;
  doc.previousVersions.push({
    title: doc.title,
    content: doc.content,
    version: doc.version,
    replacedAt: now(),
    byId,
  });
  doc.title = patch.title;
  doc.content = patch.content;
  doc.version += 1;
  doc.updatedAt = now();
  return doc;
}
export async function setKnowledgeDocStatus(
  docId: string,
  status: KnowledgeDocument["status"],
): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.setKnowledgeDocStatus(docId, status);
  const doc = await getKnowledgeDoc(docId);
  if (doc) {
    doc.status = status;
    doc.updatedAt = now();
  }
}

export async function listServices(companyId: string, activeOnly = true): Promise<ServiceRecord[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listServices(companyId, activeOnly);
  return db()
    .services.filter(
      (s) => s.companyId === companyId && (!activeOnly || s.active),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function getService(serviceId: string): Promise<ServiceRecord | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getService(serviceId);
  return db().services.find((s) => s.id === serviceId);
}
export async function createService(
  input: Omit<ServiceRecord, "id" | "createdAt" | "updatedAt">,
): Promise<ServiceRecord> {
  if (isSupabaseConfigured()) return supabaseRepo.createService(input);
  const t = now();
  const svc: ServiceRecord = { ...input, id: id("svc"), createdAt: t, updatedAt: t };
  db().services.push(svc);
  return svc;
}
export async function updateService(
  serviceId: string,
  patch: Partial<ServiceRecord>,
): Promise<ServiceRecord | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateService(serviceId, patch);
  const s = await getService(serviceId);
  if (!s) return undefined;
  Object.assign(s, patch, { updatedAt: now() });
  return s;
}

export async function getLocalProfile(companyId: string): Promise<LocalAreaProfile | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getLocalProfile(companyId);
  return db().localProfiles.find((p) => p.companyId === companyId);
}
export async function upsertLocalProfile(
  profile: Omit<LocalAreaProfile, "updatedAt">,
): Promise<LocalAreaProfile> {
  if (isSupabaseConfigured()) return supabaseRepo.upsertLocalProfile(profile);
  const existing = await getLocalProfile(profile.companyId);
  if (existing) {
    Object.assign(existing, profile, { updatedAt: now() });
    return existing;
  }
  const created: LocalAreaProfile = { ...profile, updatedAt: now() };
  db().localProfiles.push(created);
  return created;
}

export async function listGaps(filter: {
  companyId?: string;
  requestId?: string;
  openOnly?: boolean;
}): Promise<KnowledgeGap[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listGaps(filter);
  return db()
    .gaps.filter(
      (g) =>
        (!filter.companyId || g.companyId === filter.companyId) &&
        (!filter.requestId || g.requestId === filter.requestId) &&
        (!filter.openOnly || g.status === "open"),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getGap(gapId: string): Promise<KnowledgeGap | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getGap(gapId);
  return db().gaps.find((g) => g.id === gapId);
}
export async function createGap(
  input: Omit<KnowledgeGap, "id" | "status" | "createdAt">,
): Promise<KnowledgeGap> {
  if (isSupabaseConfigured()) return supabaseRepo.createGap(input);
  const gap: KnowledgeGap = {
    ...input,
    id: id("gap"),
    status: "open",
    createdAt: now(),
  };
  db().gaps.push(gap);
  return gap;
}
export async function answerGap(
  gapId: string,
  answer: string,
  byId: string,
): Promise<KnowledgeGap | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.answerGap(gapId, answer, byId);
  const gap = await getGap(gapId);
  if (!gap) return undefined;
  gap.status = "answered";
  gap.answer = answer;
  gap.answeredById = byId;
  gap.answeredAt = now();
  return gap;
}

// ---- Phase 3: Governance --------------------------------------------------------

export async function listConsents(companyId: string): Promise<ConsentRecord[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listConsents(companyId);
  return db()
    .consents.filter((c) => c.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getConsent(consentId: string): Promise<ConsentRecord | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getConsent(consentId);
  return db().consents.find((c) => c.id === consentId);
}
export async function createConsent(
  input: Omit<ConsentRecord, "id" | "createdAt">,
): Promise<ConsentRecord> {
  if (isSupabaseConfigured()) return supabaseRepo.createConsent(input);
  const rec: ConsentRecord = { ...input, id: id("cons"), createdAt: now() };
  db().consents.push(rec);
  return rec;
}
export async function withdrawConsent(consentId: string): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.withdrawConsent(consentId);
  const rec = db().consents.find((c) => c.id === consentId);
  if (rec) rec.withdrawn = true;
}
// A consent record is usable only when obtained, not withdrawn, not expired.
export async function validConsents(companyId: string, nowIso = now()): Promise<ConsentRecord[]> {
  return (await listConsents(companyId)).filter(
    (c) =>
      c.consentObtained &&
      !c.withdrawn &&
      (!c.expiryDate || c.expiryDate >= nowIso.slice(0, 10)),
  );
}

export async function listEvidence(companyId: string): Promise<EvidenceRecord[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listEvidence(companyId);
  return db()
    .evidence.filter((e) => e.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function createEvidence(
  input: Omit<EvidenceRecord, "id" | "createdAt">,
): Promise<EvidenceRecord> {
  if (isSupabaseConfigured()) return supabaseRepo.createEvidence(input);
  const rec: EvidenceRecord = { ...input, id: id("ev"), createdAt: now() };
  db().evidence.push(rec);
  return rec;
}

export async function listClaims(companyId: string, activeOnly = true): Promise<ApprovedClaim[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listClaims(companyId, activeOnly);
  return db()
    .claims.filter(
      (c) => c.companyId === companyId && (!activeOnly || c.active),
    )
    .sort((a, b) => a.claimText.localeCompare(b.claimText));
}
export async function createClaim(
  input: Omit<ApprovedClaim, "id" | "createdAt">,
): Promise<ApprovedClaim> {
  if (isSupabaseConfigured()) return supabaseRepo.createClaim(input);
  const rec: ApprovedClaim = { ...input, id: id("clm"), createdAt: now() };
  db().claims.push(rec);
  return rec;
}
export async function setClaimActive(claimId: string, active: boolean): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.setClaimActive(claimId, active);
  const rec = db().claims.find((c) => c.id === claimId);
  if (rec) rec.active = active;
}
export async function getClaim(claimId: string): Promise<ApprovedClaim | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getClaim(claimId);
  return db().claims.find((c) => c.id === claimId);
}

// Approved responses visible to a tenant: its own (tenant-wide + company-
// scoped) plus the read-only PLATFORM library (tenantId null).
export async function listResponses(
  tenantId: string,
  companyId?: string,
  activeOnly = true,
): Promise<ApprovedResponse[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listResponses(tenantId, companyId, activeOnly);
  return db()
    .responses.filter(
      (r) =>
        (!activeOnly || r.active) &&
        (r.tenantId === null || r.tenantId === tenantId) &&
        (r.companyId === null || !companyId || r.companyId === companyId),
    )
    .sort((a, b) => a.category.localeCompare(b.category));
}
export async function createResponse(
  input: Omit<ApprovedResponse, "id" | "createdAt">,
): Promise<ApprovedResponse> {
  if (isSupabaseConfigured()) return supabaseRepo.createResponse(input);
  const rec: ApprovedResponse = { ...input, id: id("resp"), createdAt: now() };
  db().responses.push(rec);
  return rec;
}
export async function setResponseActive(responseId: string, active: boolean): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.setResponseActive(responseId, active);
  const rec = db().responses.find((r) => r.id === responseId);
  if (rec) rec.active = active;
}
export async function getResponse(responseId: string): Promise<ApprovedResponse | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getResponse(responseId);
  return db().responses.find((r) => r.id === responseId);
}

// ---- Phase 4: Campaigns + Offer Manager -----------------------------------------

export async function listCampaigns(tenantId: string): Promise<Campaign[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCampaigns(tenantId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .campaigns.filter((c) => ids.has(c.companyId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getCampaign(campaignId: string): Promise<Campaign | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCampaign(campaignId);
  return db().campaigns.find((c) => c.id === campaignId);
}
export async function createCampaign(
  input: Omit<Campaign, "id" | "createdAt" | "updatedAt">,
): Promise<Campaign> {
  if (isSupabaseConfigured()) return supabaseRepo.createCampaign(input);
  const t = now();
  const c: Campaign = { ...input, id: id("cmp"), createdAt: t, updatedAt: t };
  db().campaigns.push(c);
  return c;
}
export async function updateCampaign(
  campaignId: string,
  patch: Partial<Campaign>,
): Promise<Campaign | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateCampaign(campaignId, patch);
  const c = await getCampaign(campaignId);
  if (!c) return undefined;
  Object.assign(c, patch, { updatedAt: now() });
  return c;
}

export async function listCampaignItems(campaignId: string): Promise<CampaignItem[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCampaignItems(campaignId);
  return db()
    .campaignItems.filter((i) => i.campaignId === campaignId)
    .sort((a, b) => a.dayOffset - b.dayOffset);
}
export async function getCampaignItem(itemId: string): Promise<CampaignItem | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCampaignItem(itemId);
  return db().campaignItems.find((i) => i.id === itemId);
}
export async function createCampaignItem(
  input: Omit<CampaignItem, "id" | "createdAt" | "updatedAt">,
): Promise<CampaignItem> {
  if (isSupabaseConfigured()) return supabaseRepo.createCampaignItem(input);
  const t = now();
  const item: CampaignItem = { ...input, id: id("ci"), createdAt: t, updatedAt: t };
  db().campaignItems.push(item);
  return item;
}
export async function updateCampaignItem(
  itemId: string,
  patch: Partial<CampaignItem>,
): Promise<CampaignItem | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateCampaignItem(itemId, patch);
  const item = await getCampaignItem(itemId);
  if (!item) return undefined;
  Object.assign(item, patch, { updatedAt: now() });
  return item;
}
// When every item of an approved campaign is approved or skipped, the
// campaign itself completes (closes the P4 status machine). Returns true when
// the transition happened so callers can audit it.
export async function maybeCompleteCampaign(campaignId: string): Promise<boolean> {
  const campaign = await getCampaign(campaignId);
  if (!campaign || campaign.status !== "approved") return false;
  const items = await listCampaignItems(campaignId);
  // Approved-or-beyond counts as done: scheduled and published items have
  // already passed approval.
  const done = new Set(["approved", "scheduled", "published", "skipped"]);
  if (items.length > 0 && items.every((i) => done.has(i.status))) {
    await updateCampaign(campaignId, { status: "completed" });
    return true;
  }
  return false;
}

// When approved/scheduled content is demoted back to review (edit/restore),
// its campaign item can no longer count as approved or scheduled — and a
// completed campaign re-opens. Returns true when anything changed so callers
// can audit it.
export async function revertCampaignItemAfterDemotion(campaignItemId: string): Promise<boolean> {
  const item = await getCampaignItem(campaignItemId);
  if (!item) return false;
  let changed = false;
  if (item.status === "approved" || item.status === "scheduled") {
    await updateCampaignItem(campaignItemId, { status: "drafted" });
    changed = true;
  }
  const campaign = await getCampaign(item.campaignId);
  if (campaign?.status === "completed") {
    await updateCampaign(campaign.id, { status: "approved" });
    changed = true;
  }
  return changed;
}

export async function listOffers(companyId: string): Promise<Offer[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listOffers(companyId);
  return db()
    .offers.filter((o) => o.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getOffer(offerId: string): Promise<Offer | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getOffer(offerId);
  return db().offers.find((o) => o.id === offerId);
}
export async function createOffer(
  input: Omit<Offer, "id" | "createdAt" | "updatedAt">,
): Promise<Offer> {
  if (isSupabaseConfigured()) return supabaseRepo.createOffer(input);
  const t = now();
  const o: Offer = { ...input, id: id("off"), createdAt: t, updatedAt: t };
  db().offers.push(o);
  return o;
}
export async function updateOffer(
  offerId: string,
  patch: Partial<Offer>,
): Promise<Offer | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateOffer(offerId, patch);
  const o = await getOffer(offerId);
  if (!o) return undefined;
  Object.assign(o, patch, { updatedAt: now() });
  return o;
}
// Offers the AI may promote right now: approved, started, not ended (§30).
export async function liveOffers(companyId: string): Promise<Offer[]> {
  const today = now().slice(0, 10);
  return (await listOffers(companyId)).filter(
    (o) =>
      o.status === "approved" &&
      (!o.startDate || o.startDate <= today) &&
      (!o.endDate || o.endDate >= today),
  );
}

// ---- Phase 6: Scheduled posts ------------------------------------------------------

export async function listScheduledPosts(tenantId: string): Promise<ScheduledPost[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listScheduledPosts(tenantId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .scheduledPosts.filter((p) => ids.has(p.companyId))
    .sort((a, b) =>
    (a.scheduledDate + (a.scheduledTime ?? "")).localeCompare(
      b.scheduledDate + (b.scheduledTime ?? ""),
    ),
  );
}
export async function getScheduledPost(postId: string): Promise<ScheduledPost | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getScheduledPost(postId);
  return db().scheduledPosts.find((p) => p.id === postId);
}
export async function createScheduledPost(
  input: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">,
): Promise<ScheduledPost> {
  if (isSupabaseConfigured()) return supabaseRepo.createScheduledPost(input);
  const t = now();
  const post: ScheduledPost = { ...input, id: id("sp"), createdAt: t, updatedAt: t };
  db().scheduledPosts.push(post);
  return post;
}
export async function updateScheduledPost(
  postId: string,
  patch: Partial<ScheduledPost>,
): Promise<ScheduledPost | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateScheduledPost(postId, patch);
  const post = await getScheduledPost(postId);
  if (!post) return undefined;
  Object.assign(post, patch);
  if (!patch.updatedAt) post.updatedAt = now();
  return post;
}
// Atomic conditional status transition — the primitive the publish queue's
// claim/recover/dead-letter/requeue semantics stand on. The transition applies
// ONLY if the post belongs to the tenant, its status is one of `from`, and
// (when given) it hasn't been touched since `updatedBefore` (stale-claim
// recovery). Returns the transitioned post, or null when the guard didn't
// match — which is how a second worker discovers it lost the claim race.
export async function transitionScheduledPost(
  tenantId: string,
  postId: string,
  opts: {
    from: ScheduledPostStatus[];
    to: ScheduledPostStatus;
    updatedBefore?: string;
  },
): Promise<ScheduledPost | null> {
  if (isSupabaseConfigured()) {
    return supabaseRepo.transitionScheduledPost(tenantId, postId, opts);
  }
  const ids = tenantCompanyIdSet(tenantId);
  const post = db().scheduledPosts.find((p) => p.id === postId);
  if (!post || !ids.has(post.companyId)) return null;
  if (!opts.from.includes(post.status)) return null;
  if (opts.updatedBefore && post.updatedAt >= opts.updatedBefore) return null;
  Object.assign(post, { status: opts.to, updatedAt: now() });
  return post;
}
// Active schedules for one content item: queued OR currently in-flight — an
// in-flight ("publishing") post must keep its content in the scheduled state,
// otherwise cancelling a sibling schedule could revert the content to
// "approved" in the middle of a live send.
export async function activeSchedulesForContent(contentId: string): Promise<ScheduledPost[]> {
  if (isSupabaseConfigured()) return supabaseRepo.activeSchedulesForContent(contentId);
  return db().scheduledPosts.filter(
    (p) =>
      p.contentId === contentId &&
      (p.status === "scheduled" || p.status === "publishing"),
  );
}
// Schedules that must be cancelled when content is demoted: pending ones,
// failed ones AND dead-lettered ones — a stale failed/dead post must not stay
// retryable/requeueable after the body changed (it would double-publish once
// the content is re-approved).
export async function cancellableSchedulesForContent(contentId: string): Promise<ScheduledPost[]> {
  if (isSupabaseConfigured()) return supabaseRepo.cancellableSchedulesForContent(contentId);
  return db().scheduledPosts.filter(
    (p) =>
      p.contentId === contentId &&
      ["scheduled", "failed", "dead"].includes(p.status),
  );
}

// ---- Phase 7: Publishing integrations, logs and controls ---------------------------

export async function listIntegrations(
  tenantId: string,
  companyId?: string,
): Promise<PublishingIntegration[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listIntegrations(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .integrations.filter(
      (i) => ids.has(i.companyId) && (!companyId || i.companyId === companyId),
    )
    .sort((a, b) => a.platform.localeCompare(b.platform));
}
export async function getIntegration(integrationId: string): Promise<PublishingIntegration | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getIntegration(integrationId);
  return db().integrations.find((i) => i.id === integrationId);
}
export async function findConnectedIntegration(
  companyId: string,
  platform: string,
): Promise<PublishingIntegration | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.findConnectedIntegration(companyId, platform);
  return db().integrations.find(
    (i) =>
      i.companyId === companyId &&
      i.status === "connected" &&
      i.platform.toLowerCase() === platform.toLowerCase(),
  );
}
export async function createIntegration(
  input: Omit<PublishingIntegration, "id" | "connectedAt" | "updatedAt">,
): Promise<PublishingIntegration> {
  if (isSupabaseConfigured()) return supabaseRepo.createIntegration(input);
  const t = now();
  const rec: PublishingIntegration = {
    ...input,
    id: id("int"),
    connectedAt: t,
    updatedAt: t,
  };
  db().integrations.push(rec);
  return rec;
}
export async function updateIntegration(
  integrationId: string,
  patch: Partial<PublishingIntegration>,
): Promise<PublishingIntegration | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateIntegration(integrationId, patch);
  const rec = await getIntegration(integrationId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

// ---- Connect invites (bulk one-time client onboarding) -----------------------

export async function listConnectInvites(
  tenantId: string,
  companyId?: string,
): Promise<ConnectInvite[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listConnectInvites(tenantId, companyId);
  return db()
    .connectInvites.filter(
      (i) => i.tenantId === tenantId && (!companyId || i.companyId === companyId),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getConnectInvite(inviteId: string): Promise<ConnectInvite | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getConnectInvite(inviteId);
  return db().connectInvites.find((i) => i.id === inviteId);
}

export async function getConnectInviteByToken(token: string): Promise<ConnectInvite | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getConnectInviteByToken(token);
  return db().connectInvites.find((i) => i.token === token);
}

export async function createConnectInvite(
  input: Omit<ConnectInvite, "id" | "createdAt" | "updatedAt">,
): Promise<ConnectInvite> {
  if (isSupabaseConfigured()) return supabaseRepo.createConnectInvite(input);
  const t = now();
  const rec: ConnectInvite = { ...input, id: id("cinv"), createdAt: t, updatedAt: t };
  db().connectInvites.push(rec);
  return rec;
}

export async function updateConnectInvite(
  inviteId: string,
  patch: Partial<ConnectInvite>,
): Promise<ConnectInvite | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateConnectInvite(inviteId, patch);
  const rec = await getConnectInvite(inviteId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

export async function listApiKeys(tenantId: string): Promise<ApiKey[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listApiKeys(tenantId);
  return db().apiKeys.filter((k) => k.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getApiKey(keyId: string): Promise<ApiKey | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getApiKey(keyId);
  return db().apiKeys.find((k) => k.id === keyId);
}
export async function getApiKeyByPrefix(prefix: string): Promise<ApiKey | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getApiKeyByPrefix(prefix);
  return db().apiKeys.find((k) => k.keyPrefix === prefix);
}
export async function createApiKey(input: Omit<ApiKey, "id" | "createdAt" | "updatedAt">): Promise<ApiKey> {
  if (isSupabaseConfigured()) return supabaseRepo.createApiKey(input);
  const t = now();
  const rec: ApiKey = { ...input, id: id("apk"), createdAt: t, updatedAt: t };
  db().apiKeys.push(rec);
  return rec;
}
export async function updateApiKey(keyId: string, patch: Partial<ApiKey>): Promise<ApiKey | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateApiKey(keyId, patch);
  const rec = await getApiKey(keyId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}
export async function listPartnerWebhooks(tenantId: string): Promise<PartnerWebhook[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listPartnerWebhooks(tenantId);
  return db().partnerWebhooks.filter((w) => w.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getPartnerWebhook(webhookId: string): Promise<PartnerWebhook | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getPartnerWebhook(webhookId);
  return db().partnerWebhooks.find((w) => w.id === webhookId);
}
export async function createPartnerWebhook(input: Omit<PartnerWebhook, "id" | "createdAt" | "updatedAt">): Promise<PartnerWebhook> {
  if (isSupabaseConfigured()) return supabaseRepo.createPartnerWebhook(input);
  const t = now();
  const rec: PartnerWebhook = { ...input, id: id("pwh"), createdAt: t, updatedAt: t };
  db().partnerWebhooks.push(rec);
  return rec;
}
export async function updatePartnerWebhook(webhookId: string, patch: Partial<PartnerWebhook>): Promise<PartnerWebhook | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updatePartnerWebhook(webhookId, patch);
  const rec = await getPartnerWebhook(webhookId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

export async function appendPublishLog(
  input: Omit<PublishLog, "id" | "createdAt">,
): Promise<PublishLog> {
  if (isSupabaseConfigured()) return supabaseRepo.appendPublishLog(input);
  const rec: PublishLog = { ...input, id: id("pl"), createdAt: now() };
  db().publishLogs.push(rec);
  return rec;
}
// Newest-first with a deterministic tie-break: the in-memory now() is
// millisecond-precision, so two logs written in the same tick can share a
// createdAt — insertion order (the append-only array's index) then decides
// which is newer. Without this, a "requeued" marker and the retry's "failed"
// log could sort ambiguously and corrupt the derived attempt count. (Supabase
// orders by its microsecond created_at; sequential inserts never tie there.)
function newestFirst(logs: PublishLog[]): PublishLog[] {
  const indexed = new Map(db().publishLogs.map((l, i) => [l.id, i]));
  return [...logs].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) ||
      (indexed.get(b.id) ?? 0) - (indexed.get(a.id) ?? 0),
  );
}
export async function listPublishLogs(tenantId: string): Promise<PublishLog[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listPublishLogs(tenantId);
  const ids = tenantCompanyIdSet(tenantId);
  return newestFirst(db().publishLogs.filter((l) => ids.has(l.companyId)));
}
// Logs for a specific set of scheduled posts (newest first) — the queue derives
// attempt counts and backoff timing from these without fetching a tenant's
// whole publish history.
export async function listPublishLogsForPosts(
  tenantId: string,
  postIds: string[],
): Promise<PublishLog[]> {
  if (postIds.length === 0) return [];
  if (isSupabaseConfigured()) {
    return supabaseRepo.listPublishLogsForPosts(tenantId, postIds);
  }
  const ids = tenantCompanyIdSet(tenantId);
  const wanted = new Set(postIds);
  return newestFirst(
    db().publishLogs.filter(
      (l) =>
        ids.has(l.companyId) &&
        l.scheduledPostId !== undefined &&
        wanted.has(l.scheduledPostId),
    ),
  );
}
// Logs since a moment (newest first) — the queue counts each integration's
// trailing-24h published posts from this window for platform-ceiling checks.
export async function listPublishLogsSince(
  tenantId: string,
  sinceIso: string,
): Promise<PublishLog[]> {
  if (isSupabaseConfigured()) {
    return supabaseRepo.listPublishLogsSince(tenantId, sinceIso);
  }
  const ids = tenantCompanyIdSet(tenantId);
  return newestFirst(
    db().publishLogs.filter((l) => ids.has(l.companyId) && l.createdAt >= sinceIso),
  );
}

export async function getPublishingControls(
  tenantId: string,
): Promise<PublishingControls> {
  if (isSupabaseConfigured()) return supabaseRepo.getPublishingControls(tenantId);
  let c = db().publishingControls.find((x) => x.tenantId === tenantId);
  if (!c) {
    // A new tenant gets a default, un-frozen panel.
    c = {
      tenantId,
      freezeAll: false,
      automatedPublishingDisabled: false,
      socialRepliesDisabled: false,
      frozenCompanyIds: [],
      frozenPlatforms: [],
      frozenCampaignIds: [],
    };
    db().publishingControls.push(c);
  }
  return c;
}
export async function updatePublishingControls(
  tenantId: string,
  patch: Partial<Omit<PublishingControls, "tenantId">>,
): Promise<PublishingControls> {
  if (isSupabaseConfigured()) return supabaseRepo.updatePublishingControls(tenantId, patch);
  const c = await getPublishingControls(tenantId);
  Object.assign(c, patch);
  return c;
}

// ---- Phase 10: Security settings + Legal holds -------------------------------------

export async function getSecuritySettings(
  tenantId: string,
): Promise<SecuritySettings> {
  if (isSupabaseConfigured()) return supabaseRepo.getSecuritySettings(tenantId);
  let s = db().security.find((x) => x.tenantId === tenantId);
  if (!s) {
    s = {
      tenantId,
      crisisMode: false,
      sandboxMode: false,
      retentionDays: 730,
      aiMonthlyCapUsd: 50,
      updatedAt: now(),
    };
    db().security.push(s);
  }
  return s;
}
export async function updateSecuritySettings(
  tenantId: string,
  patch: Partial<Omit<SecuritySettings, "tenantId">>,
): Promise<SecuritySettings> {
  if (isSupabaseConfigured()) return supabaseRepo.updateSecuritySettings(tenantId, patch);
  const s = await getSecuritySettings(tenantId);
  Object.assign(s, patch, { updatedAt: now() });
  return s;
}

export async function listLegalHolds(
  tenantId: string,
  activeOnly = false,
): Promise<LegalHold[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listLegalHolds(tenantId, activeOnly);
  return db()
    .legalHolds.filter(
      (h) => h.tenantId === tenantId && (!activeOnly || h.active),
    )
    .sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
}
export async function getLegalHold(holdId: string): Promise<LegalHold | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getLegalHold(holdId);
  return db().legalHolds.find((h) => h.id === holdId);
}
export async function createLegalHold(
  input: Omit<LegalHold, "id" | "appliedAt" | "active">,
): Promise<LegalHold> {
  if (isSupabaseConfigured()) return supabaseRepo.createLegalHold(input);
  const hold: LegalHold = { ...input, id: id("hold"), active: true, appliedAt: now() };
  db().legalHolds.push(hold);
  return hold;
}
export async function releaseLegalHold(holdId: string, byId: string): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.releaseLegalHold(holdId, byId);
  const hold = await getLegalHold(holdId);
  if (hold && hold.active) {
    hold.active = false;
    hold.releasedById = byId;
    hold.releasedAt = now();
  }
}
// Is a specific record (or its owning company) under an active legal hold?
export async function isUnderLegalHold(
  scope: LegalHold["scope"],
  targetId: string,
  companyId?: string,
): Promise<boolean> {
  if (isSupabaseConfigured()) return supabaseRepo.isUnderLegalHold(scope, targetId, companyId);
  return db().legalHolds.some(
    (h) =>
      h.active &&
      ((h.scope === scope && h.targetId === targetId) ||
        (h.scope === "company" && companyId !== undefined && h.targetId === companyId)),
  );
}

// AI cost cap (§ AI usage limits): month-to-date spend and remaining budget,
// PER TENANT — one tenant's spend can never consume another's cap.
export async function aiSpendThisMonth(tenantId: string): Promise<number> {
  if (isSupabaseConfigured()) return supabaseRepo.aiSpendThisMonth(tenantId);
  const month = now().slice(0, 7);
  return db()
    .aiRuns.filter(
      (r) => r.tenantId === tenantId && r.createdAt.slice(0, 7) === month,
    )
    .reduce((s, r) => s + r.estCostUsd, 0);
}
// Effective cap = the tenant's own admin-set cap AND the plan allowance,
// whichever is lower (T4: per-tenant caps enforced by plan — an admin can
// lower their cap but never spend past what their plan includes).
export async function effectiveAiCapUsd(tenantId: string): Promise<number> {
  const planCap = planFor((await getTenant(tenantId))?.plan).aiIncludedUsd;
  const adminCap = (await getSecuritySettings(tenantId)).aiMonthlyCapUsd;
  return adminCap > 0 ? Math.min(adminCap, planCap) : planCap;
}
export async function aiBudgetExceeded(tenantId: string): Promise<boolean> {
  const cap = await effectiveAiCapUsd(tenantId);
  return cap > 0 && (await aiSpendThisMonth(tenantId)) >= cap;
}

// Token metering (Module 3): input + output tokens summed per month.
export async function aiTokensThisMonth(tenantId: string): Promise<number> {
  if (isSupabaseConfigured()) return supabaseRepo.aiTokensThisMonth(tenantId);
  const month = now().slice(0, 7);
  return db()
    .aiRuns.filter(
      (r) => r.tenantId === tenantId && r.createdAt.slice(0, 7) === month,
    )
    .reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0);
}
export async function effectiveAiTokenCap(tenantId: string): Promise<number> {
  return planFor((await getTenant(tenantId))?.plan).limits.aiTokensPerMonth;
}
export async function aiTokenBudgetExceeded(
  tenantId: string,
  estimatedTokens = 0,
): Promise<boolean> {
  const cap = await effectiveAiTokenCap(tenantId);
  if (cap <= 0) return false;
  return (await aiTokensThisMonth(tenantId)) + estimatedTokens >= cap;
}

// ---- Phase 9: Recommendations + Tasks ----------------------------------------------

export async function listRecommendations(
  tenantId: string,
  companyIds?: string[],
  status?: Recommendation["status"],
): Promise<Recommendation[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listRecommendations(tenantId, companyIds, status);
  const tids = tenantCompanyIdSet(tenantId);
  let recs = db().recommendations.filter((r) => tids.has(r.companyId));
  if (companyIds) {
    const allowed = new Set(companyIds);
    recs = recs.filter((r) => allowed.has(r.companyId));
  }
  if (status) recs = recs.filter((r) => r.status === status);
  return recs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getRecommendation(recId: string): Promise<Recommendation | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getRecommendation(recId);
  return db().recommendations.find((r) => r.id === recId);
}
export async function createRecommendation(
  input: Omit<Recommendation, "id" | "createdAt">,
): Promise<Recommendation> {
  if (isSupabaseConfigured()) return supabaseRepo.createRecommendation(input);
  const rec: Recommendation = { ...input, id: id("rec"), createdAt: now() };
  db().recommendations.push(rec);
  return rec;
}
export async function updateRecommendation(
  recId: string,
  patch: Partial<Recommendation>,
): Promise<Recommendation | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateRecommendation(recId, patch);
  const rec = await getRecommendation(recId);
  if (!rec) return undefined;
  Object.assign(rec, patch);
  return rec;
}

export async function listRecommendationDismissHistory(companyId: string): Promise<RecommendationDismissRecord[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listRecommendationDismissHistory(companyId);
  return db()
    .recommendationDismissHistory.filter((r) => r.companyId === companyId)
    .sort((a, b) => b.dismissedAt.localeCompare(a.dismissedAt));
}

export async function createRecommendationDismissRecord(
  input: Omit<RecommendationDismissRecord, "id" | "dismissedAt">,
): Promise<RecommendationDismissRecord> {
  if (isSupabaseConfigured()) return supabaseRepo.createRecommendationDismissRecord(input);
  const row: RecommendationDismissRecord = {
    ...input,
    id: id("rec_dismiss"),
    dismissedAt: now(),
  };
  db().recommendationDismissHistory.push(row);
  return row;
}

export async function resurfaceExpiredSnoozedRecommendations(
  tenantId: string,
  companyIdsFilter: string[],
): Promise<number> {
  if (isSupabaseConfigured()) {
    return supabaseRepo.resurfaceExpiredSnoozedRecommendations(tenantId, companyIdsFilter);
  }
  const allowed = new Set(companyIdsFilter);
  const tids = tenantCompanyIdSet(tenantId);
  let count = 0;
  for (const rec of db().recommendations) {
    if (!tids.has(rec.companyId)) continue;
    if (companyIdsFilter.length && !allowed.has(rec.companyId)) continue;
    if (rec.status !== "snoozed" || !rec.snoozedUntil) continue;
    if (Date.parse(rec.snoozedUntil) > Date.now()) continue;
    rec.status = "open";
    rec.snoozedUntil = null;
    count += 1;
  }
  return count;
}

export async function listTasks(
  tenantId: string,
  companyIds?: string[],
  status?: Task["status"],
): Promise<Task[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listTasks(tenantId, companyIds, status);
  const tids = tenantCompanyIdSet(tenantId);
  let tasks = db().tasks.filter((t) => tids.has(t.companyId));
  if (companyIds) {
    const allowed = new Set(companyIds);
    tasks = tasks.filter((t) => allowed.has(t.companyId));
  }
  if (status) tasks = tasks.filter((t) => t.status === status);
  return tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getTask(taskId: string): Promise<Task | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getTask(taskId);
  return db().tasks.find((t) => t.id === taskId);
}
export async function createTask(input: Omit<Task, "id" | "createdAt">): Promise<Task> {
  if (isSupabaseConfigured()) return supabaseRepo.createTask(input);
  const task: Task = { ...input, id: id("task"), createdAt: now() };
  db().tasks.push(task);
  return task;
}
export async function updateTask(taskId: string, patch: Partial<Task>): Promise<Task | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateTask(taskId, patch);
  const task = await getTask(taskId);
  if (!task) return undefined;
  Object.assign(task, patch);
  return task;
}

// ---- V1 module 11: AI-MOS opportunities ------------------------------------------

export async function listAiMosOpportunities(
  tenantId: string,
  companyIds?: string[],
  status?: AiMosOpportunity["status"],
): Promise<AiMosOpportunity[]> {
  if (isSupabaseConfigured()) {
    return supabaseRepo.listAiMosOpportunities(tenantId, companyIds, status);
  }
  let opps = db().aiMosOpportunities.filter((o) => o.tenantId === tenantId);
  if (companyIds) {
    const allowed = new Set(companyIds);
    opps = opps.filter((o) => allowed.has(o.companyId));
  }
  if (status) opps = opps.filter((o) => o.status === status);
  return opps.sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt));
}

export async function getAiMosOpportunity(
  oppId: string,
): Promise<AiMosOpportunity | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getAiMosOpportunity(oppId);
  return db().aiMosOpportunities.find((o) => o.id === oppId);
}

export async function createAiMosOpportunity(
  input: Omit<AiMosOpportunity, "id" | "createdAt">,
): Promise<AiMosOpportunity> {
  if (isSupabaseConfigured()) return supabaseRepo.createAiMosOpportunity(input);
  const opp: AiMosOpportunity = { ...input, id: id("aimos"), createdAt: now() };
  db().aiMosOpportunities.push(opp);
  return opp;
}

export async function updateAiMosOpportunity(
  oppId: string,
  patch: Partial<AiMosOpportunity>,
): Promise<AiMosOpportunity | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateAiMosOpportunity(oppId, patch);
  const opp = await getAiMosOpportunity(oppId);
  if (!opp) return undefined;
  Object.assign(opp, patch);
  return opp;
}

export async function listAiMosSignalRuns(
  tenantId: string,
  companyIds?: string[],
): Promise<AiMosSignalRun[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listAiMosSignalRuns(tenantId, companyIds);
  let runs = (db().aiMosSignalRuns ?? []).filter((r) => r.tenantId === tenantId);
  if (companyIds) {
    const allowed = new Set(companyIds);
    runs = runs.filter((r) => allowed.has(r.companyId));
  }
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createAiMosSignalRun(
  input: Omit<AiMosSignalRun, "id" | "createdAt">,
): Promise<AiMosSignalRun> {
  if (isSupabaseConfigured()) return supabaseRepo.createAiMosSignalRun(input);
  const run: AiMosSignalRun = { ...input, id: id("aimosrun"), createdAt: now() };
  (db().aiMosSignalRuns ??= []).push(run);
  return run;
}

// ---- W1 M22: Calendar assist suggestions ---------------------------------------

export async function listCalendarAssistSuggestions(
  tenantId: string,
  companyIds?: string[],
  status?: CalendarAssistSuggestion["status"],
): Promise<CalendarAssistSuggestion[]> {
  if (isSupabaseConfigured()) {
    return supabaseRepo.listCalendarAssistSuggestions(tenantId, companyIds, status);
  }
  let rows = db().calendarAssistSuggestions.filter((s) => s.tenantId === tenantId);
  if (companyIds) {
    const allowed = new Set(companyIds);
    rows = rows.filter((s) => allowed.has(s.companyId));
  }
  if (status) rows = rows.filter((s) => s.status === status);
  return rows.sort((a, b) => b.priority - a.priority || b.createdAt.localeCompare(a.createdAt));
}

export async function getCalendarAssistSuggestion(
  suggestionId: string,
): Promise<CalendarAssistSuggestion | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCalendarAssistSuggestion(suggestionId);
  return db().calendarAssistSuggestions.find((s) => s.id === suggestionId);
}

export async function createCalendarAssistSuggestion(
  input: Omit<CalendarAssistSuggestion, "id" | "createdAt">,
): Promise<CalendarAssistSuggestion> {
  if (isSupabaseConfigured()) return supabaseRepo.createCalendarAssistSuggestion(input);
  const row: CalendarAssistSuggestion = { ...input, id: id("calas"), createdAt: now() };
  db().calendarAssistSuggestions.push(row);
  return row;
}

export async function updateCalendarAssistSuggestion(
  suggestionId: string,
  patch: Partial<CalendarAssistSuggestion>,
): Promise<CalendarAssistSuggestion | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateCalendarAssistSuggestion(suggestionId, patch);
  const row = await getCalendarAssistSuggestion(suggestionId);
  if (!row) return undefined;
  Object.assign(row, patch);
  return row;
}

// ---- Phase 8: UTM links ------------------------------------------------------------

export async function listUtmLinks(
  tenantId: string,
  companyIds?: string[],
): Promise<UtmLink[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listUtmLinks(tenantId, companyIds);
  const tids = tenantCompanyIdSet(tenantId);
  let links = db().utmLinks.filter((l) => tids.has(l.companyId));
  if (companyIds) {
    const allowed = new Set(companyIds);
    links = links.filter((l) => allowed.has(l.companyId));
  }
  return links.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function createUtmLink(input: Omit<UtmLink, "id" | "createdAt">): Promise<UtmLink> {
  if (isSupabaseConfigured()) return supabaseRepo.createUtmLink(input);
  const link: UtmLink = { ...input, id: id("utm"), createdAt: now() };
  db().utmLinks.push(link);
  return link;
}

// ---- Module 6: Paid advertising (ad accounts, budgets, campaigns, leads) -----------

export async function listAdAccounts(
  tenantId: string,
  companyId?: string,
): Promise<AdAccount[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listAdAccounts(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .adAccounts.filter((a) => ids.has(a.companyId) && (!companyId || a.companyId === companyId))
    .sort((a, b) => a.platform.localeCompare(b.platform));
}
export async function getAdAccount(adAccountId: string): Promise<AdAccount | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getAdAccount(adAccountId);
  return db().adAccounts.find((a) => a.id === adAccountId);
}
export async function findAdAccountByExternalId(
  platform: AdPlatform,
  externalAccountId: string,
): Promise<AdAccount | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.findAdAccountByExternalId(platform, externalAccountId);
  return db().adAccounts.find(
    (a) =>
      a.platform === platform &&
      a.externalAccountId === externalAccountId &&
      a.status === "connected",
  );
}

export async function findConnectedAdAccount(
  companyId: string,
  platform: AdPlatform,
): Promise<AdAccount | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.findConnectedAdAccount(companyId, platform);
  // Return the MOST RECENTLY connected one. connect disconnects any prior
  // connected account first, so normally there's ≤1 — but a race could leave
  // two, and "most recent grant wins" is the right, non-throwing resolution
  // (mirrors the adapter's order-by-connected_at limit 1).
  return db()
    .adAccounts.filter(
      (a) => a.companyId === companyId && a.platform === platform && a.status === "connected",
    )
    .sort((a, b) => b.connectedAt.localeCompare(a.connectedAt))[0];
}
export async function createAdAccount(
  input: Omit<AdAccount, "id" | "connectedAt" | "updatedAt">,
): Promise<AdAccount> {
  if (isSupabaseConfigured()) return supabaseRepo.createAdAccount(input);
  const t = now();
  const rec: AdAccount = { ...input, id: id("ad"), connectedAt: t, updatedAt: t };
  db().adAccounts.push(rec);
  return rec;
}
export async function updateAdAccount(
  adAccountId: string,
  patch: Partial<AdAccount>,
): Promise<AdAccount | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateAdAccount(adAccountId, patch);
  const rec = await getAdAccount(adAccountId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

// AdBudget is a per-company singleton (upsert keyed by companyId).
export async function getAdBudget(companyId: string): Promise<AdBudget | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getAdBudget(companyId);
  return db().adBudgets.find((b) => b.companyId === companyId);
}
export async function listAdBudgets(tenantId: string): Promise<AdBudget[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listAdBudgets(tenantId);
  const ids = tenantCompanyIdSet(tenantId);
  return db().adBudgets.filter((b) => ids.has(b.companyId));
}
export async function upsertAdBudget(
  input: Omit<AdBudget, "updatedAt">,
): Promise<AdBudget> {
  if (isSupabaseConfigured()) return supabaseRepo.upsertAdBudget(input);
  const existing = db().adBudgets.find((b) => b.companyId === input.companyId);
  if (existing) {
    Object.assign(existing, input, { updatedAt: now() });
    return existing;
  }
  const rec: AdBudget = { ...input, updatedAt: now() };
  db().adBudgets.push(rec);
  return rec;
}

export async function listAdCampaigns(
  tenantId: string,
  companyId?: string,
): Promise<AdCampaign[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listAdCampaigns(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .adCampaigns.filter((c) => ids.has(c.companyId) && (!companyId || c.companyId === companyId))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}
export async function getAdCampaign(campaignId: string): Promise<AdCampaign | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getAdCampaign(campaignId);
  return db().adCampaigns.find((c) => c.id === campaignId);
}
export async function createAdCampaign(
  input: Omit<AdCampaign, "id" | "createdAt" | "updatedAt">,
): Promise<AdCampaign> {
  if (isSupabaseConfigured()) return supabaseRepo.createAdCampaign(input);
  const t = now();
  const rec: AdCampaign = { ...input, id: id("adc"), createdAt: t, updatedAt: t };
  db().adCampaigns.push(rec);
  return rec;
}
export async function updateAdCampaign(
  campaignId: string,
  patch: Partial<AdCampaign>,
): Promise<AdCampaign | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateAdCampaign(campaignId, patch);
  const rec = await getAdCampaign(campaignId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

export async function listAudienceSegments(
  tenantId: string,
  companyId?: string,
): Promise<AudienceSegment[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listAudienceSegments(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .audienceSegments.filter((s) => ids.has(s.companyId) && (!companyId || s.companyId === companyId))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function getAudienceSegment(segmentId: string): Promise<AudienceSegment | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getAudienceSegment(segmentId);
  return db().audienceSegments.find((s) => s.id === segmentId);
}
export async function createAudienceSegment(
  input: Omit<AudienceSegment, "id" | "createdAt" | "updatedAt">,
): Promise<AudienceSegment> {
  if (isSupabaseConfigured()) return supabaseRepo.createAudienceSegment(input);
  const t = now();
  const rec: AudienceSegment = { ...input, id: id("aud"), createdAt: t, updatedAt: t };
  db().audienceSegments.push(rec);
  return rec;
}
export async function updateAudienceSegment(
  segmentId: string,
  patch: Partial<AudienceSegment>,
): Promise<AudienceSegment | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateAudienceSegment(segmentId, patch);
  const rec = await getAudienceSegment(segmentId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}
export async function deleteAudienceSegment(segmentId: string): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.deleteAudienceSegment(segmentId);
  const s = db();
  s.audienceSegments = s.audienceSegments.filter((x) => x.id !== segmentId);
  // Detach it from any campaigns that referenced it (mirror the Supabase
  // ON DELETE SET NULL) so a campaign never points at a vanished audience.
  for (const c of s.adCampaigns) {
    if (c.audienceSegmentId === segmentId) c.audienceSegmentId = null;
  }
}

export async function listLeads(
  tenantId: string,
  companyId?: string,
): Promise<Lead[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listLeads(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .leads.filter((l) => ids.has(l.companyId) && (!companyId || l.companyId === companyId))
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}
export async function createLead(input: Omit<Lead, "id">): Promise<Lead> {
  if (isSupabaseConfigured()) return supabaseRepo.createLead(input);
  const rec: Lead = { ...input, id: id("lead") };
  db().leads.push(rec);
  return rec;
}

export async function findLeadByExternalId(
  companyId: string,
  platform: AdPlatform,
  externalLeadId: string,
): Promise<Lead | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.findLeadByExternalId(companyId, platform, externalLeadId);
  return db().leads.find(
    (l) =>
      l.companyId === companyId &&
      l.platform === platform &&
      l.externalLeadId === externalLeadId,
  );
}

// ---- Module 3: Per-company add-on entitlements -------------------------------
//
// At most ONE row per (companyId, addonId): enabling upserts status "active",
// disabling flips it to "cancelled" (kept for history). The gate helpers in
// src/lib/entitlements.ts read these. The tenant list-fn takes a REQUIRED
// tenantId (isolation rule); getCompanyEntitlement is a company-scoped single
// lookup (like getAdBudget) for the deliverable-module gates.

export async function listCompanyEntitlements(
  tenantId: string,
  companyId?: string,
): Promise<CompanyEntitlement[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCompanyEntitlements(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .companyEntitlements.filter((e) => ids.has(e.companyId) && (!companyId || e.companyId === companyId))
    .sort((a, b) => a.addonId.localeCompare(b.addonId));
}

export async function getCompanyEntitlement(
  companyId: string,
  addonId: AddonId,
): Promise<CompanyEntitlement | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCompanyEntitlement(companyId, addonId);
  return db().companyEntitlements.find((e) => e.companyId === companyId && e.addonId === addonId);
}

// Upsert keyed on (companyId, addonId). status "active" (re)stamps enabledAt and
// clears cancelledAt; status "cancelled" stamps cancelledAt and keeps the row.
export interface EntitlementUpsert {
  companyId: string;
  addonId: AddonId;
  status: "active" | "cancelled";
  enabledById: string;
  stripeSubscriptionId?: string;
}
export async function upsertCompanyEntitlement(
  input: EntitlementUpsert,
): Promise<CompanyEntitlement> {
  if (isSupabaseConfigured()) return supabaseRepo.upsertCompanyEntitlement(input);
  const s = db();
  const t = now();
  const existing = s.companyEntitlements.find(
    (e) => e.companyId === input.companyId && e.addonId === input.addonId,
  );
  if (existing) {
    existing.status = input.status;
    existing.enabledById = input.enabledById;
    if (input.stripeSubscriptionId !== undefined) existing.stripeSubscriptionId = input.stripeSubscriptionId;
    if (input.status === "active") {
      existing.enabledAt = t;
      existing.cancelledAt = undefined;
    } else {
      existing.cancelledAt = t;
    }
    existing.updatedAt = t;
    return existing;
  }
  const rec: CompanyEntitlement = {
    id: id("ent"),
    companyId: input.companyId,
    addonId: input.addonId,
    status: input.status,
    enabledById: input.enabledById,
    stripeSubscriptionId: input.stripeSubscriptionId,
    enabledAt: t,
    cancelledAt: input.status === "cancelled" ? t : undefined,
    updatedAt: t,
  };
  s.companyEntitlements.push(rec);
  return rec;
}

// ---- Module 2: Photo shoots (Phase 4) -----------------------------------------------

export async function listPhotoShoots(
  tenantId: string,
  companyId?: string,
): Promise<PhotoShoot[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listPhotoShoots(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .photoShoots.filter((p) => ids.has(p.companyId) && (!companyId || p.companyId === companyId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPhotoShoot(shootId: string): Promise<PhotoShoot | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getPhotoShoot(shootId);
  return db().photoShoots.find((p) => p.id === shootId);
}

export async function createPhotoShoot(
  input: Omit<PhotoShoot, "id" | "createdAt" | "updatedAt">,
): Promise<PhotoShoot> {
  if (isSupabaseConfigured()) return supabaseRepo.createPhotoShoot(input);
  const t = now();
  const rec: PhotoShoot = { ...input, id: id("ps"), createdAt: t, updatedAt: t };
  db().photoShoots.push(rec);
  return rec;
}

export async function updatePhotoShoot(
  shootId: string,
  patch: Partial<PhotoShoot>,
): Promise<PhotoShoot | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updatePhotoShoot(shootId, patch);
  const p = await getPhotoShoot(shootId);
  if (!p) return undefined;
  Object.assign(p, patch, { updatedAt: now() });
  return p;
}

// ---- Module 4: Restaurant menu designs (Phase 5) ------------------------------------

export async function listMenuDesigns(
  tenantId: string,
  companyId?: string,
): Promise<MenuDesign[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listMenuDesigns(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .menuDesigns.filter((m) => ids.has(m.companyId) && (!companyId || m.companyId === companyId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMenuDesign(designId: string): Promise<MenuDesign | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getMenuDesign(designId);
  return db().menuDesigns.find((m) => m.id === designId);
}

export async function createMenuDesign(
  input: Omit<MenuDesign, "id" | "createdAt" | "updatedAt">,
): Promise<MenuDesign> {
  if (isSupabaseConfigured()) return supabaseRepo.createMenuDesign(input);
  const t = now();
  const rec: MenuDesign = { ...input, id: id("md"), createdAt: t, updatedAt: t };
  db().menuDesigns.push(rec);
  return rec;
}

export async function updateMenuDesign(
  designId: string,
  patch: Partial<MenuDesign>,
): Promise<MenuDesign | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateMenuDesign(designId, patch);
  const m = await getMenuDesign(designId);
  if (!m) return undefined;
  Object.assign(m, patch, { updatedAt: now() });
  return m;
}

// ---- Module 5: Order Now (Phase 6) --------------------------------------------------

export async function listOrderMenuItems(
  tenantId: string,
  companyId?: string,
): Promise<OrderMenuItem[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listOrderMenuItems(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .orderMenuItems.filter((m) => ids.has(m.companyId) && (!companyId || m.companyId === companyId))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function listOrderMenuItemsByCompany(companyId: string): Promise<OrderMenuItem[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listOrderMenuItemsByCompany(companyId);
  return db()
    .orderMenuItems.filter((m) => m.companyId === companyId && m.available)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export async function getOrderMenuItem(itemId: string): Promise<OrderMenuItem | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getOrderMenuItem(itemId);
  return db().orderMenuItems.find((m) => m.id === itemId);
}

export async function createOrderMenuItem(
  input: Omit<OrderMenuItem, "id" | "createdAt" | "updatedAt">,
): Promise<OrderMenuItem> {
  if (isSupabaseConfigured()) return supabaseRepo.createOrderMenuItem(input);
  const t = now();
  const rec: OrderMenuItem = { ...input, id: id("omi"), createdAt: t, updatedAt: t };
  db().orderMenuItems.push(rec);
  return rec;
}

export async function updateOrderMenuItem(
  itemId: string,
  patch: Partial<OrderMenuItem>,
): Promise<OrderMenuItem | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateOrderMenuItem(itemId, patch);
  const m = await getOrderMenuItem(itemId);
  if (!m) return undefined;
  Object.assign(m, patch, { updatedAt: now() });
  return m;
}

export async function deleteOrderMenuItem(itemId: string): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.deleteOrderMenuItem(itemId);
  const s = db();
  s.orderMenuItems = s.orderMenuItems.filter((m) => m.id !== itemId);
}

export async function getOrderingSettings(companyId: string): Promise<OrderingSettings | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getOrderingSettings(companyId);
  return db().orderingSettings.find((s) => s.companyId === companyId);
}

export async function upsertOrderingSettings(
  input: OrderingSettings,
): Promise<OrderingSettings> {
  if (isSupabaseConfigured()) return supabaseRepo.upsertOrderingSettings(input);
  const s = db();
  const i = s.orderingSettings.findIndex((x) => x.companyId === input.companyId);
  const rec = { ...input, updatedAt: now() };
  if (i >= 0) s.orderingSettings[i] = rec;
  else s.orderingSettings.push(rec);
  return rec;
}

export async function listRestaurantOrders(
  tenantId: string,
  companyId?: string,
): Promise<RestaurantOrder[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listRestaurantOrders(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .restaurantOrders.filter((o) => ids.has(o.companyId) && (!companyId || o.companyId === companyId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getRestaurantOrder(orderId: string): Promise<RestaurantOrder | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getRestaurantOrder(orderId);
  return db().restaurantOrders.find((o) => o.id === orderId);
}

export async function createRestaurantOrder(
  input: Omit<RestaurantOrder, "id" | "createdAt" | "updatedAt">,
): Promise<RestaurantOrder> {
  if (isSupabaseConfigured()) return supabaseRepo.createRestaurantOrder(input);
  const t = now();
  const rec: RestaurantOrder = { ...input, id: id("ro"), createdAt: t, updatedAt: t };
  db().restaurantOrders.push(rec);
  return rec;
}

export async function updateRestaurantOrder(
  orderId: string,
  patch: Partial<RestaurantOrder>,
): Promise<RestaurantOrder | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateRestaurantOrder(orderId, patch);
  const o = await getRestaurantOrder(orderId);
  if (!o) return undefined;
  Object.assign(o, patch, { updatedAt: now() });
  return o;
}

// ---- W7 M50: Bookings & reservations ------------------------------------------------

export async function listServicePeriods(
  tenantId: string,
  companyId?: string,
): Promise<ServicePeriod[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listServicePeriods(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .bookingServicePeriods.filter((p) => ids.has(p.companyId) && (!companyId || p.companyId === companyId))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

export async function listServicePeriodsByCompany(companyId: string): Promise<ServicePeriod[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listServicePeriodsByCompany(companyId);
  return db()
    .bookingServicePeriods.filter((p) => p.companyId === companyId && p.active)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

export async function getServicePeriod(periodId: string): Promise<ServicePeriod | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getServicePeriod(periodId);
  return db().bookingServicePeriods.find((p) => p.id === periodId);
}

export async function createServicePeriod(
  input: Omit<ServicePeriod, "id" | "createdAt" | "updatedAt">,
): Promise<ServicePeriod> {
  if (isSupabaseConfigured()) return supabaseRepo.createServicePeriod(input);
  const t = now();
  const rec: ServicePeriod = { ...input, id: id("sp"), createdAt: t, updatedAt: t };
  db().bookingServicePeriods.push(rec);
  return rec;
}

export async function updateServicePeriod(
  periodId: string,
  patch: Partial<ServicePeriod>,
): Promise<ServicePeriod | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateServicePeriod(periodId, patch);
  const p = await getServicePeriod(periodId);
  if (!p) return undefined;
  Object.assign(p, patch, { updatedAt: now() });
  return p;
}

export async function deleteServicePeriod(periodId: string): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.deleteServicePeriod(periodId);
  const s = db();
  s.bookingServicePeriods = s.bookingServicePeriods.filter((p) => p.id !== periodId);
}

export async function getBookingSettings(companyId: string): Promise<BookingSettings | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getBookingSettings(companyId);
  return db().bookingSettings.find((s) => s.companyId === companyId);
}

export async function upsertBookingSettings(input: BookingSettings): Promise<BookingSettings> {
  if (isSupabaseConfigured()) return supabaseRepo.upsertBookingSettings(input);
  const s = db();
  const i = s.bookingSettings.findIndex((x) => x.companyId === input.companyId);
  const rec = { ...input, updatedAt: now() };
  if (i >= 0) s.bookingSettings[i] = rec;
  else s.bookingSettings.push(rec);
  return rec;
}

export async function listReservations(
  tenantId: string,
  companyId?: string,
): Promise<Reservation[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listReservations(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .reservations.filter((r) => ids.has(r.companyId) && (!companyId || r.companyId === companyId))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export async function getReservation(reservationId: string): Promise<Reservation | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getReservation(reservationId);
  return db().reservations.find((r) => r.id === reservationId);
}

export async function createReservation(
  input: Omit<Reservation, "id" | "createdAt" | "updatedAt">,
): Promise<Reservation> {
  if (isSupabaseConfigured()) return supabaseRepo.createReservation(input);
  const t = now();
  const rec: Reservation = { ...input, id: id("res"), createdAt: t, updatedAt: t };
  db().reservations.push(rec);
  return rec;
}

export async function updateReservation(
  reservationId: string,
  patch: Partial<Reservation>,
): Promise<Reservation | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateReservation(reservationId, patch);
  const r = await getReservation(reservationId);
  if (!r) return undefined;
  Object.assign(r, patch, { updatedAt: now() });
  return r;
}

// ---- V1 module 14: Photographer marketplace -----------------------------------------

export async function listPhotographerProfiles(tenantId: string): Promise<PhotographerProfile[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listPhotographerProfiles(tenantId);
  return db()
    .photographerProfiles.filter((p) => p.active && (p.tenantId === null || p.tenantId === tenantId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPhotographerProfile(
  photographerId: string,
): Promise<PhotographerProfile | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getPhotographerProfile(photographerId);
  return db().photographerProfiles.find((p) => p.id === photographerId);
}

export async function listPhotographerPackages(
  photographerId: string,
): Promise<PhotographerPackage[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listPhotographerPackages(photographerId);
  return db()
    .photographerPackages.filter((p) => p.photographerId === photographerId && p.active)
    .sort((a, b) => a.priceCents - b.priceCents);
}

export async function getPhotographerPackage(
  packageId: string,
): Promise<PhotographerPackage | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getPhotographerPackage(packageId);
  return db().photographerPackages.find((p) => p.id === packageId);
}

export async function listPhotoMarketplaceBookings(
  tenantId: string,
  companyId?: string,
): Promise<PhotoMarketplaceBooking[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listPhotoMarketplaceBookings(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return db()
    .photoMarketplaceBookings.filter(
      (b) => ids.has(b.companyId) && (!companyId || b.companyId === companyId),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPhotoMarketplaceBooking(
  bookingId: string,
): Promise<PhotoMarketplaceBooking | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getPhotoMarketplaceBooking(bookingId);
  return db().photoMarketplaceBookings.find((b) => b.id === bookingId);
}

export async function createPhotoMarketplaceBooking(
  input: Omit<PhotoMarketplaceBooking, "id" | "createdAt" | "updatedAt">,
): Promise<PhotoMarketplaceBooking> {
  if (isSupabaseConfigured()) return supabaseRepo.createPhotoMarketplaceBooking(input);
  const t = now();
  const rec: PhotoMarketplaceBooking = { ...input, id: id("pmb"), createdAt: t, updatedAt: t };
  db().photoMarketplaceBookings.push(rec);
  return rec;
}

export async function updatePhotoMarketplaceBooking(
  bookingId: string,
  patch: Partial<PhotoMarketplaceBooking>,
): Promise<PhotoMarketplaceBooking | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updatePhotoMarketplaceBooking(bookingId, patch);
  const b = await getPhotoMarketplaceBooking(bookingId);
  if (!b) return undefined;
  Object.assign(b, patch, { updatedAt: now() });
  return b;
}

// ---- Phase 5: Prompt templates -----------------------------------------------------

export async function listPromptTemplates(
  tenantId: string,
  companyId?: string,
): Promise<PromptTemplate[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listPromptTemplates(tenantId, companyId);
  return db()
    .promptTemplates.filter(
      (p) =>
        p.active &&
        (p.tenantId === null || p.tenantId === tenantId) &&
        (p.companyId === null || !companyId || p.companyId === companyId),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function getPromptTemplate(templateId: string): Promise<PromptTemplate | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getPromptTemplate(templateId);
  return db().promptTemplates.find((p) => p.id === templateId);
}
export async function createPromptTemplate(
  input: Omit<PromptTemplate, "id" | "createdAt">,
): Promise<PromptTemplate> {
  if (isSupabaseConfigured()) return supabaseRepo.createPromptTemplate(input);
  const rec: PromptTemplate = { ...input, id: id("pt"), createdAt: now() };
  db().promptTemplates.push(rec);
  return rec;
}
export async function setPromptTemplateActive(templateId: string, active: boolean): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.setPromptTemplateActive(templateId, active);
  const rec = db().promptTemplates.find((p) => p.id === templateId);
  if (rec) rec.active = active;
}

// ---- Phase 11: Creative Assets + Brand Templates -----------------------------------

export async function listAssets(
  tenantId: string,
  companyIds?: string[],
  opts: { status?: Asset["status"]; approvedOnly?: boolean } = {},
): Promise<Asset[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listAssets(tenantId, companyIds, opts);
  const tids = tenantCompanyIdSet(tenantId);
  let assets = db().assets.filter((a) => tids.has(a.companyId));
  if (companyIds) {
    const allowed = new Set(companyIds);
    assets = assets.filter((a) => allowed.has(a.companyId));
  }
  if (opts.approvedOnly) assets = assets.filter((a) => a.status === "approved");
  else if (opts.status) assets = assets.filter((a) => a.status === opts.status);
  return assets.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function listAssetsForCompany(
  companyId: string,
  opts: { approvedOnly?: boolean } = {},
): Promise<Asset[]> {
  const company = await getCompany(companyId);
  if (!company) return [];
  return await listAssets(company.tenantId, [companyId], opts);
}
export async function getAsset(assetId: string): Promise<Asset | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getAsset(assetId);
  return db().assets.find((a) => a.id === assetId);
}
export async function createAsset(
  input: Omit<Asset, "id" | "createdAt" | "updatedAt">,
): Promise<Asset> {
  if (isSupabaseConfigured()) return supabaseRepo.createAsset(input);
  const time = now();
  const asset: Asset = { ...input, id: id("as"), createdAt: time, updatedAt: time };
  db().assets.push(asset);
  return asset;
}
export async function updateAsset(
  assetId: string,
  patch: Partial<Asset>,
): Promise<Asset | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateAsset(assetId, patch);
  const a = await getAsset(assetId);
  if (!a) return undefined;
  Object.assign(a, patch, { updatedAt: now() });
  return a;
}

export async function listBrandTemplates(
  tenantId: string,
  companyId?: string,
): Promise<BrandTemplate[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listBrandTemplates(tenantId, companyId);
  return db()
    .brandTemplates.filter(
      (t) =>
        t.active &&
        (t.tenantId === null || t.tenantId === tenantId) &&
        (t.companyId === null || !companyId || t.companyId === companyId),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
export async function getBrandTemplate(templateId: string): Promise<BrandTemplate | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getBrandTemplate(templateId);
  return db().brandTemplates.find((t) => t.id === templateId);
}
export async function createBrandTemplate(
  input: Omit<BrandTemplate, "id" | "createdAt" | "updatedAt">,
): Promise<BrandTemplate> {
  if (isSupabaseConfigured()) return supabaseRepo.createBrandTemplate(input);
  const time = now();
  const tpl: BrandTemplate = { ...input, id: id("bt"), createdAt: time, updatedAt: time };
  db().brandTemplates.push(tpl);
  return tpl;
}
export async function setBrandTemplateActive(templateId: string, active: boolean): Promise<void> {
  if (isSupabaseConfigured()) return supabaseRepo.setBrandTemplateActive(templateId, active);
  const tpl = await getBrandTemplate(templateId);
  if (tpl) {
    tpl.active = active;
    tpl.updatedAt = now();
  }
}

// ---- Phase 12: Enterprise Automation -----------------------------------------------

export async function getAutomationSettings(
  tenantId: string,
): Promise<AutomationSettings> {
  if (isSupabaseConfigured()) return supabaseRepo.getAutomationSettings(tenantId);
  let a = db().automation.find((x) => x.tenantId === tenantId);
  if (!a) {
    a = {
      tenantId,
      enabled: false,
      draftCampaignSuggestions: true,
      monthlyContentGeneration: true,
      analyticsSummaries: true,
      contentAlerts: true,
      lowRiskAutoResponses: false,
      maxCampaignsPerRun: 2,
      maxDraftsPerCompany: 2,
      updatedAt: now(),
    };
    db().automation.push(a);
  }
  return a;
}
export async function updateAutomationSettings(
  tenantId: string,
  patch: Partial<Omit<AutomationSettings, "tenantId">>,
): Promise<AutomationSettings> {
  if (isSupabaseConfigured()) return supabaseRepo.updateAutomationSettings(tenantId, patch);
  const a = await getAutomationSettings(tenantId);
  Object.assign(a, patch, { updatedAt: now() });
  return a;
}
export async function appendAutomationRun(
  input: Omit<AutomationRun, "id" | "createdAt">,
): Promise<AutomationRun> {
  if (isSupabaseConfigured()) return supabaseRepo.appendAutomationRun(input);
  const run: AutomationRun = { ...input, id: id("auto"), createdAt: now() };
  db().automationRuns.push(run);
  return run;
}
export async function listAutomationRuns(tenantId: string): Promise<AutomationRun[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listAutomationRuns(tenantId);
  return db()
    .automationRuns.filter((r) => r.tenantId === tenantId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// AI Risk Control Centre: every AI invocation is recorded (master prompt §52).
export async function logAiRun(input: Omit<AiRun, "id" | "createdAt">): Promise<AiRun> {
  if (isSupabaseConfigured()) return supabaseRepo.logAiRun(input);
  const run: AiRun = { ...input, id: id("run"), createdAt: now() };
  db().aiRuns.push(run);
  return run;
}
export async function listAiRuns(
  tenantId: string,
  companyIds?: string[],
): Promise<AiRun[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listAiRuns(tenantId, companyIds);
  let runs = db().aiRuns.filter((r) => r.tenantId === tenantId);
  if (companyIds) {
    const allowed = new Set(companyIds);
    runs = runs.filter((r) => !r.companyId || allowed.has(r.companyId));
  }
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---- Email marketing (W3 M31) ------------------------------------------------

export async function listEmailTemplates(tenantId: string, companyId?: string): Promise<EmailTemplate[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listEmailTemplates(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return (db().emailTemplates ?? []).filter((t) => ids.has(t.companyId) && (!companyId || t.companyId === companyId)).sort((a, b) => a.name.localeCompare(b.name));
}
export async function getEmailTemplate(templateId: string): Promise<EmailTemplate | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getEmailTemplate(templateId);
  return (db().emailTemplates ?? []).find((t) => t.id === templateId);
}
export async function createEmailTemplate(input: Omit<EmailTemplate, "id" | "createdAt" | "updatedAt">): Promise<EmailTemplate> {
  if (isSupabaseConfigured()) return supabaseRepo.createEmailTemplate(input);
  const time = now();
  const rec: EmailTemplate = { ...input, id: id("etpl"), createdAt: time, updatedAt: time };
  (db().emailTemplates ??= []).push(rec);
  return rec;
}
export async function updateEmailTemplate(templateId: string, patch: Partial<EmailTemplate>): Promise<EmailTemplate | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateEmailTemplate(templateId, patch);
  const rec = await getEmailTemplate(templateId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}
export async function listEmailSubscribers(companyId: string): Promise<EmailSubscriber[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listEmailSubscribers(companyId);
  return (db().emailSubscribers ?? []).filter((s) => s.companyId === companyId).sort((a, b) => a.email.localeCompare(b.email));
}
export async function getEmailSubscriber(subscriberId: string): Promise<EmailSubscriber | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getEmailSubscriber(subscriberId);
  return (db().emailSubscribers ?? []).find((s) => s.id === subscriberId);
}
export async function createEmailSubscriber(input: Omit<EmailSubscriber, "id" | "createdAt" | "updatedAt">): Promise<EmailSubscriber> {
  if (isSupabaseConfigured()) return supabaseRepo.createEmailSubscriber(input);
  const time = now();
  const rec: EmailSubscriber = { ...input, id: id("esub"), createdAt: time, updatedAt: time };
  (db().emailSubscribers ??= []).push(rec);
  return rec;
}
export async function updateEmailSubscriber(subscriberId: string, patch: Partial<EmailSubscriber>): Promise<EmailSubscriber | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateEmailSubscriber(subscriberId, patch);
  const rec = await getEmailSubscriber(subscriberId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}
export async function listEmailCampaigns(tenantId: string, companyId?: string): Promise<EmailCampaign[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listEmailCampaigns(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return (db().emailCampaigns ?? []).filter((c) => ids.has(c.companyId) && (!companyId || c.companyId === companyId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
export async function getEmailCampaign(campaignId: string): Promise<EmailCampaign | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getEmailCampaign(campaignId);
  return (db().emailCampaigns ?? []).find((c) => c.id === campaignId);
}
export async function createEmailCampaign(input: Omit<EmailCampaign, "id" | "createdAt" | "updatedAt">): Promise<EmailCampaign> {
  if (isSupabaseConfigured()) return supabaseRepo.createEmailCampaign(input);
  const time = now();
  const rec: EmailCampaign = { ...input, id: id("ecmp"), createdAt: time, updatedAt: time };
  (db().emailCampaigns ??= []).push(rec);
  return rec;
}
export async function updateEmailCampaign(campaignId: string, patch: Partial<EmailCampaign>): Promise<EmailCampaign | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateEmailCampaign(campaignId, patch);
  const rec = await getEmailCampaign(campaignId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

// ---- Reviews (W3 M33) --------------------------------------------------------

export async function listCompanyReviews(tenantId: string, companyIdsFilter?: string[], status?: CompanyReview["status"]): Promise<CompanyReview[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCompanyReviews(tenantId, companyIdsFilter, status);
  const ids = tenantCompanyIdSet(tenantId);
  return (db().companyReviews ?? []).filter((r) => ids.has(r.companyId) && (!companyIdsFilter?.length || companyIdsFilter.includes(r.companyId)) && (!status || r.status === status));
}
export async function getCompanyReview(reviewId: string): Promise<CompanyReview | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCompanyReview(reviewId);
  return (db().companyReviews ?? []).find((r) => r.id === reviewId);
}
export async function createCompanyReview(input: Omit<CompanyReview, "id">): Promise<CompanyReview> {
  if (isSupabaseConfigured()) return supabaseRepo.createCompanyReview(input);
  const rec: CompanyReview = { ...input, id: id("rev") };
  (db().companyReviews ??= []).push(rec);
  return rec;
}
export async function updateCompanyReview(reviewId: string, patch: Partial<CompanyReview>): Promise<CompanyReview | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateCompanyReview(reviewId, patch);
  const rec = await getCompanyReview(reviewId);
  if (!rec) return undefined;
  Object.assign(rec, patch);
  return rec;
}
export async function listReviewRequestCampaigns(tenantId: string, companyIdsFilter?: string[]): Promise<ReviewRequestCampaign[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listReviewRequestCampaigns(tenantId, companyIdsFilter);
  const ids = tenantCompanyIdSet(tenantId);
  return (db().reviewRequestCampaigns ?? []).filter((c) => ids.has(c.companyId) && (!companyIdsFilter?.length || companyIdsFilter.includes(c.companyId)));
}
export async function getReviewRequestCampaign(campaignId: string): Promise<ReviewRequestCampaign | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getReviewRequestCampaign(campaignId);
  return (db().reviewRequestCampaigns ?? []).find((c) => c.id === campaignId);
}
export async function createReviewRequestCampaign(input: Omit<ReviewRequestCampaign, "id" | "createdAt" | "updatedAt">): Promise<ReviewRequestCampaign> {
  if (isSupabaseConfigured()) return supabaseRepo.createReviewRequestCampaign(input);
  const time = now();
  const rec: ReviewRequestCampaign = { ...input, id: id("rrc"), createdAt: time, updatedAt: time };
  (db().reviewRequestCampaigns ??= []).push(rec);
  return rec;
}
export async function updateReviewRequestCampaign(campaignId: string, patch: Partial<ReviewRequestCampaign>): Promise<ReviewRequestCampaign | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateReviewRequestCampaign(campaignId, patch);
  const rec = await getReviewRequestCampaign(campaignId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

// ---- CRM (W3 M30) ------------------------------------------------------------

export async function listCrmContacts(tenantId: string, companyId?: string): Promise<CrmContact[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().crmContacts ?? []).filter((c) => ids.has(c.companyId) && (!companyId || c.companyId === companyId));
}
export async function getCrmContact(contactId: string): Promise<CrmContact | undefined> {
  return (db().crmContacts ?? []).find((c) => c.id === contactId);
}
export async function createCrmContact(input: Omit<CrmContact, "id" | "createdAt" | "updatedAt">): Promise<CrmContact> {
  const time = now();
  const rec: CrmContact = { ...input, id: id("crm"), createdAt: time, updatedAt: time };
  (db().crmContacts ??= []).push(rec);
  return rec;
}
export async function updateCrmContact(contactId: string, patch: Partial<CrmContact>): Promise<CrmContact | undefined> {
  const rec = await getCrmContact(contactId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}
export async function listCrmSegments(tenantId: string, companyId?: string): Promise<CrmSegment[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().crmSegments ?? []).filter((s) => ids.has(s.companyId) && (!companyId || s.companyId === companyId));
}
export async function createCrmSegment(input: Omit<CrmSegment, "id" | "createdAt" | "updatedAt">): Promise<CrmSegment> {
  const time = now();
  const rec: CrmSegment = { ...input, id: id("seg"), createdAt: time, updatedAt: time };
  (db().crmSegments ??= []).push(rec);
  return rec;
}
export async function listCrmInteractions(tenantId: string, companyId?: string): Promise<CrmInteraction[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().crmInteractions ?? []).filter((ix) => ids.has(ix.companyId) && (!companyId || ix.companyId === companyId));
}
export async function createCrmInteraction(input: Omit<CrmInteraction, "id">): Promise<CrmInteraction> {
  const rec: CrmInteraction = { ...input, id: id("ix") };
  (db().crmInteractions ??= []).push(rec);
  return rec;
}

// ---- SMS (W3 M32) ------------------------------------------------------------

export async function listSmsSubscribers(companyId: string): Promise<SmsSubscriber[]> {
  return (db().smsSubscribers ?? []).filter((s) => s.companyId === companyId);
}
export async function getSmsSubscriber(subscriberId: string): Promise<SmsSubscriber | undefined> {
  return (db().smsSubscribers ?? []).find((s) => s.id === subscriberId);
}
export async function createSmsSubscriber(input: Omit<SmsSubscriber, "id" | "createdAt" | "updatedAt">): Promise<SmsSubscriber> {
  const time = now();
  const rec: SmsSubscriber = { ...input, id: id("ssub"), createdAt: time, updatedAt: time };
  (db().smsSubscribers ??= []).push(rec);
  return rec;
}
export async function updateSmsSubscriber(subscriberId: string, patch: Partial<SmsSubscriber>): Promise<SmsSubscriber | undefined> {
  const rec = await getSmsSubscriber(subscriberId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}
export async function listSmsCampaigns(tenantId: string, companyId?: string): Promise<SmsCampaign[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().smsCampaigns ?? []).filter((c) => ids.has(c.companyId) && (!companyId || c.companyId === companyId));
}
export async function getSmsCampaign(campaignId: string): Promise<SmsCampaign | undefined> {
  return (db().smsCampaigns ?? []).find((c) => c.id === campaignId);
}
export async function createSmsCampaign(input: Omit<SmsCampaign, "id" | "createdAt" | "updatedAt">): Promise<SmsCampaign> {
  const time = now();
  const rec: SmsCampaign = { ...input, id: id("scmp"), createdAt: time, updatedAt: time };
  (db().smsCampaigns ??= []).push(rec);
  return rec;
}
export async function updateSmsCampaign(campaignId: string, patch: Partial<SmsCampaign>): Promise<SmsCampaign | undefined> {
  const rec = await getSmsCampaign(campaignId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}
export async function getSmsCompanySettings(companyId: string): Promise<SmsCompanySettings | undefined> {
  return (db().smsCompanySettings ?? []).find((s) => s.companyId === companyId);
}
export async function upsertSmsCompanySettings(input: SmsCompanySettings): Promise<SmsCompanySettings> {
  const list = db().smsCompanySettings ??= [];
  const idx = list.findIndex((s) => s.companyId === input.companyId);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...input, updatedAt: now() };
    return list[idx]!;
  }
  const rec = { ...input, updatedAt: input.updatedAt ?? now() };
  list.push(rec);
  return rec;
}

// ---- Loyalty (W4 M37) --------------------------------------------------------

export async function getLoyaltyProgram(companyId: string): Promise<LoyaltyProgram | undefined> {
  return (db().loyaltyPrograms ?? []).find((p) => p.companyId === companyId);
}
export async function upsertLoyaltyProgram(input: LoyaltyProgram): Promise<LoyaltyProgram> {
  const list = db().loyaltyPrograms ??= [];
  const idx = list.findIndex((p) => p.companyId === input.companyId);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...input, updatedAt: now() };
    return list[idx]!;
  }
  const rec = { ...input, updatedAt: input.updatedAt ?? now() };
  list.push(rec);
  return rec;
}
export async function listLoyaltyTiers(tenantId: string, companyId?: string): Promise<LoyaltyTier[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().loyaltyTiers ?? [])
    .filter((t) => ids.has(t.companyId) && (!companyId || t.companyId === companyId))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.thresholdPoints - b.thresholdPoints);
}
export async function createLoyaltyTier(input: Omit<LoyaltyTier, "id" | "createdAt" | "updatedAt">): Promise<LoyaltyTier> {
  const time = now();
  const rec: LoyaltyTier = { ...input, id: id("ltier"), createdAt: time, updatedAt: time };
  (db().loyaltyTiers ??= []).push(rec);
  return rec;
}
export async function listLoyaltyMembers(tenantId: string, companyId?: string): Promise<LoyaltyMember[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().loyaltyMembers ?? []).filter((m) => ids.has(m.companyId) && (!companyId || m.companyId === companyId));
}
export async function getLoyaltyMember(memberId: string): Promise<LoyaltyMember | undefined> {
  return (db().loyaltyMembers ?? []).find((m) => m.id === memberId);
}
export async function createLoyaltyMember(input: Omit<LoyaltyMember, "id" | "createdAt" | "updatedAt">): Promise<LoyaltyMember> {
  const time = now();
  const rec: LoyaltyMember = { ...input, id: id("lmem"), createdAt: time, updatedAt: time };
  (db().loyaltyMembers ??= []).push(rec);
  return rec;
}
export async function updateLoyaltyMember(memberId: string, patch: Partial<LoyaltyMember>): Promise<LoyaltyMember | undefined> {
  const rec = await getLoyaltyMember(memberId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}
export async function listLoyaltyCoupons(tenantId: string, companyId?: string): Promise<LoyaltyCoupon[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().loyaltyCoupons ?? []).filter((c) => ids.has(c.companyId) && (!companyId || c.companyId === companyId));
}
export async function getLoyaltyCoupon(couponId: string): Promise<LoyaltyCoupon | undefined> {
  return (db().loyaltyCoupons ?? []).find((c) => c.id === couponId);
}
export async function createLoyaltyCoupon(input: Omit<LoyaltyCoupon, "id" | "createdAt" | "updatedAt" | "redemptionCount">): Promise<LoyaltyCoupon> {
  const time = now();
  const rec: LoyaltyCoupon = { ...input, id: id("lcoup"), redemptionCount: 0, createdAt: time, updatedAt: time };
  (db().loyaltyCoupons ??= []).push(rec);
  return rec;
}
export async function updateLoyaltyCoupon(couponId: string, patch: Partial<LoyaltyCoupon>): Promise<LoyaltyCoupon | undefined> {
  const rec = await getLoyaltyCoupon(couponId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}
export async function listLoyaltyReferrals(tenantId: string, companyId?: string): Promise<LoyaltyReferral[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().loyaltyReferrals ?? []).filter((r) => ids.has(r.companyId) && (!companyId || r.companyId === companyId));
}
export async function createLoyaltyReferral(input: Omit<LoyaltyReferral, "id">): Promise<LoyaltyReferral> {
  const rec: LoyaltyReferral = { ...input, id: id("lref") };
  (db().loyaltyReferrals ??= []).push(rec);
  return rec;
}
export async function updateLoyaltyReferral(referralId: string, patch: Partial<LoyaltyReferral>): Promise<LoyaltyReferral | undefined> {
  const rec = (db().loyaltyReferrals ?? []).find((r) => r.id === referralId);
  if (!rec) return undefined;
  Object.assign(rec, patch);
  return rec;
}
export async function listLoyaltyRedemptions(tenantId: string, companyId?: string): Promise<LoyaltyRedemption[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().loyaltyRedemptions ?? []).filter((r) => ids.has(r.companyId) && (!companyId || r.companyId === companyId));
}
export async function createLoyaltyRedemption(input: Omit<LoyaltyRedemption, "id">): Promise<LoyaltyRedemption> {
  const rec: LoyaltyRedemption = { ...input, id: id("lred") };
  (db().loyaltyRedemptions ??= []).push(rec);
  return rec;
}

// ---- Website CMS (W4 M34) ----------------------------------------------------

export async function listCmsPages(tenantId: string, companyId?: string): Promise<CmsPage[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCmsPages(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return (db().cmsPages ?? [])
    .filter((p) => ids.has(p.companyId) && (!companyId || p.companyId === companyId))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCmsPage(pageId: string): Promise<CmsPage | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCmsPage(pageId);
  return (db().cmsPages ?? []).find((p) => p.id === pageId);
}

export async function createCmsPage(input: Omit<CmsPage, "id" | "createdAt" | "updatedAt">): Promise<CmsPage> {
  if (isSupabaseConfigured()) return supabaseRepo.createCmsPage(input);
  const time = now();
  const rec: CmsPage = { ...input, id: id("cmsp"), createdAt: time, updatedAt: time };
  (db().cmsPages ??= []).push(rec);
  return rec;
}

export async function updateCmsPage(pageId: string, patch: Partial<CmsPage>): Promise<CmsPage | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateCmsPage(pageId, patch);
  const rec = await getCmsPage(pageId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

export async function listCmsPageVersions(tenantId: string, pageId: string): Promise<CmsPageVersion[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCmsPageVersions(tenantId, pageId);
  const ids = tenantCompanyIdSet(tenantId);
  return (db().cmsPageVersions ?? [])
    .filter((v) => v.pageId === pageId && ids.has(v.companyId))
    .sort((a, b) => b.versionNumber - a.versionNumber);
}

export async function listCmsPageVersionsForPage(pageId: string): Promise<CmsPageVersion[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCmsPageVersionsForPage(pageId);
  return (db().cmsPageVersions ?? [])
    .filter((v) => v.pageId === pageId)
    .sort((a, b) => b.versionNumber - a.versionNumber);
}

export async function getCmsPageVersion(versionId: string): Promise<CmsPageVersion | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCmsPageVersion(versionId);
  return (db().cmsPageVersions ?? []).find((v) => v.id === versionId);
}

export async function createCmsPageVersion(input: Omit<CmsPageVersion, "id" | "createdAt">): Promise<CmsPageVersion> {
  if (isSupabaseConfigured()) return supabaseRepo.createCmsPageVersion(input);
  const rec: CmsPageVersion = { ...input, id: id("cmsv"), createdAt: now() };
  (db().cmsPageVersions ??= []).push(rec);
  return rec;
}

export async function updateCmsPageVersion(versionId: string, patch: Partial<CmsPageVersion>): Promise<CmsPageVersion | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateCmsPageVersion(versionId, patch);
  const rec = await getCmsPageVersion(versionId);
  if (!rec) return undefined;
  Object.assign(rec, patch);
  return rec;
}

export async function getCmsSeoMetadata(pageId: string): Promise<CmsSeoMetadata | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCmsSeoMetadata(pageId);
  return (db().cmsSeoMetadata ?? []).find((s) => s.pageId === pageId);
}

export async function upsertCmsSeoMetadata(
  pageId: string,
  companyId: string,
  input: Omit<CmsSeoMetadata, "id" | "pageId" | "companyId" | "createdAt" | "updatedAt">,
): Promise<CmsSeoMetadata> {
  if (isSupabaseConfigured()) return supabaseRepo.upsertCmsSeoMetadata(pageId, companyId, input);
  const list = db().cmsSeoMetadata ??= [];
  const idx = list.findIndex((s) => s.pageId === pageId);
  const time = now();
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...input, updatedAt: time };
    return list[idx]!;
  }
  const rec: CmsSeoMetadata = { ...input, id: id("cmss"), pageId, companyId, createdAt: time, updatedAt: time };
  list.push(rec);
  return rec;
}

export async function listCmsUpdateRequests(tenantId: string, companyId?: string): Promise<CmsUpdateRequest[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCmsUpdateRequests(tenantId, companyId);
  const ids = tenantCompanyIdSet(tenantId);
  return (db().cmsUpdateRequests ?? [])
    .filter((r) => ids.has(r.companyId) && (!companyId || r.companyId === companyId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCmsUpdateRequest(requestId: string): Promise<CmsUpdateRequest | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCmsUpdateRequest(requestId);
  return (db().cmsUpdateRequests ?? []).find((r) => r.id === requestId);
}

export async function createCmsUpdateRequest(
  input: Omit<CmsUpdateRequest, "id" | "createdAt" | "updatedAt">,
): Promise<CmsUpdateRequest> {
  if (isSupabaseConfigured()) return supabaseRepo.createCmsUpdateRequest(input);
  const time = now();
  const rec: CmsUpdateRequest = { ...input, id: id("cmsr"), createdAt: time, updatedAt: time };
  (db().cmsUpdateRequests ??= []).push(rec);
  return rec;
}

export async function updateCmsUpdateRequest(
  requestId: string,
  patch: Partial<CmsUpdateRequest>,
): Promise<CmsUpdateRequest | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateCmsUpdateRequest(requestId, patch);
  const rec = await getCmsUpdateRequest(requestId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: patch.updatedAt ?? now() });
  return rec;
}

// ---- Funnel (W4 M35) ---------------------------------------------------------

export async function listFunnelJourneys(tenantId: string, companyId?: string): Promise<FunnelJourney[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().funnelJourneys ?? []).filter((j) => ids.has(j.companyId) && (!companyId || j.companyId === companyId));
}
export async function getFunnelJourney(journeyId: string): Promise<FunnelJourney | undefined> {
  return (db().funnelJourneys ?? []).find((j) => j.id === journeyId);
}
export async function createFunnelJourney(input: Omit<FunnelJourney, "id" | "createdAt" | "updatedAt">): Promise<FunnelJourney> {
  const time = now();
  const rec: FunnelJourney = { ...input, id: id("fj"), createdAt: time, updatedAt: time };
  (db().funnelJourneys ??= []).push(rec);
  return rec;
}
export async function updateFunnelJourney(journeyId: string, patch: Partial<FunnelJourney>): Promise<FunnelJourney | undefined> {
  const rec = await getFunnelJourney(journeyId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

export async function listConversionFunnels(tenantId: string, companyId?: string): Promise<ConversionFunnel[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().conversionFunnels ?? []).filter((f) => ids.has(f.companyId) && (!companyId || f.companyId === companyId));
}
export async function getConversionFunnel(funnelId: string): Promise<ConversionFunnel | undefined> {
  return (db().conversionFunnels ?? []).find((f) => f.id === funnelId);
}
export async function createConversionFunnel(input: Omit<ConversionFunnel, "id" | "createdAt" | "updatedAt">): Promise<ConversionFunnel> {
  const time = now();
  const rec: ConversionFunnel = { ...input, id: id("fnl"), createdAt: time, updatedAt: time };
  (db().conversionFunnels ??= []).push(rec);
  return rec;
}
export async function updateConversionFunnel(funnelId: string, patch: Partial<ConversionFunnel>): Promise<ConversionFunnel | undefined> {
  const rec = await getConversionFunnel(funnelId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

export async function listFunnelLandingPages(tenantId: string, companyId?: string): Promise<FunnelLandingPage[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().funnelLandingPages ?? []).filter((p) => ids.has(p.companyId) && (!companyId || p.companyId === companyId));
}
export async function getFunnelLandingPage(pageId: string): Promise<FunnelLandingPage | undefined> {
  return (db().funnelLandingPages ?? []).find((p) => p.id === pageId);
}
export async function createFunnelLandingPage(input: Omit<FunnelLandingPage, "id" | "createdAt" | "updatedAt">): Promise<FunnelLandingPage> {
  const time = now();
  const rec: FunnelLandingPage = { ...input, id: id("flp"), createdAt: time, updatedAt: time };
  (db().funnelLandingPages ??= []).push(rec);
  return rec;
}
export async function updateFunnelLandingPage(pageId: string, patch: Partial<FunnelLandingPage>): Promise<FunnelLandingPage | undefined> {
  const rec = await getFunnelLandingPage(pageId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

export async function listFunnelAbExperiments(tenantId: string, companyId?: string): Promise<FunnelAbExperiment[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().funnelAbExperiments ?? []).filter((e) => ids.has(e.companyId) && (!companyId || e.companyId === companyId));
}
export async function getFunnelAbExperiment(experimentId: string): Promise<FunnelAbExperiment | undefined> {
  return (db().funnelAbExperiments ?? []).find((e) => e.id === experimentId);
}
export async function createFunnelAbExperiment(input: Omit<FunnelAbExperiment, "id" | "createdAt" | "updatedAt">): Promise<FunnelAbExperiment> {
  const time = now();
  const rec: FunnelAbExperiment = { ...input, id: id("fab"), createdAt: time, updatedAt: time };
  (db().funnelAbExperiments ??= []).push(rec);
  return rec;
}
export async function updateFunnelAbExperiment(experimentId: string, patch: Partial<FunnelAbExperiment>): Promise<FunnelAbExperiment | undefined> {
  const rec = await getFunnelAbExperiment(experimentId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

// ---- Marketing automation workflows (W4 M36) ---------------------------------

export async function listMarketingWorkflows(
  tenantId: string,
  opts?: { companyId?: string; agencyTemplatesOnly?: boolean },
): Promise<MarketingWorkflow[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().marketingWorkflows ?? [])
    .filter((w) => {
      if (w.tenantId !== tenantId) return false;
      if (opts?.agencyTemplatesOnly) return w.isAgencyTemplate;
      if (opts?.companyId) return w.companyId === opts.companyId;
      return w.isAgencyTemplate || (w.companyId != null && ids.has(w.companyId));
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getMarketingWorkflow(workflowId: string): Promise<MarketingWorkflow | undefined> {
  return (db().marketingWorkflows ?? []).find((w) => w.id === workflowId);
}

export async function createMarketingWorkflow(
  input: Omit<MarketingWorkflow, "id" | "createdAt" | "updatedAt">,
): Promise<MarketingWorkflow> {
  const time = now();
  const rec: MarketingWorkflow = { ...input, id: id("wf"), createdAt: time, updatedAt: time };
  (db().marketingWorkflows ??= []).push(rec);
  return rec;
}

export async function updateMarketingWorkflow(
  workflowId: string,
  patch: Partial<MarketingWorkflow>,
): Promise<MarketingWorkflow | undefined> {
  const rec = await getMarketingWorkflow(workflowId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

export async function getMarketingWorkflowSettings(
  companyId: string,
): Promise<MarketingWorkflowSettings | undefined> {
  return (db().marketingWorkflowSettings ?? []).find((s) => s.companyId === companyId);
}

export async function upsertMarketingWorkflowSettings(
  input: MarketingWorkflowSettings,
): Promise<MarketingWorkflowSettings> {
  const list = db().marketingWorkflowSettings ??= [];
  const idx = list.findIndex((s) => s.companyId === input.companyId);
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...input, updatedAt: now() };
    return list[idx]!;
  }
  const rec = { ...input, updatedAt: input.updatedAt ?? now() };
  list.push(rec);
  return rec;
}

export async function listWorkflowDispatchLogs(
  tenantId: string,
  companyId?: string,
): Promise<WorkflowDispatchLog[]> {
  const ids = tenantCompanyIdSet(tenantId);
  return (db().workflowDispatchLogs ?? [])
    .filter((l) => ids.has(l.companyId) && (!companyId || l.companyId === companyId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createWorkflowDispatchLog(
  input: Omit<WorkflowDispatchLog, "id" | "createdAt">,
): Promise<WorkflowDispatchLog> {
  const rec: WorkflowDispatchLog = { ...input, id: id("wfd"), createdAt: now() };
  (db().workflowDispatchLogs ??= []).push(rec);
  return rec;
}

export async function listRagKnowledgeSources(
  companyId: string,
  includeInactive = false,
): Promise<RagKnowledgeSource[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listRagKnowledgeSources(companyId, includeInactive);
  return (db().ragKnowledgeSources ?? [])
    .filter((s) => s.companyId === companyId && (includeInactive || s.status === "approved"))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getRagKnowledgeSource(sourceId: string): Promise<RagKnowledgeSource | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getRagKnowledgeSource(sourceId);
  return (db().ragKnowledgeSources ?? []).find((s) => s.id === sourceId);
}

export async function createRagKnowledgeSource(
  input: Omit<RagKnowledgeSource, "id" | "createdAt" | "updatedAt">,
): Promise<RagKnowledgeSource> {
  if (isSupabaseConfigured()) return supabaseRepo.createRagKnowledgeSource(input);
  const time = now();
  const rec: RagKnowledgeSource = { ...input, id: id("rks"), createdAt: time, updatedAt: time };
  (db().ragKnowledgeSources ??= []).push(rec);
  return rec;
}

export async function updateRagKnowledgeSource(
  sourceId: string,
  patch: Partial<RagKnowledgeSource>,
): Promise<RagKnowledgeSource | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateRagKnowledgeSource(sourceId, patch);
  const rec = await getRagKnowledgeSource(sourceId);
  if (!rec) return undefined;
  Object.assign(rec, patch, { updatedAt: now() });
  return rec;
}

export async function listRagKnowledgeVersionsForSource(
  sourceId: string,
): Promise<RagKnowledgeVersion[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listRagKnowledgeVersionsForSource(sourceId);
  return (db().ragKnowledgeVersions ?? [])
    .filter((v) => v.sourceId === sourceId)
    .sort((a, b) => b.versionNumber - a.versionNumber);
}

export async function getRagKnowledgeVersion(versionId: string): Promise<RagKnowledgeVersion | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getRagKnowledgeVersion(versionId);
  return (db().ragKnowledgeVersions ?? []).find((v) => v.id === versionId);
}

export async function createRagKnowledgeVersion(
  input: Omit<RagKnowledgeVersion, "id" | "createdAt">,
): Promise<RagKnowledgeVersion> {
  if (isSupabaseConfigured()) return supabaseRepo.createRagKnowledgeVersion(input);
  const rec: RagKnowledgeVersion = { ...input, id: id("rkv"), createdAt: now() };
  (db().ragKnowledgeVersions ??= []).push(rec);
  return rec;
}

export async function updateRagKnowledgeVersion(
  versionId: string,
  patch: Partial<RagKnowledgeVersion>,
): Promise<RagKnowledgeVersion | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateRagKnowledgeVersion(versionId, patch);
  const rec = await getRagKnowledgeVersion(versionId);
  if (!rec) return undefined;
  Object.assign(rec, patch);
  return rec;
}

// ---- W5 M43: Campaign builder persistence -----------------------------------

export async function listCampaignPlanVersions(campaignId: string): Promise<CampaignPlanVersion[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCampaignPlanVersions(campaignId);
  return (db().campaignPlanVersions ?? [])
    .filter((v) => v.campaignId === campaignId)
    .sort((a, b) => b.versionNumber - a.versionNumber);
}

export async function createCampaignPlanVersion(
  input: Omit<CampaignPlanVersion, "id" | "createdAt">,
): Promise<CampaignPlanVersion> {
  if (isSupabaseConfigured()) return supabaseRepo.createCampaignPlanVersion(input);
  const rec: CampaignPlanVersion = { ...input, id: id("cpv"), createdAt: now() };
  (db().campaignPlanVersions ??= []).push(rec);
  return rec;
}

export async function listCampaignBuilderRuns(companyId: string): Promise<CampaignBuilderRun[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCampaignBuilderRuns(companyId);
  return (db().campaignBuilderRuns ?? [])
    .filter((r) => r.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createCampaignBuilderRun(
  input: Omit<CampaignBuilderRun, "id" | "createdAt">,
): Promise<CampaignBuilderRun> {
  if (isSupabaseConfigured()) return supabaseRepo.createCampaignBuilderRun(input);
  const rec: CampaignBuilderRun = { ...input, id: id("cbr"), createdAt: now() };
  (db().campaignBuilderRuns ??= []).push(rec);
  return rec;
}

export async function listCampaignDraftScheduleItems(campaignId: string): Promise<CampaignDraftScheduleItem[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCampaignDraftScheduleItems(campaignId);
  return (db().campaignDraftScheduleItems ?? [])
    .filter((s) => s.campaignId === campaignId)
    .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
}

export async function createCampaignDraftScheduleItem(
  input: Omit<CampaignDraftScheduleItem, "id" | "createdAt">,
): Promise<CampaignDraftScheduleItem> {
  if (isSupabaseConfigured()) return supabaseRepo.createCampaignDraftScheduleItem(input);
  const rec: CampaignDraftScheduleItem = { ...input, id: id("cds"), createdAt: now() };
  (db().campaignDraftScheduleItems ??= []).push(rec);
  return rec;
}

// ---- W7 M55: Continuous learning ---------------------------------------------------

export async function listLearningHypotheses(
  tenantId: string,
  companyIds?: string[],
): Promise<LearningHypothesis[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listLearningHypotheses(tenantId, companyIds);
  let rows = (db().learningHypotheses ?? []).filter((h) => h.tenantId === tenantId);
  if (companyIds?.length) {
    const allowed = new Set(companyIds);
    rows = rows.filter((h) => allowed.has(h.companyId));
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getLearningHypothesis(
  hypothesisId: string,
): Promise<LearningHypothesis | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getLearningHypothesis(hypothesisId);
  return (db().learningHypotheses ?? []).find((h) => h.id === hypothesisId);
}

export async function createLearningHypothesis(
  input: Omit<LearningHypothesis, "id" | "createdAt" | "updatedAt">,
): Promise<LearningHypothesis> {
  if (isSupabaseConfigured()) return supabaseRepo.createLearningHypothesis(input);
  const t = now();
  const row: LearningHypothesis = { ...input, id: id("lhyp"), createdAt: t, updatedAt: t };
  (db().learningHypotheses ??= []).push(row);
  return row;
}

export async function updateLearningHypothesis(
  hypothesisId: string,
  patch: Partial<LearningHypothesis>,
): Promise<LearningHypothesis | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateLearningHypothesis(hypothesisId, patch);
  const row = await getLearningHypothesis(hypothesisId);
  if (!row) return undefined;
  Object.assign(row, patch, { updatedAt: now() });
  return row;
}

export async function listLearningLessons(
  tenantId: string,
  companyIds?: string[],
): Promise<LearningLesson[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listLearningLessons(tenantId, companyIds);
  let rows = (db().learningLessons ?? []).filter((l) => l.tenantId === tenantId);
  if (companyIds?.length) {
    const allowed = new Set(companyIds);
    rows = rows.filter((l) => allowed.has(l.companyId));
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createLearningLesson(
  input: Omit<LearningLesson, "id" | "createdAt">,
): Promise<LearningLesson> {
  if (isSupabaseConfigured()) return supabaseRepo.createLearningLesson(input);
  const row: LearningLesson = { ...input, id: id("lles"), createdAt: now() };
  (db().learningLessons ??= []).push(row);
  return row;
}

// ---- AI campaign management layer (0035) ---------------------------------------

export async function listApprovalPolicies(
  tenantId: string,
  entityType?: string,
): Promise<ApprovalPolicy[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listApprovalPolicies(tenantId, entityType);
  let rows = (db().approvalPolicies ?? []).filter((p) => p.tenantId === tenantId);
  if (entityType) rows = rows.filter((p) => p.entityType === entityType);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getApprovalPolicy(policyId: string): Promise<ApprovalPolicy | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getApprovalPolicy(policyId);
  return (db().approvalPolicies ?? []).find((p) => p.id === policyId);
}

export async function createApprovalPolicy(
  input: Omit<ApprovalPolicy, "id" | "createdAt" | "updatedAt">,
): Promise<ApprovalPolicy> {
  if (isSupabaseConfigured()) return supabaseRepo.createApprovalPolicy(input);
  const t = now();
  const row: ApprovalPolicy = {
    ...input,
    triggerRules: input.triggerRules ?? {},
    approvalLevel: input.approvalLevel ?? "single",
    active: input.active ?? true,
    id: id("ap"),
    createdAt: t,
    updatedAt: t,
  };
  (db().approvalPolicies ??= []).push(row);
  return row;
}

export async function updateApprovalPolicy(
  policyId: string,
  patch: Partial<ApprovalPolicy>,
): Promise<ApprovalPolicy | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateApprovalPolicy(policyId, patch);
  const row = await getApprovalPolicy(policyId);
  if (!row) return undefined;
  Object.assign(row, patch, { updatedAt: now() });
  return row;
}

export async function listAiPromptVersions(
  tenantId: string | null,
  promptKey?: string,
): Promise<AiPromptVersion[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listAiPromptVersions(tenantId, promptKey);
  let rows = (db().aiPromptVersions ?? []).filter(
    (p) => p.tenantId === tenantId || (tenantId != null && p.tenantId == null),
  );
  if (promptKey) rows = rows.filter((p) => p.promptKey === promptKey);
  return rows.sort((a, b) => b.version - a.version);
}

export async function getAiPromptVersion(versionId: string): Promise<AiPromptVersion | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getAiPromptVersion(versionId);
  return (db().aiPromptVersions ?? []).find((p) => p.id === versionId);
}

export async function createAiPromptVersion(
  input: Omit<AiPromptVersion, "id" | "createdAt" | "updatedAt">,
): Promise<AiPromptVersion> {
  if (isSupabaseConfigured()) return supabaseRepo.createAiPromptVersion(input);
  const t = now();
  const row: AiPromptVersion = {
    ...input,
    version: input.version ?? 1,
    modelProvider: input.modelProvider ?? "anthropic",
    active: input.active ?? false,
    id: id("apv"),
    createdAt: t,
    updatedAt: t,
  };
  (db().aiPromptVersions ??= []).push(row);
  return row;
}

export async function updateAiPromptVersion(
  versionId: string,
  patch: Partial<AiPromptVersion>,
): Promise<AiPromptVersion | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateAiPromptVersion(versionId, patch);
  const row = await getAiPromptVersion(versionId);
  if (!row) return undefined;
  Object.assign(row, patch, { updatedAt: now() });
  return row;
}

export async function listAiOrchestrationRuns(
  companyId: string,
): Promise<AiOrchestrationRun[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listAiOrchestrationRuns(companyId);
  return (db().aiOrchestrationRuns ?? [])
    .filter((r) => r.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAiOrchestrationRun(runId: string): Promise<AiOrchestrationRun | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getAiOrchestrationRun(runId);
  return (db().aiOrchestrationRuns ?? []).find((r) => r.id === runId);
}

export async function createAiOrchestrationRun(
  input: Omit<AiOrchestrationRun, "id" | "createdAt" | "updatedAt">,
): Promise<AiOrchestrationRun> {
  if (isSupabaseConfigured()) return supabaseRepo.createAiOrchestrationRun(input);
  const t = now();
  const row: AiOrchestrationRun = {
    ...input,
    structuredOutput: input.structuredOutput ?? {},
    approvalRequired: input.approvalRequired ?? true,
    status: input.status ?? "proposed",
    id: id("aor"),
    createdAt: t,
    updatedAt: t,
  };
  (db().aiOrchestrationRuns ??= []).push(row);
  return row;
}

export async function updateAiOrchestrationRun(
  runId: string,
  patch: Partial<AiOrchestrationRun>,
): Promise<AiOrchestrationRun | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateAiOrchestrationRun(runId, patch);
  const row = await getAiOrchestrationRun(runId);
  if (!row) return undefined;
  Object.assign(row, patch, { updatedAt: now() });
  return row;
}

export async function listAiCampaignRecommendations(
  companyId: string,
  campaignId?: string,
): Promise<AiCampaignRecommendation[]> {
  if (isSupabaseConfigured()) {
    return supabaseRepo.listAiCampaignRecommendations(companyId, campaignId);
  }
  let rows = (db().aiCampaignRecommendations ?? []).filter((r) => r.companyId === companyId);
  if (campaignId) rows = rows.filter((r) => r.campaignId === campaignId);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getAiCampaignRecommendation(
  recommendationId: string,
): Promise<AiCampaignRecommendation | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getAiCampaignRecommendation(recommendationId);
  return (db().aiCampaignRecommendations ?? []).find((r) => r.id === recommendationId);
}

export async function createAiCampaignRecommendation(
  input: Omit<AiCampaignRecommendation, "id" | "createdAt" | "updatedAt">,
): Promise<AiCampaignRecommendation> {
  if (isSupabaseConfigured()) return supabaseRepo.createAiCampaignRecommendation(input);
  const t = now();
  const row: AiCampaignRecommendation = {
    ...input,
    payload: input.payload ?? {},
    id: id("acr"),
    createdAt: t,
    updatedAt: t,
  };
  (db().aiCampaignRecommendations ??= []).push(row);
  return row;
}

export async function updateAiCampaignRecommendation(
  recommendationId: string,
  patch: Partial<AiCampaignRecommendation>,
): Promise<AiCampaignRecommendation | undefined> {
  if (isSupabaseConfigured()) {
    return supabaseRepo.updateAiCampaignRecommendation(recommendationId, patch);
  }
  const row = await getAiCampaignRecommendation(recommendationId);
  if (!row) return undefined;
  Object.assign(row, patch, { updatedAt: now() });
  return row;
}

export async function listCampaignPerformanceSnapshots(
  campaignId: string,
): Promise<CampaignPerformanceSnapshot[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCampaignPerformanceSnapshots(campaignId);
  return (db().campaignPerformanceSnapshots ?? [])
    .filter((s) => s.campaignId === campaignId)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart));
}

export async function getCampaignPerformanceSnapshot(
  snapshotId: string,
): Promise<CampaignPerformanceSnapshot | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCampaignPerformanceSnapshot(snapshotId);
  return (db().campaignPerformanceSnapshots ?? []).find((s) => s.id === snapshotId);
}

export async function createCampaignPerformanceSnapshot(
  input: Omit<CampaignPerformanceSnapshot, "id" | "createdAt" | "collectedAt"> & {
    collectedAt?: string;
  },
): Promise<CampaignPerformanceSnapshot> {
  if (isSupabaseConfigured()) return supabaseRepo.createCampaignPerformanceSnapshot(input);
  const t = now();
  const row: CampaignPerformanceSnapshot = {
    ...input,
    metrics: input.metrics ?? {},
    dataSource: input.dataSource ?? "simulated",
    collectedAt: input.collectedAt ?? t,
    id: id("cps"),
    createdAt: t,
  };
  (db().campaignPerformanceSnapshots ??= []).push(row);
  return row;
}

export async function updateCampaignPerformanceSnapshot(
  snapshotId: string,
  patch: Partial<CampaignPerformanceSnapshot>,
): Promise<CampaignPerformanceSnapshot | undefined> {
  if (isSupabaseConfigured()) {
    return supabaseRepo.updateCampaignPerformanceSnapshot(snapshotId, patch);
  }
  const row = await getCampaignPerformanceSnapshot(snapshotId);
  if (!row) return undefined;
  Object.assign(row, patch);
  return row;
}

// ---- Privacy DSR (0037) -------------------------------------------------------

export async function listPrivacyRequests(
  tenantId: string,
  companyId?: string,
): Promise<PrivacyRequest[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listPrivacyRequests(tenantId, companyId);
  let rows = (db().privacyRequests ?? []).filter((r) => r.tenantId === tenantId);
  if (companyId) rows = rows.filter((r) => r.companyId === companyId);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listPrivacyRequestsForCompany(
  companyId: string,
): Promise<PrivacyRequest[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listPrivacyRequestsForCompany(companyId);
  return (db().privacyRequests ?? [])
    .filter((r) => r.companyId === companyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getPrivacyRequest(
  requestId: string,
): Promise<PrivacyRequest | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getPrivacyRequest(requestId);
  return (db().privacyRequests ?? []).find((r) => r.id === requestId);
}

export async function createPrivacyRequest(
  input: Omit<PrivacyRequest, "id" | "createdAt">,
): Promise<PrivacyRequest> {
  if (isSupabaseConfigured()) return supabaseRepo.createPrivacyRequest(input);
  const row: PrivacyRequest = {
    ...input,
    id: id("pdsr"),
    createdAt: now(),
  };
  (db().privacyRequests ??= []).push(row);
  return row;
}

export async function updatePrivacyRequest(
  requestId: string,
  patch: Partial<
    Pick<
      PrivacyRequest,
      | "status"
      | "lawfulBasis"
      | "jurisdiction"
      | "dueAt"
      | "completedAt"
      | "notes"
    >
  >,
): Promise<PrivacyRequest | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updatePrivacyRequest(requestId, patch);
  const row = await getPrivacyRequest(requestId);
  if (!row) return undefined;
  Object.assign(row, patch);
  return row;
}

export type { PrivacyRequest, PrivacyRequestStatus, PrivacyRequestType };

// ---- Managed delivery runs (0038) ---------------------------------------------

const OPEN_MANAGED_PHASES = new Set([
  "queued",
  "validating",
  "analysing",
  "strategy",
  "calendar",
  "content",
]);

export async function listManagedDeliveryRuns(
  tenantId: string,
  companyId?: string,
): Promise<ManagedDeliveryRun[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listManagedDeliveryRuns(tenantId, companyId);
  let rows = (db().managedDeliveryRuns ?? []).filter((r) => r.tenantId === tenantId);
  if (companyId) rows = rows.filter((r) => r.companyId === companyId);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listOpenManagedDeliveryRuns(
  tenantId: string,
): Promise<ManagedDeliveryRun[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listOpenManagedDeliveryRuns(tenantId);
  return (db().managedDeliveryRuns ?? [])
    .filter((r) => r.tenantId === tenantId && OPEN_MANAGED_PHASES.has(r.phase))
    .sort((a, b) => a.strategyDueAt.localeCompare(b.strategyDueAt));
}

export async function getManagedDeliveryRun(
  runId: string,
): Promise<ManagedDeliveryRun | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getManagedDeliveryRun(runId);
  return (db().managedDeliveryRuns ?? []).find((r) => r.id === runId);
}

export async function createManagedDeliveryRun(
  input: Omit<ManagedDeliveryRun, "id" | "createdAt" | "updatedAt">,
): Promise<ManagedDeliveryRun> {
  if (isSupabaseConfigured()) return supabaseRepo.createManagedDeliveryRun(input);
  const t = now();
  const row: ManagedDeliveryRun = {
    ...input,
    id: id("mdr"),
    createdAt: t,
    updatedAt: t,
  };
  (db().managedDeliveryRuns ??= []).push(row);
  return row;
}

export async function updateManagedDeliveryRun(
  runId: string,
  patch: Partial<ManagedDeliveryRun>,
): Promise<ManagedDeliveryRun | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateManagedDeliveryRun(runId, patch);
  const row = await getManagedDeliveryRun(runId);
  if (!row) return undefined;
  Object.assign(row, patch, { updatedAt: now() });
  return row;
}

export type { ManagedDeliveryRun };

// ---- Prepaid company credit wallet (0039) ------------------------------------

export async function getCompanyCreditWallet(
  companyId: string,
): Promise<CompanyCreditWallet | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCompanyCreditWallet(companyId);
  return (db().companyCreditWallets ?? []).find((w) => w.companyId === companyId);
}

export async function createCompanyCreditWallet(
  input: Omit<CompanyCreditWallet, "id" | "createdAt" | "updatedAt">,
): Promise<CompanyCreditWallet> {
  if (isSupabaseConfigured()) return supabaseRepo.createCompanyCreditWallet(input);
  const existing = (db().companyCreditWallets ?? []).find(
    (w) => w.companyId === input.companyId,
  );
  if (existing) return existing;
  const t = now();
  const row: CompanyCreditWallet = {
    ...input,
    id: id("cw"),
    createdAt: t,
    updatedAt: t,
  };
  (db().companyCreditWallets ??= []).push(row);
  return row;
}

export async function updateCompanyCreditWallet(
  walletId: string,
  patch: Partial<
    Pick<
      CompanyCreditWallet,
      | "balanceUsd"
      | "minFloorUsd"
      | "autoTopUpEnabled"
      | "topUpTriggerBalanceUsd"
      | "topUpAmountUsd"
      | "maxTopUpAmountUsd"
      | "maxTopUpPerDay"
    >
  >,
): Promise<CompanyCreditWallet | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateCompanyCreditWallet(walletId, patch);
  const row = (db().companyCreditWallets ?? []).find((w) => w.id === walletId);
  if (!row) return undefined;
  Object.assign(row, patch, { updatedAt: now() });
  return row;
}

export async function createCompanyCreditLedgerEntry(
  input: Omit<CompanyCreditLedgerEntry, "id" | "createdAt">,
): Promise<CompanyCreditLedgerEntry> {
  if (isSupabaseConfigured()) return supabaseRepo.createCompanyCreditLedgerEntry(input);
  const row: CompanyCreditLedgerEntry = {
    ...input,
    id: id("cle"),
    createdAt: now(),
  };
  (db().companyCreditLedger ??= []).push(row);
  return row;
}

export async function listCompanyCreditLedger(
  companyId: string,
  opts?: { kind?: CreditLedgerKind; since?: string },
): Promise<CompanyCreditLedgerEntry[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCompanyCreditLedger(companyId, opts);
  let rows = (db().companyCreditLedger ?? []).filter((e) => e.companyId === companyId);
  if (opts?.kind) rows = rows.filter((e) => e.kind === opts.kind);
  if (opts?.since) rows = rows.filter((e) => e.createdAt >= opts.since!);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type { CompanyCreditWallet, CompanyCreditLedgerEntry, CreditLedgerKind };

// ---- Campaign A/B experiments (0036_campaign_experiments) --------------------

export async function listCampaignExperiments(
  tenantId: string,
  opts?: { companyId?: string; campaignId?: string },
): Promise<CampaignExperiment[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listCampaignExperiments(tenantId, opts);
  const ids = tenantCompanyIdSet(tenantId);
  return (db().campaignExperiments ?? [])
    .filter((e) => {
      if (!ids.has(e.companyId)) return false;
      if (opts?.companyId && e.companyId !== opts.companyId) return false;
      if (opts?.campaignId && e.campaignId !== opts.campaignId) return false;
      return true;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCampaignExperiment(
  experimentId: string,
): Promise<CampaignExperiment | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.getCampaignExperiment(experimentId);
  return (db().campaignExperiments ?? []).find((e) => e.id === experimentId);
}

export async function createCampaignExperiment(
  input: Omit<CampaignExperiment, "id" | "createdAt" | "updatedAt">,
): Promise<CampaignExperiment> {
  if (isSupabaseConfigured()) return supabaseRepo.createCampaignExperiment(input);
  const t = now();
  const row: CampaignExperiment = { ...input, id: id("cex"), createdAt: t, updatedAt: t };
  (db().campaignExperiments ??= []).push(row);
  return row;
}

export async function updateCampaignExperiment(
  experimentId: string,
  patch: Partial<CampaignExperiment>,
): Promise<CampaignExperiment | undefined> {
  if (isSupabaseConfigured()) return supabaseRepo.updateCampaignExperiment(experimentId, patch);
  const row = await getCampaignExperiment(experimentId);
  if (!row) return undefined;
  Object.assign(row, patch, { updatedAt: now() });
  return row;
}

