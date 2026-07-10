// Domain model for the Marketing Command Centre — Phase 1 (MVP).
// Kept framework-agnostic so it can back either the in-memory store (dev/demo)
// or the Supabase adapter (production) without change.

// ---- Tenancy (SaaS T1) -------------------------------------------------------
//
// A tenant is one customer of the SaaS: a marketing AGENCY with client
// companies, or a BUSINESS GROUP owning several businesses. Identity is
// GLOBAL (a user is one person across the platform — mirrors Supabase
// auth.users); membership is PER-TENANT (TenantMember carries the user's role
// inside that tenant). Every company belongs to exactly one tenant; most other
// records derive their tenancy through their company.

export type TenantKind = "business_group" | "agency";

// Plan gates the number of client companies a tenant may manage (owner
// decision: pricing is per-client-company). Enforced in T4 billing.
export type PlanId = "starter" | "agency" | "scale";

// Per-client-company ADD-ONS (Module 3, payment-tier matrix). The tenant's base
// PLAN (above) gates company count + AI allowance + automation + white-label;
// add-ons unlock per-company deliverables billed ON TOP of the base plan and
// enabled per client company (a restaurant client gets `menus` + `order_button`;
// a video-forward client gets `video`). The catalogue lives in src/lib/addons.ts
// (pure data, Stripe-price-backed); entitlement checks live in
// src/lib/entitlements.ts and gate the deliverable modules (visuals / menus /
// Order-Now) at their entry points.
export type AddonId = "video" | "photo" | "menus" | "order_button";

// A per-company add-on entitlement. At most ONE row per (companyId, addonId):
// enabling upserts status "active"; disabling flips it to "cancelled" (kept for
// history/audit, not deleted). companyHasAddon() = a row with status "active".
export interface CompanyEntitlement {
  id: string;
  companyId: string;
  addonId: AddonId;
  status: "active" | "cancelled";
  enabledAt: string;
  cancelledAt?: string;
  enabledById: string; // person ref (schema column enabled_by)
  // Stripe linkage — set only when Stripe is configured (the add-on rides its
  // own subscription); absent in demo mode, where the toggle applies directly.
  stripeSubscriptionId?: string;
  updatedAt: string;
}

// Client-onboarding details captured for a paying customer (a tenant). Contact
// + business identity; the card + billing address are collected by Stripe
// Checkout, never stored here.
export interface TenantOnboarding {
  companyName?: string; // legal / trading name of the client business
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  notes?: string;
}

export interface Tenant {
  id: string;
  name: string;
  kind: TenantKind;
  plan: PlanId;
  status: "active" | "suspended";
  // T4 billing: set by the Stripe webhook once the tenant subscribes. Absent
  // in demo mode (no Stripe keys) — plan changes then apply directly.
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  // Client onboarding (details + tier + card + T&C). onboardingCompletedAt is
  // stamped when the wizard finishes; until then the app gate routes the owner
  // to /onboarding. `onboarding` holds the captured contact/business details.
  onboarding?: TenantOnboarding;
  onboardingCompletedAt?: string;
  // T6 white-label: per-tenant branding (metadata only — no byte storage; a
  // logo is an external URL). Gated by the plan's whiteLabel flag. Applied to
  // the app shell, client-facing approval pages and outbound emails.
  branding?: TenantBranding;
  // Schedule due-ness: IANA timezone for calendar intent (e.g. Australia/Sydney).
  // When unset, publish-queue falls back to CC_TZ_OFFSET_MINUTES then UTC.
  timezone?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantBranding {
  accentColor?: string; // hex, overrides the --primary theme var
  logoUrl?: string; // external image URL (metadata only)
  emailFromName?: string; // sender display name on outbound emails
  approvalMessage?: string; // note shown to clients on the approval page
}

// ---- Terms & Conditions (versioned) ------------------------------------------
//
// Platform-level (not tenant-scoped): one set of terms governs every customer.
// Publishing a new version supersedes the prior (marks it inactive) and bumps
// the monotonic version number; the CURRENT terms = the active version with the
// highest number. Every user must accept the current version before using the
// app (the /accept-terms gate), so a new version forces re-acceptance from all.
export interface TermsVersion {
  id: string;
  version: number; // monotonic; current = highest active
  title: string;
  body: string; // full terms text
  summary?: string; // "what changed" — shown to users + used in the update email
  effectiveDate: string; // ISO date
  active: boolean; // superseded versions keep active=false for history/audit
  publishedById: string;
  publishedAt: string;
  // Set when the "terms updated" broadcast email was sent for this version
  // (best-effort on publish; re-sendable). notifiedCount = recipients emailed.
  notifiedAt?: string;
  notifiedCount?: number;
}

// A record that a specific user accepted a specific terms version. Platform
// terms bind the user (global identity); tenantId is the acceptance context for
// audit + tenant-scoped export/purge.
export interface TermsAcceptance {
  id: string;
  userId: string;
  tenantId: string;
  version: number;
  acceptedAt: string;
  ip?: string;
}

// Role within a tenant. owner ≙ the old super_admin tier (senior/compliance
// approvals), admin ≙ tenant-wide admin, member ≙ company-scoped user.
export type TenantRole = "owner" | "admin" | "member";

export interface TenantMember {
  tenantId: string;
  userId: string;
  role: TenantRole;
  roleTitle?: RoleTitle; // granular §9 title within this tenant
  portalOnly?: boolean; // explicit client-portal flag (migration 0028; field sales)
  createdAt: string;
}

// Tenant role → legacy enforcement tier. The session resolver stamps the
// acting user's `role` from their membership so every existing tier check
// (isAdmin, role === "super_admin") keeps working — scoped to the tenant.
export const TENANT_ROLE_TIER: Record<TenantRole, Role> = {
  owner: "super_admin",
  admin: "admin",
  member: "user",
};

// A session-resolved user always carries their active tenant context.
export type ActingUser = User & { tenantId: string; tenantRole: TenantRole };

// ---- Roles & access ---------------------------------------------------------

// `role` is the ENFORCEMENT tier (kept stable across phases). Phase 10 adds a
// granular `roleTitle` (master prompt §9) for governance/display; each granular
// title maps to one of the three tiers via ROLE_TITLE_TIER below.
// Since T1 the tier is SESSION-RESOLVED from the user's TenantMember row and
// means "within the active tenant"; `super_admin` ≙ tenant owner. The platform
// operator is the separate `platformAdmin` flag (curates the platform template
// library; never implicitly sees tenant data).
export type Role = "super_admin" | "admin" | "user";

// Full 10-role structure (§9).
export type RoleTitle =
  | "super_admin"
  | "group_admin"
  | "company_admin"
  | "local_business_manager"
  | "content_operator"
  | "approver"
  | "compliance_reviewer"
  | "publisher"
  | "analyst"
  | "viewer";

// Which enforcement tier each granular title corresponds to.
export const ROLE_TITLE_TIER: Record<RoleTitle, Role> = {
  super_admin: "super_admin",
  group_admin: "admin",
  company_admin: "admin",
  approver: "admin",
  compliance_reviewer: "admin",
  publisher: "admin",
  local_business_manager: "user",
  content_operator: "user",
  analyst: "user",
  viewer: "user",
};

export interface User {
  id: string;
  email: string; // global identity — unique across the platform (≙ auth.users)
  name: string;
  // Enforcement tier WITHIN the active tenant. Stored value is a fallback;
  // the session resolver overwrites it from the TenantMember row.
  role: Role;
  active: boolean;
  // Platform operator (curates the platform library, ops surfaces). Never
  // implies access to tenant data.
  platformAdmin?: boolean;
  // Session-resolved tenancy context (set by getCurrentUser; absent on the
  // raw store record). roleTitle is the granular §9 title resolved from the
  // active TenantMember row — it is not stored on the user itself.
  tenantId?: string;
  tenantRole?: TenantRole;
  roleTitle?: RoleTitle;
  createdAt: string;
}

// A user is scoped to the companies (optionally locations) they're assigned to.
// Access rows only ever point at companies inside the user's tenant.
export interface CompanyAccess {
  userId: string;
  companyId: string;
  locationId?: string | null;
}

export interface Session {
  token: string;
  userId: string;
  tenantId?: string; // active tenant for this session (multi-tenant users switch)
  createdAt: string;
  revoked: boolean;
}

// ---- Companies & onboarding -------------------------------------------------

export type CompanyStatus =
  | "draft_onboarding"
  | "pending_review"
  | "approved"
  | "ai_ready"
  | "needs_update"
  | "archived";

// The minimum onboarding fields (master prompt §13) plus common extras.
// A company must reach "ai_ready" before AI drafting is allowed.
// A social profile URL captured at onboarding — for reference/display only.
// NEVER a login or password: publishing access is granted separately via OAuth
// (Publishing Centre), which stores an encrypted, revocable token, not creds.
export interface SocialLink {
  platform: string; // facebook | instagram | linkedin | x | tiktok | youtube | google_business
  url: string;
}

// The social platforms we capture a profile URL for at onboarding.
export const SOCIAL_PLATFORMS: { key: string; label: string; placeholder: string }[] = [
  { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/…" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/company/…" },
  { key: "x", label: "X / Twitter", placeholder: "https://x.com/…" },
  { key: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@…" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@…" },
  { key: "google_business", label: "Google Business", placeholder: "https://g.page/…" },
];

// V1 module 2 — business-type selector + vertical profile slices (jsonb).
export type BusinessType =
  | "restaurant_cafe"
  | "retail"
  | "hotel"
  | "professional"
  | "other";

export interface RetailProfileFields {
  productCategories: string[];
  heroProducts: string[];
  promotions: string[];
  seasons: string[];
  pricePositioning?: string;
}

export interface HotelProfileFields {
  roomTypes: string[];
  packages: string[];
  amenities: string[];
  occupancyLanguage?: string;
  directBookingBenefits?: string;
}

export interface RestaurantProfileFields {
  cuisineStyle?: string;
  serviceModes: string[];
  dietaryOptions: string[];
  peakServicePeriods: string[];
}

export interface CompanyProfile {
  legalName?: string;
  tradingNames?: string;
  industry?: string;
  businessType?: BusinessType;
  website?: string;
  socialLinks?: SocialLink[]; // profile URLs (reference only — see SocialLink)
  approvalContact?: string;
  // Minimum onboarding set:
  serviceAreas: string[]; // locations / service area
  natureOfBusiness?: string;
  services: string[];
  targetCustomers?: string;
  brandVoice?: string;
  callsToAction: string[];
  prohibitedClaims: string[];
  // Optional richer context:
  approvedClaims: string[];
  requiredDisclaimers: string[];
  currentOffers?: string;
  localMarketNotes?: string;
  // Vertical slices (V1 module 2 — stored in profile jsonb):
  retail?: RetailProfileFields;
  hotel?: HotelProfileFields;
  restaurant?: RestaurantProfileFields;
  /** V1 module 11 — AI-MOS opportunities (jsonb slice, no migration). */
  aiMos?: { opportunities?: AiMosOpportunity[] };
  /** W1 M22 — calendar assist suggestions (jsonb slice, no migration). */
  calendarAssist?: { suggestions?: CalendarAssistSuggestion[] };
  /** V1 module 13 — auto-onboarding scrape audit trail (jsonb slice, no migration). */
  autoOnboarding?: {
    lastScrapeAt?: string;
    lastScrapeMode?: "live" | "simulated";
    lastAppliedAt?: string;
    lastAppliedBy?: string;
    consentRecordedAt?: string;
    consentRecordedBy?: string;
    lastUrls?: string[];
  };
  /** W1 M20 — client portal scheduled ROI reports (jsonb slice, no migration). */
  clientReports?: {
    scheduledEmail?: boolean;
    lastSentAt?: string;
    frequencyDays?: number;
  };
}

export interface UploadedAsset {
  id: string;
  name: string;
  contentType: string;
  size: number;
  // Uploads are never auto-approved marketing assets (master prompt §20).
  approvalStatus: "pending" | "approved" | "rejected";
  consentObtained: boolean;
  showsCustomer: boolean;
  uploadedBy: string;
  uploadedAt: string;
}

export interface Company {
  id: string;
  tenantId: string; // the structural tenancy link — every company has ONE tenant
  name: string;
  status: CompanyStatus;
  profile: CompanyProfile;
  documents: UploadedAsset[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Marketing support requests (tickets) ----------------------------------

export type RequestType =
  | "social_post"
  | "campaign"
  | "blog_article"
  | "email_newsletter"
  | "ad_copy"
  | "landing_page"
  | "creative_request"
  // Phase 5 — Content Studio expansion:
  | "website_copy"
  | "faq"
  | "video_script"
  | "brochure_copy"
  | "proposal"
  | "seo_meta";

export type Urgency = "low" | "normal" | "high" | "urgent";

export type RequestStatus =
  | "submitted"
  | "needs_more_information"
  | "ai_drafting"
  | "draft_ready"
  | "pending_approval"
  | "changes_required"
  | "approved"
  | "scheduled"
  | "published"
  | "cancelled"
  | "completed";

export interface RequestConsent {
  customerNamed: boolean;
  customerInPhotos: boolean;
  consentObtained: boolean;
  mentionsPricing: boolean;
  mentionsOffer: boolean;
  performanceClaims: boolean;
}

export interface StatusEvent {
  status: RequestStatus;
  at: string;
  byId: string;
  note?: string;
}

export interface MarketingRequest {
  id: string;
  companyId: string;
  locationId?: string | null;
  requesterId: string;
  requestType: RequestType;
  objective: string;
  targetAudience?: string;
  platform?: string;
  topic: string;
  offer?: string;
  callToAction?: string;
  preferredDate?: string;
  preferredTime?: string;
  urgency: Urgency;
  notes?: string;
  consent: RequestConsent;
  uploads: UploadedAsset[];
  status: RequestStatus;
  assignedReviewerId?: string | null;
  statusHistory: StatusEvent[];
  createdAt: string;
  updatedAt: string;
}

// ---- Content items ----------------------------------------------------------

export type ContentStatus =
  | "ai_draft"
  | "user_edited"
  | "pending_approval"
  | "changes_required"
  | "approved"
  | "scheduled"
  | "published"
  | "rejected"
  | "archived"
  | "analysed";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ComplianceIssue {
  severity: RiskLevel;
  message: string;
  suggestion?: string;
}

export interface ComplianceResult {
  riskLevel: RiskLevel;
  issues: ComplianceIssue[];
  canProceed: boolean;
  requiresEvidence: boolean;
  checkedAt: string;
}

export interface ContentVersion {
  body: string;
  editedById: string;
  editedAt: string;
  note?: string;
}

// Where a piece of content must be routed for approval (master prompt §26).
export type ApprovalRoute = "admin" | "company_admin" | "senior" | "compliance";

// Grounding label for AI output (master prompt §21).
export type GroundingLabel =
  | "grounded"
  | "suggested_by_ai"
  | "requires_evidence"
  | "unsupported";

// A snippet of approved source material the draft was grounded in.
export interface SourceRef {
  sourceId: string;
  title: string;
  snippet: string;
}

// One claim found in the content, cross-checked against the Claims Library
// and Evidence Locker (master prompt §29).
export interface ClaimAuditEntry {
  claim: string;
  status: "approved" | "evidence_on_file" | "unsupported";
  evidenceTitle?: string;
}

export interface ContentItem {
  id: string;
  companyId: string;
  requestId?: string | null;
  type: RequestType;
  title: string;
  body: string;
  status: ContentStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  versions: ContentVersion[];
  compliance?: ComplianceResult;
  brandFitScore?: number; // 0-100
  approvedById?: string | null;
  approvedAt?: string | null;
  // Provenance (master prompt §24):
  aiModel?: string;
  aiPrompt?: string;
  sourcesUsed?: string[];
  // Phase 2/3 governance:
  sourceRefs?: SourceRef[];
  groundingLabel?: GroundingLabel;
  claimAudit?: ClaimAuditEntry[];
  routedTo?: ApprovalRoute;
  // Phase 4: set when the content was drafted for a campaign item.
  campaignId?: string | null;
  campaignItemId?: string | null;
  // Phase 5 — Content Studio:
  variantGroupId?: string | null; // drafts generated together for comparison
  variantLabel?: string; // e.g. "Friendly", "Professional", "Short"
  repurposedFromId?: string | null; // source content when repurposed
  duplicateWarning?: string; // similarity warning vs existing content
  // Module 3 — AI assistant hardening:
  aiRunId?: string | null; // link to ai_runs row for this generation
  estCostUsd?: number; // estimated cost of the generation run
  aiCritique?: AiCritique; // last pre-publish critique (set at schedule time)
  // Phase 5 — Content Reuse Library (§45):
  reusePermitted?: boolean;
  reuseChannels?: string[]; // empty = all channels
  reviewDate?: string; // ISO date — review before reusing after this
  expiryDate?: string; // ISO date — must not be reused after this
  // Phase 11 — Creative Assets: approved assets this piece references. Content
  // is blocked from a channel when a referenced asset's usage rights or expiry
  // don't permit that channel (enforced at schedule + publish time).
  assetIds?: string[];
  // T6 — tokenised no-login client approval. Set when an admin shares this
  // item for external client sign-off; the client acts via /approve/<token>.
  clientReview?: ClientReview;
}

// T6 client approval record — the "exceed parity" evidence trail: who was
// asked, when, and how they responded, all captured on the content item and
// mirrored into the append-only audit log.
export interface ClientReview {
  email: string;
  sharedById: string;
  sharedAt: string;
  expiresAt: string;
  link: string; // the /approve/<token> URL, for the admin to copy/re-send
  status: "pending" | "approved" | "changes_requested";
  respondedAt?: string;
  note?: string; // client's comment on a changes request
}

// Phase 5: tone options for AI draft comparison (§24).
export type DraftTone =
  | "brand_default"
  | "friendly"
  | "professional"
  | "urgent"
  | "short_punchy";

// Phase 5: reusable prompt template for the Content Studio.
// Scoping mirrors ApprovedResponse: tenantId null = platform library.
export interface PromptTemplate {
  id: string;
  tenantId: string | null; // null = platform library
  companyId: string | null; // null = tenant-wide
  name: string;
  contentType: RequestType;
  topic: string;
  objective: string;
  audience?: string;
  channel?: string;
  tone?: DraftTone;
  active: boolean;
  createdById: string;
  createdAt: string;
}

// ---- AI-assisted social responses (manual, Phase 1) ------------------------

export type Sentiment =
  | "positive"
  | "neutral"
  | "negative"
  | "angry"
  | "urgent"
  | "sensitive"
  | "spam";

export type Intent =
  | "compliment"
  | "general_enquiry"
  | "booking_enquiry"
  | "pricing_enquiry"
  | "complaint"
  | "refund_request"
  | "service_issue"
  | "safety_concern"
  | "legal_threat"
  | "media_enquiry"
  | "employment_enquiry"
  | "spam"
  | "unknown";

export type SocialResponseStatus =
  | "ai_drafted"
  | "pending_approval"
  | "changes_required"
  | "approved"
  | "published"
  | "escalated"
  | "no_response_required"
  | "closed";

export interface SocialResponseDraft {
  id: string;
  companyId: string;
  platform: string;
  originalComment: string;
  sentiment: Sentiment;
  intent: Intent;
  riskLevel: RiskLevel;
  escalationRequired: boolean;
  draftResponse: string;
  status: SocialResponseStatus;
  createdById: string;
  createdAt: string;
  approvedById?: string | null;
  // Which Approved Response Library entry the draft was based on, if any (P3).
  libraryRef?: string;
}

// Collaborative comment on a content draft (gap-closer). Internal team members
// AND external clients (via the no-login approval link) can leave notes; the
// thread is scoped to the content item (→ company → tenant).
export interface ContentComment {
  id: string;
  contentId: string;
  companyId: string; // denormalised for tenant scoping
  authorId: string; // user id, or "client:<email>" for external clients
  authorName: string;
  authorKind: "member" | "client";
  body: string;
  createdAt: string;
}

// Unified social inbox (gap-closer): an ingested mention/comment/DM awaiting a
// reply. Derives its tenant through its company. Feeds the SAME governed
// social-reply pipeline — an operator drafts a reply which then goes through
// classify → compliance → approval → publish.
export interface SocialMention {
  id: string;
  companyId: string;
  platform: string;
  externalId?: string; // platform message id, for dedup on re-ingest
  authorName: string;
  text: string;
  receivedAt: string;
  status: "new" | "drafted" | "dismissed";
  linkedDraftId?: string; // the SocialResponseDraft created from it
  createdAt: string;
}

// ---- W3 M33: Review management (Module 7 / Phase 6) -------------------------

export type ReviewPlatform = "google" | "facebook" | "yelp" | "tripadvisor";
export type ReviewSentiment = "positive" | "neutral" | "negative";
export type ReviewUrgency = "low" | "medium" | "high" | "critical";
export type ReviewStatus = "new" | "drafted" | "responded" | "archived";

export interface CompanyReview {
  id: string;
  companyId: string;
  platform: ReviewPlatform;
  externalId?: string;
  authorName: string;
  rating: number;
  body: string;
  reviewedAt: string;
  sentiment: ReviewSentiment;
  topics: string[];
  urgency: ReviewUrgency;
  escalationRequired: boolean;
  status: ReviewStatus;
  draftResponse?: string;
  publishedResponse?: string;
  importedAt: string;
  respondedAt?: string | null;
  createdById?: string;
}

export type ReviewRequestChannel = "email" | "sms" | "qr" | "receipt" | "post_stay";
export type ReviewRequestCampaignStatus = "draft" | "active" | "paused" | "completed";

export interface ReviewRequestCampaign {
  id: string;
  companyId: string;
  name: string;
  channel: ReviewRequestChannel;
  status: ReviewRequestCampaignStatus;
  messageTemplate: string;
  targetSegment?: string;
  sentCount: number;
  clickCount: number;
  reviewCount: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  activatedAt?: string | null;
}

// ---- Audit log --------------------------------------------------------------

export interface AuditLog {
  id: string;
  tenantId?: string; // the tenant the action happened in (absent = platform-level)
  action: string;
  actorId: string;
  actorEmail: string;
  targetType?: string;
  targetId?: string;
  companyId?: string;
  detail?: string;
  createdAt: string;
}

// ---- Phase 2: Brand Brain -----------------------------------------------------

export type KnowledgeSourceType =
  | "website_copy"
  | "brochure"
  | "faq"
  | "past_post"
  | "case_study"
  | "testimonial"
  | "service_list"
  | "menu"
  | "price_list"
  | "brand_guide"
  | "other";

export type KnowledgeDocStatus = "draft" | "approved" | "archived" | "outdated" | "prohibited";

// A piece of approved company knowledge the AI grounds its drafts in.
// Content is plain text (pasted or extracted); edits bump the version and
// keep the previous body so material can be rolled back or audited.
export interface KnowledgeDocument {
  id: string;
  companyId: string;
  title: string;
  content: string;
  sourceType: KnowledgeSourceType;
  status: KnowledgeDocStatus;
  version: number;
  previousVersions: {
    title: string;
    content: string;
    version: number;
    replacedAt: string;
    byId: string;
  }[];
  addedById: string;
  createdAt: string;
  updatedAt: string;
}

// Structured service catalogue record (master prompt §23).
export interface ServiceRecord {
  id: string;
  companyId: string;
  name: string;
  description: string;
  targetCustomer?: string;
  priceRange?: string;
  priceApproved: boolean; // price may only be used in content when true
  marginPriority: "high" | "medium" | "low";
  seasonality?: string;
  locations: string[];
  requiredDisclaimer?: string;
  restrictions?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Local Area Intelligence Profile (master prompt §22).
export interface LocalAreaProfile {
  companyId: string;
  suburbs: string[];
  demographics?: string;
  commonNeeds?: string;
  competitors: string[];
  localEvents?: string;
  seasonalPatterns?: string;
  searchTerms: string[];
  buyingTriggers?: string;
  updatedAt: string;
}

// Knowledge gap raised when the AI lacks information to draft safely
// (master prompt §51 — "Ask the Local Manager" workflow).
export interface KnowledgeGap {
  id: string;
  companyId: string;
  requestId?: string | null;
  question: string;
  context?: string;
  blocking: boolean; // blocking gaps stop AI drafting until answered
  status: "open" | "answered" | "dismissed";
  answer?: string;
  answeredById?: string;
  answeredAt?: string;
  createdAt: string;
}

// ---- Phase 3: Approval & Compliance Engine -------------------------------------

// Consent Register entry (master prompt §28).
export interface ConsentRecord {
  id: string;
  companyId: string;
  personShown: string;
  consentObtained: boolean;
  documentName?: string;
  permittedChannels: string[];
  expiryDate?: string; // ISO date; expired consent blocks use
  restrictions?: string;
  approvedById?: string;
  withdrawn: boolean;
  createdAt: string;
}

export type EvidenceType =
  | "licence"
  | "certification"
  | "award"
  | "pricing"
  | "guarantee_terms"
  | "customer_outcome"
  | "comparison"
  | "safety"
  | "other";

// Evidence Locker entry — proof backing a claim (master prompt §29).
export interface EvidenceRecord {
  id: string;
  companyId: string;
  title: string;
  evidenceType: EvidenceType;
  detail: string;
  documentName?: string;
  validUntil?: string;
  createdById: string;
  createdAt: string;
}

// Claims Library entry — approved claim wording linked to evidence.
export interface ApprovedClaim {
  id: string;
  companyId: string;
  claimText: string;
  evidenceId?: string | null;
  allowedChannels: string[]; // empty = all channels
  active: boolean;
  createdAt: string;
}

export type ResponseCategory =
  | "compliment_thanks"
  | "complaint_acknowledgement"
  | "review_response"
  | "booking_reply"
  | "pricing_reply"
  | "apology"
  | "escalation"
  | "moderation";

// Approved Response Library entry (master prompt §39).
// Scoping (owner decision, T1): companyId set = company-specific;
// companyId null + tenantId set = tenant-wide; tenantId null = PLATFORM
// library (curated by the platform admin, read-only to tenants).
export interface ApprovedResponse {
  id: string;
  tenantId: string | null; // null = platform library
  companyId: string | null; // null = tenant-wide (or platform when tenantId null)
  category: ResponseCategory;
  title: string;
  responseText: string; // may contain {company} placeholder
  active: boolean;
  createdAt: string;
}

// AI Risk Control Centre — one record per AI invocation (master prompt §52).
// tenantId is the per-tenant AI metering key (T4 billing meters off this).
export interface AiRun {
  id: string;
  tenantId: string;
  companyId?: string;
  userId: string;
  kind:
    | "content_draft"
    | "campaign_ideas"
    | "campaign_plan"
    | "social_response"
    | "review_response"
    | "management_summary"
    | "image_brief"
    | "image_gen"
    | "video_gen"
    | "content_critique"
    | "ai_mos_scan"
    | "ai_mos_convert"
    | "ai_mos_dismiss"
    | "calendar_assist_scan"
    | "calendar_assist_accept"
    | "calendar_assist_dismiss";
  model: string;
  promptSummary: string;
  outputChars: number;
  sourcesUsed: string[];
  estCostUsd: number; // 0 for template fallback
  inputTokens?: number;
  outputTokens?: number;
  contextChars?: number;
  createdAt: string;
}

// Pre-publish AI critique (Module 3). Rule-based + optional LLM review before
// scheduling — stored on the content item and logged as an ai_run.
export interface AiCritiqueNote {
  severity: "info" | "warn" | "block";
  message: string;
  suggestion?: string;
}

export interface AiCritique {
  status: "pass" | "warn" | "block";
  notes: AiCritiqueNote[];
  model: string;
  critiquedAt: string;
  platform?: string;
}

// ---- Phase 4: Campaign Planner --------------------------------------------------

export type CampaignStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "cancelled"
  | "completed";

export interface Campaign {
  id: string;
  companyId: string;
  name: string;
  objective: string;
  audience?: string;
  serviceFocus?: string; // service name from the Service Catalogue
  channels: string[];
  durationDays: 30 | 90;
  startDate: string; // ISO date
  offerId?: string | null; // live offer from the Offer Manager
  eventName?: string; // local event campaigns (§48)
  eventDate?: string;
  keyMessage?: string;
  status: CampaignStatus;
  requestId?: string | null; // set when converted from a support request
  createdById: string;
  approvedById?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CampaignItemStatus =
  | "planned"
  | "drafted"
  | "approved"
  | "scheduled"
  | "published"
  | "skipped";

// One planned piece of content inside a campaign — tracked individually.
export interface CampaignItem {
  id: string;
  campaignId: string;
  companyId: string;
  dayOffset: number; // day within the plan (1-based)
  channel: string;
  contentType: RequestType;
  title: string;
  brief: string;
  contentId?: string | null; // linked ContentItem once drafted
  status: CampaignItemStatus;
  createdAt: string;
  updatedAt: string;
}

// ---- Phase 6: Social Calendar & Scheduling ---------------------------------------

// "publishing" = claimed by a queue worker, in-flight to the platform (scale
// pass: the atomic claim that stops two workers double-posting). "dead" =
// failed MAX_PUBLISH_ATTEMPTS times — parked in the dead-letter queue for a
// human to requeue or cancel; the scheduler never retries it again.
export type ScheduledPostStatus =
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "dead"
  | "cancelled";

// One scheduled publication of an approved content item on a platform (§34).
// Publishing itself (status published/failed) arrives with Phase 7.
export interface ScheduledPost {
  id: string;
  contentId: string;
  companyId: string;
  platform: string;
  scheduledDate: string; // ISO date
  scheduledTime?: string; // HH:mm
  status: ScheduledPostStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Phase 7: Automated Publishing -------------------------------------------------

export type IntegrationStatus = "connected" | "disconnected" | "token_expired";

// A publishing connection for one company + platform (§31). The token is
// encrypted at rest (AES-256-GCM); only its last four characters are ever
// shown, and only to admins. Users never see credentials (§6).
export interface PublishingIntegration {
  id: string;
  companyId: string;
  platform: string; // Facebook, Instagram, LinkedIn, Google Business Profile, Email
  accountName: string;
  encryptedToken: string; // iv.tag.ciphertext (base64), AES-256-GCM
  tokenLastFour: string;
  status: IntegrationStatus;
  connectedById: string;
  connectedAt: string;
  updatedAt: string;
}

// v1 publishing platforms eligible for client one-time-connect invites.
export const V1_CONNECT_PLATFORMS = [
  "Facebook",
  "Instagram",
  "Google Business Profile",
  "TikTok",
] as const;

export type V1ConnectPlatform = (typeof V1_CONNECT_PLATFORMS)[number];
/** Alias for content-repurposing (V1 module 5) — same v1 platform set. */
export type RepurposePlatform = V1ConnectPlatform;

export type ConnectInviteStatus = "pending" | "completed" | "expired" | "revoked";

// A single-use link the agency sends to a client so they can OAuth-connect (or
// paste a token for TikTok/demo) without logging into the Command Centre.
export interface ConnectInvite {
  id: string;
  tenantId: string;
  companyId: string;
  platform: string;
  token: string;
  accountNameHint?: string;
  recipientEmail?: string;
  status: ConnectInviteStatus;
  invitedById: string;
  completedAt?: string;
  integrationId?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Public REST API (M27) ---------------------------------------------------

export const API_KEY_SCOPES = [
  "companies:read",
  "content:read",
  "content:write",
  "leads:read",
  "leads:write",
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  companyIds: string[] | null;
  createdById: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PARTNER_WEBHOOK_EVENTS = [
  "content.created",
  "content.updated",
  "lead.created",
  "ping",
] as const;

export type PartnerWebhookEvent = (typeof PARTNER_WEBHOOK_EVENTS)[number];

export type PartnerWebhookStatus = "pending" | "active" | "disabled";

export interface PartnerWebhook {
  id: string;
  tenantId: string;
  label: string;
  url: string;
  events: PartnerWebhookEvent[];
  secretEnc: string;
  status: PartnerWebhookStatus;
  createdById: string;
  verifiedAt?: string | null;
  lastDeliveryAt?: string | null;
  lastDeliveryStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

// "requeued" is an operator marker: a dead-lettered post was manually put back
// in the queue. It resets the derived attempt count (attempts are counted as
// the failed logs SINCE the newest requeued/published marker), so the retry
// budget starts fresh after a human intervenes — without mutating history.
export type PublishLogStatus = "published" | "failed" | "skipped" | "requeued";

// Append-only log of every publish attempt (§31 publishing logs).
export interface PublishLog {
  id: string;
  companyId: string;
  platform: string;
  integrationId?: string;
  scheduledPostId?: string;
  socialResponseId?: string;
  contentId?: string;
  status: PublishLogStatus;
  attempt: number;
  detail: string; // simulated platform post id, error, or skip reason
  actorId: string;
  createdAt: string;
}

// Publishing freeze & kill switch (§32) — ONE control panel PER TENANT since
// T1 (a tenant's freeze must never affect another tenant).
export interface PublishingControls {
  tenantId: string;
  freezeAll: boolean;
  automatedPublishingDisabled: boolean;
  socialRepliesDisabled: boolean;
  frozenCompanyIds: string[];
  frozenPlatforms: string[];
  frozenCampaignIds: string[];
}

// ---- Phase 10: Advanced Admin & Security -------------------------------------------

// Security & governance settings (§33 crisis, §53 retention, §56 sandbox,
// AI cost limits). ONE record PER TENANT since T1 — a tenant's crisis mode or
// AI cap must never affect another tenant.
export interface SecuritySettings {
  tenantId: string;
  crisisMode: boolean; // §33 — freeze publishing, escalate all replies
  crisisNote?: string;
  sandboxMode: boolean; // §56 — block publishing, label outputs as test
  retentionDays: number; // §53 — data retention policy (display/report)
  aiMonthlyCapUsd: number; // AI usage/cost cap; 0 = uncapped
  updatedAt: string;
  updatedById?: string;
}

export type LegalHoldScope = "content" | "social" | "company";

// Legal hold (§54): once applied, the target record must not be edited,
// archived or overwritten until released.
export interface LegalHold {
  id: string;
  tenantId: string;
  scope: LegalHoldScope;
  targetId: string; // content id / social id / company id
  companyId: string;
  reason: string;
  active: boolean;
  appliedById: string;
  appliedAt: string;
  releasedById?: string;
  releasedAt?: string;
}

// ---- V1 module 11: AI-MOS suggest-only (Phase 19 slice) ---------------------------

export type AiMosOpportunityKind =
  | "health_decline"
  | "calendar_gap"
  | "publishing_cadence"
  | "recommendation_signal"
  | "approval_bottleneck";

export type AiMosOpportunityStatus = "open" | "converted" | "dismissed";

export interface AiMosEvidence {
  signal: string;
  observed: string;
  inferred?: string;
}

export interface AiMosSuggestedAction {
  kind: "campaign" | "content_request" | "task";
  goal?: string;
  objective?: string;
  topic?: string;
  requestType?: RequestType;
  audience?: string;
}

export interface AiMosOpportunity {
  id: string;
  tenantId: string;
  companyId: string;
  kind: AiMosOpportunityKind;
  title: string;
  diagnosis: string;
  suggestedAction: AiMosSuggestedAction;
  evidence: AiMosEvidence[];
  priority: number;
  status: AiMosOpportunityStatus;
  aiRunId?: string | null;
  createdById: string;
  createdAt: string;
  convertedAt?: string | null;
  dismissedAt?: string | null;
  dismissReason?: string | null;
  resultType?: "campaign" | "content" | "request" | null;
  resultId?: string | null;
}

// ---- W1 M22: Calendar assist (30-day governed suggestions) -------------------

export type CalendarAssistSuggestionKind =
  | "seasonal_prompt"
  | "calendar_gap"
  | "cadence_fill"
  | "optimal_window";

export type CalendarAssistSuggestionStatus = "open" | "accepted" | "dismissed";

export interface CalendarAssistEvidence {
  signal: string;
  observed: string;
}

export interface CalendarAssistSuggestion {
  id: string;
  tenantId: string;
  companyId: string;
  kind: CalendarAssistSuggestionKind;
  title: string;
  brief: string;
  proposedDate: string;
  proposedTime?: string;
  platform: string;
  requestType: RequestType;
  evidence: CalendarAssistEvidence[];
  priority: number;
  status: CalendarAssistSuggestionStatus;
  aiRunId?: string | null;
  createdById: string;
  createdAt: string;
  acceptedAt?: string | null;
  dismissedAt?: string | null;
  dismissReason?: string | null;
  resultContentId?: string | null;
}

// ---- Phase 9: AI Recommendation Engine (§44) ---------------------------------------

export type RecommendationType =
  | "best_platform"
  | "top_performer_repurpose"
  | "underperformer"
  | "content_gap"
  | "timing"
  | "offer_refresh"
  | "complaint_insight"
  | "faq_insight"
  | "next_campaign"
  | "stale_content"
  | "calendar_gap"
  | "publishing_cadence"
  | "seo_gap"
  | "review_gap"
  | "loyalty_opportunity"
  | "retention_risk";

// How a recommendation can be actioned (§44: become tasks, campaigns or
// content requests). Fields are prefill hints for the target builder.
export interface RecommendationAction {
  kind: "content_request" | "campaign" | "task" | "repurpose" | "review";
  requestType?: RequestType;
  topic?: string;
  objective?: string;
  audience?: string;
  serviceFocus?: string;
  contentId?: string;
  reviewHref?: string;
  /** Stored in jsonb — rank at generation time (no extra DB column). */
  _score?: number;
  /** Persisted in action jsonb when dismissed — no extra DB column required. */
  dismiss?: { reason: string; dismissedAt?: string };
}

export type RecommendationStatus = "open" | "actioned" | "dismissed" | "snoozed";

export interface RecommendationEvidence {
  signal: string;
  observed: string;
  inferred?: string;
}

export interface Recommendation {
  id: string;
  companyId: string;
  type: RecommendationType;
  title: string;
  rationale: string;
  action: RecommendationAction;
  status: RecommendationStatus;
  createdById: string;
  createdAt: string;
  /** Rank score at generation time (higher = more urgent). */
  score?: number;
  resultType?: string; // e.g. "campaign", "request", "task"
  resultId?: string;
  /** Optional top-level mirror; prefer action.dismiss.reason when set. */
  dismissReason?: string;
  evidence?: RecommendationEvidence[];
  snoozedUntil?: string | null;
}

export interface RecommendationDismissRecord {
  id: string;
  companyId: string;
  recommendationType: RecommendationType;
  title: string;
  reason?: string;
  dismissedById: string;
  dismissedAt: string;
}

export interface AgencyPortfolioAttention {
  companyId: string;
  companyName: string;
  openCount: number;
  snoozedCount: number;
  topScore: number;
  headline: string;
}

// Lightweight task (§44/§50) — created from a recommendation or ad hoc.
export interface Task {
  id: string;
  companyId: string;
  title: string;
  detail?: string;
  status: "open" | "done";
  sourceRecommendationId?: string | null;
  createdById: string;
  createdAt: string;
  doneAt?: string | null;
}

// ---- Phase 8: UTM tracking & attribution (§42) -------------------------------------

// A trackable link built by the UTM builder or auto-created for a published
// post. Clicks/leads are derived deterministically by the analytics engine
// (production: pull from the analytics tool / CRM).
export interface UtmLink {
  id: string;
  companyId: string;
  destinationUrl: string;
  source: string; // utm_source (e.g. facebook)
  medium: string; // utm_medium (e.g. social, email, cpc)
  campaign: string; // utm_campaign
  contentType?: string; // utm_content
  campaignId?: string | null;
  contentId?: string | null;
  requestId?: string | null;
  createdById: string;
  createdAt: string;
}

// ---- Module 6: Paid advertising (delegated model + management fee) ------------
//
// LOCKED owner decision (2026-07-06): DELEGATED ad accounts + management fee.
// The client connects their OWN Google Ads / Meta ad account via OAuth (a
// scoped, revocable token — never a password, never their card). The platform
// bills the CLIENT directly for ad spend; WE manage campaigns/budgets and
// charge a separate management fee via Stripe. We never front spend or store a
// card, so there is no payment-facilitator/reseller risk. Live campaign
// execution + lead capture are gated on Google Ads API + Meta Marketing API
// approval; everything modelled here (budget, allocation guidance, connect,
// management fee, unified dashboard) is buildable + verifiable now, with paid
// metrics SIMULATED until those approvals land.

export type AdPlatform = "google_ads" | "meta_ads";

export const AD_PLATFORMS: { key: AdPlatform; label: string }[] = [
  { key: "google_ads", label: "Google Ads" },
  { key: "meta_ads", label: "Meta Ads" },
];

export type AdAccountStatus = "connected" | "disconnected" | "revoked";

// A DELEGATED ad-account connection (mirrors PublishingIntegration): the token
// is the client's scoped ad-management grant, encrypted at rest; only the last
// four chars are ever shown. `externalAccountId` is the client's own ad-account
// id at the platform (Google Ads customer id / Meta ad-account id) — the target
// the platform bills, never us.
export interface AdAccount {
  id: string;
  companyId: string;
  platform: AdPlatform;
  accountName: string;
  externalAccountId: string;
  encryptedToken: string; // iv.tag.ciphertext (base64), AES-256-GCM
  tokenLastFour: string;
  status: AdAccountStatus;
  connectedById: string;
  connectedAt: string;
  updatedAt: string;
}

// Management-fee model (owner decision: flat monthly OR % of managed spend).
// We invoice this via Stripe; we never touch the ad spend itself.
export type FeeModel = "percent_of_spend" | "flat_monthly";

// One paid-advertising budget per company (a per-company singleton). Holds the
// client's monthly ad budget (THEIR spend), the AI-guided per-platform split,
// and our management-fee terms.
export interface AdBudget {
  companyId: string;
  monthlyBudgetUsd: number; // the client's own monthly ad spend
  // Fraction of the budget per platform; the AI allocation guidance proposes
  // these and an admin applies them. Sums to ~1 across connected platforms.
  allocation: Partial<Record<AdPlatform, number>>;
  feeModel: FeeModel;
  feePercent: number; // used when feeModel === "percent_of_spend" (0.15 = 15%)
  feeFlatUsd: number; // used when feeModel === "flat_monthly"
  updatedById: string;
  updatedAt: string;
}

export type AdCampaignObjective = "leads" | "traffic" | "awareness" | "sales";
export type AdCampaignStatus = "draft" | "active" | "paused" | "ended";

// A managed paid campaign. Live execution (Google Ads API / Meta Marketing API)
// is gated on approval; until then its performance is SIMULATED deterministically
// (src/lib/paid.ts, seeded by id — the analytics analogue of the simulated
// publisher). Paid-ad copy still routes through the governed pipeline elsewhere.
export interface AdCampaign {
  id: string;
  companyId: string;
  adAccountId: string;
  platform: AdPlatform;
  name: string;
  objective: AdCampaignObjective;
  dailyBudgetUsd: number;
  status: AdCampaignStatus;
  startDate: string; // ISO date
  endDate?: string; // ISO date; open-ended while active
  // Which saved audience this campaign runs against (Module 6 targeting).
  // Optional/null = broad/untargeted. On delete of the segment this nulls.
  audienceSegmentId?: string | null;
  /** Platform campaign id once live execution creates/syncs the object. */
  externalCampaignId?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Ad audience targeting (Module 6/7) ---------------------------------------
//
// A structured, platform-agnostic targeting spec that captures the dimensions
// BOTH Google Ads and Meta Ads support. It is a media-plan record, not customer
// PII: "custom/lookalike audiences" are referenced by the client's OWN
// named/id'd audiences at the platform (built on THEIR pixel/customer list) —
// we never store the underlying customer data. When ADS_LIVE lands, the
// connector translates this into each platform's targeting payload.

export type GeoTargetKind = "country" | "region" | "city" | "postcode" | "radius";

// One location include/exclude. `radius` uses a place + radiusKm (local-business
// sweet spot — "10km around the venue"); the others are named places/codes.
export interface GeoTarget {
  kind: GeoTargetKind;
  value: string; // "Australia" / "NSW" / "Sydney" / "2000" / "Bondi Beach NSW"
  radiusKm?: number; // only for kind==="radius"
  exclude?: boolean; // exclude this location instead of including it
}

export type Gender = "all" | "male" | "female";
export type DeviceTarget = "all" | "mobile" | "desktop" | "tablet";

export interface AdTargeting {
  locations: GeoTarget[];
  ageMin: number; // 13–65
  ageMax: number; // 13–65 (65 means "65+")
  gender: Gender;
  languages: string[];
  // Meta detailed-targeting interests / Google affinity + in-market segments —
  // free-text terms mapped to each platform's taxonomy at launch time.
  interests: string[];
  // Named custom/lookalike/remarketing audiences at the platform (by name/id;
  // NEVER the underlying customer list — that stays on the client's account).
  customAudiences: string[];
  // Excluded interests/audiences (negative targeting).
  exclusions: string[];
  devices: DeviceTarget;
  // Optional placements: feed / stories / reels / search / display / youtube /
  // audience_network. Empty = automatic placements.
  placements: string[];
}

// A REUSABLE saved audience for one company — define once, attach to many
// campaigns (Module 7 "audience segmentation"). `platform` scopes which
// platform(s) the targeting is valid for ("all" or a specific one, since some
// dimensions differ between Google and Meta).
export interface AudienceSegment {
  id: string;
  companyId: string;
  name: string;
  platform: "all" | AdPlatform;
  targeting: AdTargeting;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus = "new" | "qualified" | "won" | "lost";

// An ingested lead (Meta Lead Ads / Google lead forms) — closes the loop for
// attribution + AI budget guidance. Live capture is via webhooks (env-gated);
// seeded/simulated until the ad APIs are approved. PII beyond a contact handle
// is deliberately minimal.
export interface Lead {
  id: string;
  companyId: string;
  platform: AdPlatform;
  adCampaignId?: string | null;
  contact: string; // name or masked handle — minimal PII
  source: string; // "meta_lead_ad" | "google_lead_form" | "manual"
  externalLeadId?: string | null; // platform lead id — webhook idempotency key
  valueUsd?: number; // won/estimated value (from the CRM in production)
  status: LeadStatus;
  capturedAt: string;
}


// ---- CRM program management (Module 7 / W3 M30) -------------------------------
export type CrmConsentStatus = "subscribed" | "unsubscribed" | "pending";
export type CrmContactSource = "manual" | "ad_lead" | "form" | "import" | "order";
export interface CrmContact {
  id: string; companyId: string; email?: string; phone?: string; firstName: string; lastName?: string;
  tags: string[]; consentStatus: CrmConsentStatus; source: CrmContactSource; leadId?: string | null;
  notes?: string; createdById: string; createdAt: string; updatedAt: string;
}
export type CrmSegmentRuleType = "manual" | "tag" | "consent";
export interface CrmSegmentRuleConfig { contactIds?: string[]; tags?: string[]; consentStatus?: CrmConsentStatus; }
export interface CrmSegment {
  id: string; companyId: string; name: string; description?: string; ruleType: CrmSegmentRuleType;
  ruleConfig: CrmSegmentRuleConfig; createdById: string; createdAt: string; updatedAt: string;
}
export type CrmInteractionChannel = "email" | "sms" | "call" | "form" | "ad_lead" | "order" | "social" | "note";
export type CrmInteractionDirection = "inbound" | "outbound";
export interface CrmInteraction {
  id: string; companyId: string; contactId: string; channel: CrmInteractionChannel; direction: CrmInteractionDirection;
  summary: string; detail?: string; occurredAt: string; createdById?: string; metadata?: Record<string, unknown>;
}

// ---- Digital journey & conversion funnel (W4 M35) ---------------------------
export type FunnelJourneyStatus = "draft" | "active" | "archived";
export interface FunnelTouchpoint {
  id: string;
  label: string;
  channel: string;
  order: number;
}
export interface FunnelJourney {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  touchpoints: FunnelTouchpoint[];
  status: FunnelJourneyStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export type ConversionFunnelStatus = "draft" | "active" | "archived";
export type FunnelCtaKind = "button" | "form" | "booking";
export interface FunnelStage {
  id: string;
  name: string;
  order: number;
  ctaKind?: FunnelCtaKind;
}
export interface ConversionFunnel {
  id: string;
  companyId: string;
  journeyId?: string | null;
  name: string;
  stages: FunnelStage[];
  status: ConversionFunnelStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface FunnelLandingPage {
  id: string;
  companyId: string;
  funnelId?: string | null;
  slug: string;
  title: string;
  url?: string;
  viewCount: number;
  uniqueVisitors: number;
  ctaClicks: number;
  formSubmissions: number;
  bounceRatePct: number;
  avgTimeOnPageSec: number;
  createdAt: string;
  updatedAt: string;
}

export type FunnelAbStatus = "draft" | "running" | "completed";
export interface FunnelAbVariant {
  id: string;
  label: string;
  headline: string;
  ctaText: string;
  weight: number;
}
export interface FunnelAbExperiment {
  id: string;
  companyId: string;
  funnelId?: string | null;
  landingPageId?: string | null;
  name: string;
  status: FunnelAbStatus;
  variants: FunnelAbVariant[];
  winnerVariantId?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface FunnelStageMetric {
  stageId: string;
  stageName: string;
  order: number;
  entrants: number;
  dropOff: number;
  dropOffPct: number;
  conversionRatePct: number;
  ctaKind?: FunnelCtaKind;
}

export type OfferStatus = "draft" | "approved" | "archived";

// Offer & Promotion Manager (§30). The AI may only promote live approved offers.
export interface Offer {
  id: string;
  companyId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  terms?: string;
  exclusions?: string;
  approvedWording: string;
  requiredDisclaimer?: string;
  channelsAllowed: string[]; // empty = all channels
  status: OfferStatus;
  createdAt: string;
  updatedAt: string;
}

// ---- Phase 11: Creative Asset System (§46) -----------------------------------------

export type AssetType =
  | "logo"
  | "image"
  | "video"
  | "graphic"
  | "document"
  | "audio";

// Creative approval lifecycle — mirrors content: nothing is usable until an
// admin approves it, and only approved assets can be referenced by content.
export type AssetStatus =
  | "draft"
  | "pending_approval"
  | "changes_required"
  | "approved"
  | "rejected"
  | "archived";

// Where an asset came from. Canva/Figma are integration stubs (§46) — we store
// the external edit reference, never the bytes (mirrors request uploads).
export type AssetSource =
  | "upload"
  | "canva"
  | "figma"
  | "stock"
  | "ai_generated";

// Licence basis for using an asset.
export type LicenceType =
  | "owned" // company owns it outright
  | "licensed" // paid / stock licence with terms
  | "royalty_free"
  | "user_generated" // customer / UGC — needs consent
  | "unknown";

// Usage-rights record (§46). The core rule: an asset must NOT be usable in a
// channel unless its rights allow it — enforced server-side (see lib/assets.ts).
export interface AssetUsageRights {
  owner: string; // who owns / supplied the asset
  licenceType: LicenceType;
  licenceRef?: string; // licence number / contract / stock id
  consentObtained: boolean; // model / customer / property release on file
  consentRef?: string; // Consent Register id or document reference
  allowedChannels: string[]; // empty = all channels permitted
  expiryDate?: string; // ISO date; on/after expiry the asset must not be used
  restrictions?: string; // free-text usage restrictions
}

// Real-media DAM: a reference to the STORED BYTES (in the storage adapter —
// object store, never the JSON store). Absent for Canva/Figma/stock assets that
// only carry an externalRef.
export interface StoredFileRef {
  key: string; // object key: <tenantId>/<companyId>/<assetId>
  sizeBytes: number;
  mimeType: string;
  checksum: string; // sha256 of the bytes
}

// A creative asset. Byte payloads live in the storage adapter (src/lib/storage)
// referenced by `storedFile`; Canva/Figma/stock assets carry only an
// externalRef. The row itself never holds bytes.
export interface Asset {
  id: string;
  companyId: string;
  locationId?: string | null; // company/location folders (§46)
  folder?: string; // free-text folder path within the company
  name: string;
  description?: string;
  assetType: AssetType;
  source: AssetSource;
  externalRef?: string; // Canva/Figma edit URL or stock/file id (metadata only)
  storedFile?: StoredFileRef; // real-media DAM: the uploaded bytes
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  tags: string[];
  usageRights: AssetUsageRights;
  status: AssetStatus;
  createdById: string;
  approvedById?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // Module 3 — AI provenance for generated assets:
  aiModel?: string;
  aiPrompt?: string;
  aiRunId?: string | null;
  estCostUsd?: number;
  sourcesUsed?: string[];
}

// Brand template (§46) — a reusable creative layout/spec. Tenant-wide when
// companyId is null. Canva/Figma templates keep their external edit reference.
export type BrandTemplateKind =
  | "social_post"
  | "story"
  | "poster"
  | "email_header"
  | "flyer"
  | "video_intro";

export interface BrandTemplate {
  id: string;
  tenantId: string | null; // null = platform library (curated, read-only to tenants)
  companyId: string | null; // null = tenant-wide
  name: string;
  kind: BrandTemplateKind;
  description: string;
  dimensions?: string; // e.g. "1080x1080"
  source: AssetSource;
  externalRef?: string; // template edit URL / file id
  spec?: string; // structured layout guidance (fed into image briefs)
  active: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Phase 4: AI visuals + photo shoots (Module 2, 2026-07-08) -------------------

// Managed professional photo shoot — human photographer, automated workflow
// (request → schedule → shoot → DAM upload → approve → optional content attach).
export type PhotoShootStatus =
  | "requested"
  | "scheduled"
  | "in_progress"
  | "delivered"
  | "completed"
  | "cancelled";

export interface PhotoShoot {
  id: string;
  companyId: string;
  brief: string;
  location?: string;
  scheduledAt?: string; // ISO datetime when the shoot is booked
  status: PhotoShootStatus;
  photographerNotes?: string;
  deliverableAssetIds: string[]; // assets uploaded after the shoot
  targetContentId?: string; // optional content to auto-attach after asset approval
  targetChannels: string[]; // channels the deliverables should permit
  marketplaceBookingId?: string; // set when booked via photographer marketplace
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

// ---- V1 module 14: Photographer marketplace (2026-07-08) -------------------------

export type PhotographerConnectStatus = "not_started" | "pending" | "active";

/** Platform photographers (tenantId null) or tenant-scoped preferred suppliers. */
export interface PhotographerProfile {
  id: string;
  tenantId: string | null;
  name: string;
  bio?: string;
  specialty: string[];
  serviceArea?: string;
  stripeConnectAccountId?: string;
  connectStatus: PhotographerConnectStatus;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PhotographerPackage {
  id: string;
  photographerId: string;
  title: string;
  description?: string;
  durationMinutes: number;
  priceCents: number;
  includes: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MarketplaceBookingStatus = "pending_payment" | "confirmed" | "cancelled";

export type MarketplacePaymentStatus = "pending" | "paid" | "simulated" | "failed";

/** Payout held until shoot completes (DAM upload → approve path). */
export type MarketplacePayoutStatus = "pending" | "held" | "released" | "simulated";

export interface PhotoMarketplaceBooking {
  id: string;
  companyId: string;
  photographerId: string;
  packageId: string;
  photoShootId: string;
  scheduledSlot?: string;
  brief?: string;
  location?: string;
  status: MarketplaceBookingStatus;
  paymentStatus: MarketplacePaymentStatus;
  payoutStatus: MarketplacePayoutStatus;
  totalCents: number;
  marketplaceFeeCents: number;
  photographerPayoutCents: number;
  stripeCheckoutSessionId?: string;
  bookedById: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Phase 5: Restaurant menus (Module 4, 2026-07-08) -------------------------------

// Designed-menu deliverable — human designer workflow with a 2-free-menus/year
// entitlement counter (billingClass set at request time; enforced in menu-design.ts).
export type MenuDesignStatus =
  | "requested"
  | "in_design"
  | "client_review"
  | "delivered"
  | "completed"
  | "cancelled";

export type MenuDesignFormat = "print" | "digital" | "both";

export type MenuBillingClass = "included" | "billable";

export interface MenuDesign {
  id: string;
  companyId: string;
  title: string;
  brief: string;
  format: MenuDesignFormat;
  status: MenuDesignStatus;
  billingClass: MenuBillingClass; // "included" consumes a free slot for quotaYear
  quotaYear: number; // calendar year the included slot was charged against
  designerNotes?: string;
  deliverableAssetIds: string[]; // final menu PDFs/images in the DAM
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Phase 6: Order Now direct ordering (Module 5, 2026-07-08) ----------------------

export type OrderFulfillment = "pickup" | "delivery";

export type OrderPaymentStatus = "pending" | "paid" | "failed" | "simulated";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "accepted"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export type ConnectStatus = "not_started" | "pending" | "active" | "restricted";

export interface OrderMenuItem {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  priceCents: number;
  category: string;
  available: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderingSettings {
  companyId: string;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  minOrderCents: number;
  buttonLabel: string;
  stripeConnectAccountId?: string;
  connectStatus: ConnectStatus;
  updatedAt: string;
}

export interface OrderLine {
  menuItemId: string;
  name: string;
  priceCents: number;
  quantity: number;
}

export interface RestaurantOrder {
  id: string;
  companyId: string;
  status: OrderStatus;
  fulfillment: OrderFulfillment;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  deliveryAddress?: string;
  lines: OrderLine[];
  subtotalCents: number;
  totalCents: number;
  notes?: string;
  paymentStatus: OrderPaymentStatus;
  stripeCheckoutSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Email marketing (W3 M31) -------------------------------------------------

export type EmailTemplateKind =
  | "newsletter"
  | "promotion"
  | "event"
  | "review_request"
  | "win_back"
  | "custom";

export type EmailCampaignStatus = "draft" | "scheduled" | "sent" | "cancelled";

export interface EmailTemplate {
  id: string;
  companyId: string;
  name: string;
  kind: EmailTemplateKind;
  subject: string;
  previewText?: string;
  htmlBody: string;
  accentColor?: string;
  active: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailSubscriber {
  id: string;
  companyId: string;
  email: string;
  name?: string;
  tags: string[];
  marketingConsent: boolean;
  unsubscribedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailCampaignStats {
  recipients: number;
  sent: number;
  failed: number;
  opens: number;
  clicks: number;
  unsubscribes: number;
  bounces: number;
}

export interface EmailCampaign {
  id: string;
  companyId: string;
  templateId: string;
  name: string;
  subject: string;
  status: EmailCampaignStatus;
  scheduledAt?: string;
  sentAt?: string;
  segmentTag?: string | null;
  stats: EmailCampaignStats;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}


// ---- SMS marketing (W3 M32) ---------------------------------------------------
//
// Consent-based promotional + transactional SMS. Sends are env-gated
// (SMS_LIVE + Twilio creds); without keys the module records intent and uses
// deterministic simulated delivery.

export type SmsCampaignKind = "promotional" | "transactional";
export type SmsCampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled" | "failed";
export type SmsConsentStatus = "opted_in" | "opted_out" | "pending";
export type SmsSubscriberSource = "manual" | "import" | "crm" | "keyword";

export interface SmsCompanySettings {
  companyId: string;
  countryCode: string;
  senderId: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  monthlySpendCapUsd?: number;
  updatedById?: string;
  updatedAt: string;
}

export interface SmsSubscriber {
  id: string;
  companyId: string;
  phoneE164: string;
  name?: string;
  tags: string[];
  consentStatus: SmsConsentStatus;
  consentedAt?: string;
  optedOutAt?: string;
  source: SmsSubscriberSource;
  createdAt: string;
  updatedAt: string;
}

export interface SmsCampaignStats {
  recipients: number;
  segments: number;
  estimatedCostUsd: number;
  actualCostUsd: number;
  delivered: number;
  failed: number;
  blockedOptOut: number;
  blockedNoConsent: number;
  blockedQuietHours: number;
}

export interface SmsCampaign {
  id: string;
  companyId: string;
  name: string;
  body: string;
  kind: SmsCampaignKind;
  status: SmsCampaignStatus;
  scheduledAt?: string;
  sentAt?: string;
  segmentTag?: string | null;
  shortLink?: string;
  utmCampaign?: string;
  stats: SmsCampaignStats;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

// ---- Marketing automation workflows (W4 M36) -----------------------------------
//
// Trigger → condition → delay → action sequences. Distinct from Enterprise
// Automation cron at /automations. Simulated dispatch when WORKFLOW_LIVE is off.

export type WorkflowTriggerKind =
  | "customer_created"
  | "booking_made"
  | "review_received"
  | "birthday"
  | "cart_abandoned"
  | "tag_added"
  | "manual";

export type WorkflowStepKind = "condition" | "delay" | "action";

export type WorkflowActionKind = "send_email" | "send_sms" | "add_tag" | "create_task";

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";

export type WorkflowTemplateKind =
  | "welcome"
  | "win_back"
  | "review_request"
  | "post_stay"
  | "birthday_offer";

export type WorkflowDispatchStatus =
  | "simulated"
  | "sent"
  | "blocked_consent"
  | "blocked_quiet_hours"
  | "blocked_frequency"
  | "failed";

export interface WorkflowStepCondition {
  field: string;
  operator: "eq" | "neq" | "contains" | "gt" | "lt";
  value: string;
}

export interface WorkflowStepDelay {
  amount: number;
  unit: "minutes" | "hours" | "days";
}

export interface WorkflowStepAction {
  kind: WorkflowActionKind;
  subject?: string;
  body?: string;
  tag?: string;
}

export interface WorkflowStep {
  id: string;
  kind: WorkflowStepKind;
  condition?: WorkflowStepCondition;
  delay?: WorkflowStepDelay;
  action?: WorkflowStepAction;
}

export interface MarketingWorkflowSettings {
  companyId: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  frequencyCapPerWeek: number;
  updatedById?: string;
  updatedAt: string;
}

export interface MarketingWorkflow {
  id: string;
  tenantId: string;
  companyId: string | null;
  name: string;
  description?: string;
  triggerKind: WorkflowTriggerKind;
  templateKind?: WorkflowTemplateKind | null;
  status: WorkflowStatus;
  steps: WorkflowStep[];
  isAgencyTemplate: boolean;
  deployedFromTemplateId?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDispatchLog {
  id: string;
  workflowId: string;
  companyId: string;
  contactId?: string | null;
  channel: "email" | "sms" | "internal";
  stepId: string;
  status: WorkflowDispatchStatus;
  detail: string;
  createdAt: string;
}

export interface WorkflowRunStats {
  triggered: number;
  dispatched: number;
  blockedConsent: number;
  blockedQuietHours: number;
  blockedFrequency: number;
  simulated: number;
}

export interface WorkflowRunResult {
  ok: boolean;
  stats: WorkflowRunStats;
  logs: WorkflowDispatchLog[];
  blockedReason?: string;
}

// ---- Loyalty, Offers & Referrals (W4 M37) ---------------------------------------

export type LoyaltyRewardMode = "points" | "stamps";
export type LoyaltyMemberStatus = "active" | "suspended";

export interface LoyaltyProgram {
  companyId: string;
  rewardMode: LoyaltyRewardMode;
  pointsPerDollar: number;
  stampsPerReward: number;
  referralBonusPoints: number;
  enabled: boolean;
  updatedAt: string;
}

export interface LoyaltyTier {
  id: string;
  companyId: string;
  name: string;
  thresholdPoints: number;
  benefits: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoyaltyMember {
  id: string;
  companyId: string;
  contactId?: string | null;
  email?: string;
  displayName: string;
  pointsBalance: number;
  stampsBalance: number;
  tierId?: string | null;
  referralCode: string;
  referredByCode?: string | null;
  status: LoyaltyMemberStatus;
  createdAt: string;
  updatedAt: string;
}

export type LoyaltyCouponKind = "percent_off" | "fixed_off" | "bonus_points";
export type LoyaltyCouponStatus = "draft" | "active" | "expired" | "archived";

export interface LoyaltyCoupon {
  id: string;
  companyId: string;
  code: string;
  name: string;
  kind: LoyaltyCouponKind;
  value: number;
  segmentTag?: string | null;
  maxRedemptions?: number | null;
  perMemberLimit: number;
  minSpend?: number | null;
  expiresAt?: string | null;
  channels: string[];
  status: LoyaltyCouponStatus;
  redemptionCount: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export type LoyaltyReferralStatus = "pending" | "completed" | "void";

export interface LoyaltyReferral {
  id: string;
  companyId: string;
  referrerMemberId: string;
  refereeEmail: string;
  status: LoyaltyReferralStatus;
  bonusAwarded: number;
  createdAt: string;
  completedAt?: string | null;
}

export interface LoyaltyRedemption {
  id: string;
  companyId: string;
  memberId: string;
  couponId: string;
  amountOff: number;
  mode: "simulated" | "live";
  abuseFlagged: boolean;
  abuseReason?: string | null;
  redeemedAt: string;
}

// ---- W5 M40: Full RAG (versioned knowledge sources) --------------------------

export interface RagKnowledgeSource {
  id: string;
  companyId: string;
  title: string;
  sourceType: KnowledgeSourceType;
  status: KnowledgeDocStatus;
  currentVersionId?: string | null;
  approvedVersionId?: string | null;
  addedById: string;
  createdAt: string;
  updatedAt: string;
}

export interface RagKnowledgeVersion {
  id: string;
  sourceId: string;
  companyId: string;
  versionNumber: number;
  title: string;
  content: string;
  status: KnowledgeDocStatus;
  fileName?: string;
  contentType?: string;
  supersededById?: string | null;
  createdById: string;
  createdAt: string;
  approvedById?: string | null;
  approvedAt?: string | null;
}

// ---- Phase 12: Enterprise Automation (§61 Phase 12) --------------------------------

// Admin-controlled automation switches. ONE record PER TENANT since T1.
// The whole system is OFF by default and NEVER publishes — every automation
// produces drafts / suggestions / pending reviews that a human still approves
// (the core invariant is preserved).
export interface AutomationSettings {
  tenantId: string;
  enabled: boolean; // master switch (off by default)
  draftCampaignSuggestions: boolean; // auto-draft campaign suggestions
  monthlyContentGeneration: boolean; // auto-generate a monthly content batch
  analyticsSummaries: boolean; // auto-generate analytics summaries
  contentAlerts: boolean; // repurpose / stale-content / performance alerts
  // §40 low-risk auto-responses: OFF by default; auto-APPROVES (never publishes)
  // low-risk pending replies, and only while replies aren't disabled/crisis/sandbox.
  lowRiskAutoResponses: boolean;
  maxCampaignsPerRun: number; // automation limit control
  maxDraftsPerCompany: number; // automation limit control
  updatedAt: string;
  updatedById?: string;
}

export type AutomationJobKind =
  | "draft_campaign"
  | "monthly_content"
  | "analytics_summary"
  | "content_alerts"
  | "auto_response";

export interface AutomationOutcome {
  kind: AutomationJobKind;
  companyId?: string;
  companyName?: string;
  detail: string;
  resultType?: string; // "campaign" | "content" | "recommendation" | "social" | "summary"
  resultId?: string;
}

// One execution of the automation engine (the cron drop-in). Append-only,
// per tenant.
export interface AutomationRun {
  id: string;
  tenantId: string;
  trigger: "manual" | "cron";
  triggeredById: string;
  outcomes: AutomationOutcome[];
  createdAt: string;
}

// The minimum onboarding fields required before a company can be marked AI-ready.
export const MINIMUM_ONBOARDING_FIELDS: {
  key: string;
  label: string;
  present: (c: Company) => boolean;
}[] = [
  { key: "name", label: "Company name", present: (c) => !!c.name.trim() },
  {
    key: "serviceAreas",
    label: "Location / service area",
    present: (c) => c.profile.serviceAreas.length > 0,
  },
  {
    key: "natureOfBusiness",
    label: "Nature of business",
    present: (c) => !!c.profile.natureOfBusiness?.trim(),
  },
  {
    key: "services",
    label: "Services",
    present: (c) => c.profile.services.length > 0,
  },
  {
    key: "targetCustomers",
    label: "Target customers",
    present: (c) => !!c.profile.targetCustomers?.trim(),
  },
  {
    key: "brandVoice",
    label: "Brand voice",
    present: (c) => !!c.profile.brandVoice?.trim(),
  },
  {
    key: "callsToAction",
    label: "Calls to action",
    present: (c) => c.profile.callsToAction.length > 0,
  },
  {
    key: "approvalContact",
    label: "Approval contact",
    present: (c) => !!c.profile.approvalContact?.trim(),
  },
  {
    key: "prohibitedClaims",
    label: "Prohibited claims",
    present: (c) => c.profile.prohibitedClaims.length > 0,
  },
  {
    key: "documents",
    label: "At least one source document",
    present: (c) => c.documents.length > 0,
  },
];

export function onboardingScore(c: Company): {
  score: number;
  missing: string[];
} {
  const total = MINIMUM_ONBOARDING_FIELDS.length;
  const missing: string[] = [];
  let have = 0;
  for (const f of MINIMUM_ONBOARDING_FIELDS) {
    if (f.present(c)) have += 1;
    else missing.push(f.label);
  }
  return { score: Math.round((have / total) * 100), missing };
}

// ---- Website CMS (W4 M34) -----------------------------------------------------

export type CmsPageKind = "page" | "landing";
export type CmsPageStatus = "draft" | "pending_review" | "approved" | "published" | "archived";
export type CmsUpdateRequestStatus = "open" | "in_progress" | "completed" | "cancelled";

export interface CmsPage {
  id: string;
  companyId: string;
  slug: string;
  title: string;
  kind: CmsPageKind;
  status: CmsPageStatus;
  currentVersionId?: string | null;
  publishedVersionId?: string | null;
  liveUrl?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface CmsPageVersion {
  id: string;
  pageId: string;
  companyId: string;
  versionNumber: number;
  title: string;
  bodyHtml: string;
  changeSummary?: string;
  status: CmsPageStatus;
  createdById: string;
  createdAt: string;
  approvedById?: string | null;
  approvedAt?: string | null;
}

export interface CmsSeoMetadata {
  id: string;
  pageId: string;
  companyId: string;
  metaTitle: string;
  metaDescription: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImageUrl?: string;
  canonicalUrl?: string;
  noIndex: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CmsUpdateRequest {
  id: string;
  companyId: string;
  pageId?: string | null;
  title: string;
  description: string;
  status: CmsUpdateRequestStatus;
  requestedById: string;
  assignedToId?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
