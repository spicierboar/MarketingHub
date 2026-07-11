// In-memory data store for Phase 1 (dev / demo / verification).
//
// This is the working Phase-1 backend: it lets the whole product run and be
// verified end-to-end with no external accounts. Production persistence swaps
// this module for the Supabase adapter (schema in /supabase/migrations) behind
// the same repository functions in ./index.ts.
//
// State is stashed on globalThis so it survives Next.js hot-reload in dev.
//
// Seed data models two tenants (SaaS T1): a fictional family business group
// ("Wattle Group" — two IGA supermarkets, a motel and a cafe) and a marketing
// agency ("BrightSpark Marketing"), so tenant isolation can be verified.

import type {
  AdAccount,
  AdBudget,
  AdCampaign,
  AudienceSegment,
  AiRun,
  AiMosOpportunity,
  AiMosSignalRun,
  CalendarAssistSuggestion,
  ApprovedClaim,
  ApprovedResponse,
  Asset,
  AuditLog,
  AutomationRun,
  AutomationSettings,
  BrandTemplate,
  ApprovalPolicy,
  AiCampaignRecommendation,
  AiOrchestrationRun,
  AiPromptVersion,
  Campaign,
  CampaignBuilderRun,
  CampaignDraftScheduleItem,
  CampaignItem,
  CampaignPerformanceSnapshot,
  CampaignPlanVersion,
  Company,
  PrivacyRequest,
  ManagedDeliveryRun,
  CompanyCreditWallet,
  CompanyCreditLedgerEntry,
  CompanyEntitlement,
  MenuDesign,
  OrderMenuItem,
  OrderingSettings,
  BookingSettings,
  ServicePeriod,
  Reservation,
  PhotoShoot,
  PhotographerProfile,
  PhotographerPackage,
  PhotoMarketplaceBooking,
  RestaurantOrder,
  Tenant,
  TenantMember,
  CompanyAccess,
  ConsentRecord,
  EmailCampaign,
  EmailSubscriber,
  EmailTemplate,
  Lead,
  ContentComment,
  ContentItem,
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
  ScheduledPost,
  SecuritySettings,
  SmsCampaign,
  SmsCompanySettings,
  SmsSubscriber,
  LoyaltyProgram,
  LoyaltyTier,
  LoyaltyMember,
  LoyaltyCoupon,
  LoyaltyReferral,
  LoyaltyRedemption,
  ServiceRecord,
  Session,
  SocialMention,
  SocialResponseDraft,
  CrmContact,
  CrmInteraction,
  CrmSegment,
  ConversionFunnel,
  FunnelAbExperiment,
  FunnelJourney,
  FunnelLandingPage,
  CampaignExperiment,
  MarketingWorkflow,
  MarketingWorkflowSettings,
  WorkflowDispatchLog,
  CmsPage,
  CmsPageVersion,
  CmsSeoMetadata,
  CmsUpdateRequest,
  RagKnowledgeSource,
  RagKnowledgeVersion,
  CompanyReview,
  ReviewRequestCampaign,
  Task,
  TermsVersion,
  TermsAcceptance,
  User,
  UtmLink,
} from "@/lib/types";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { encryptToken } from "@/lib/crypto";

export interface DataStore {
  // SaaS T1: tenancy
  tenants: Tenant[];
  tenantMembers: TenantMember[];
  users: User[];
  access: CompanyAccess[];
  sessions: Session[];
  companies: Company[];
  requests: MarketingRequest[];
  content: ContentItem[];
  socialResponses: SocialResponseDraft[];
  socialMentions: SocialMention[];
  companyReviews: CompanyReview[];
  reviewRequestCampaigns: ReviewRequestCampaign[];
  contentComments: ContentComment[];
  audit: AuditLog[];
  // Phase 2: Brand Brain
  knowledgeDocs: KnowledgeDocument[];
  services: ServiceRecord[];
  localProfiles: LocalAreaProfile[];
  gaps: KnowledgeGap[];
  // Phase 3: Governance
  consents: ConsentRecord[];
  evidence: EvidenceRecord[];
  claims: ApprovedClaim[];
  responses: ApprovedResponse[];
  aiRuns: AiRun[];
  // Phase 4: Campaign Planner + Offer Manager
  campaigns: Campaign[];
  campaignItems: CampaignItem[];
  offers: Offer[];
  // Phase 5: Content Studio
  promptTemplates: PromptTemplate[];
  // Phase 6: Social Calendar & Scheduling
  scheduledPosts: ScheduledPost[];
  // Phase 7: Automated Publishing
  integrations: PublishingIntegration[];
  connectInvites: ConnectInvite[];
  apiKeys: ApiKey[];
  partnerWebhooks: PartnerWebhook[];
  publishLogs: PublishLog[];
  publishingControls: PublishingControls[]; // one per tenant (T1)
  // Phase 8: UTM tracking
  utmLinks: UtmLink[];
  // Module 6: Paid advertising (delegated model + management fee)
  adAccounts: AdAccount[];
  adBudgets: AdBudget[]; // one per company
  adCampaigns: AdCampaign[];
  audienceSegments: AudienceSegment[]; // reusable ad targeting audiences
  leads: Lead[];
  emailTemplates: EmailTemplate[];
  emailSubscribers: EmailSubscriber[];
  emailCampaigns: EmailCampaign[];
  crmContacts: CrmContact[];
  crmSegments: CrmSegment[];
  crmInteractions: CrmInteraction[];
  funnelJourneys: FunnelJourney[];
  conversionFunnels: ConversionFunnel[];
  funnelLandingPages: FunnelLandingPage[];
  funnelAbExperiments: FunnelAbExperiment[];
  campaignExperiments: CampaignExperiment[];
  smsSubscribers: SmsSubscriber[];
  smsCampaigns: SmsCampaign[];
  smsCompanySettings: SmsCompanySettings[];
  marketingWorkflows: MarketingWorkflow[];
  marketingWorkflowSettings: MarketingWorkflowSettings[];
  workflowDispatchLogs: WorkflowDispatchLog[];
  cmsPages: CmsPage[];
  cmsPageVersions: CmsPageVersion[];
  cmsSeoMetadata: CmsSeoMetadata[];
  cmsUpdateRequests: CmsUpdateRequest[];
  ragKnowledgeSources: RagKnowledgeSource[];
  ragKnowledgeVersions: RagKnowledgeVersion[];
  campaignPlanVersions: CampaignPlanVersion[];
  campaignBuilderRuns: CampaignBuilderRun[];
  campaignDraftScheduleItems: CampaignDraftScheduleItem[];
  loyaltyPrograms: LoyaltyProgram[];
  loyaltyTiers: LoyaltyTier[];
  loyaltyMembers: LoyaltyMember[];
  loyaltyCoupons: LoyaltyCoupon[];
  loyaltyReferrals: LoyaltyReferral[];
  loyaltyRedemptions: LoyaltyRedemption[];
  // Module 3: per-company add-on entitlements (video/photo/menus/order-button)
  companyEntitlements: CompanyEntitlement[];
  // Module 2: managed photo shoots (Phase 4)
  photoShoots: PhotoShoot[];
  // V1 module 14: photographer marketplace
  photographerProfiles: PhotographerProfile[];
  photographerPackages: PhotographerPackage[];
  photoMarketplaceBookings: PhotoMarketplaceBooking[];
  // Module 4: restaurant menu designs (Phase 5)
  menuDesigns: MenuDesign[];
  // Module 5: Order Now direct ordering (Phase 6)
  orderMenuItems: OrderMenuItem[];
  orderingSettings: OrderingSettings[];
  restaurantOrders: RestaurantOrder[];
  // W7 M50: Bookings & reservations
  bookingServicePeriods: ServicePeriod[];
  bookingSettings: BookingSettings[];
  reservations: Reservation[];
  // Phase 9: Recommendations + Tasks
  recommendations: Recommendation[];
  recommendationDismissHistory: RecommendationDismissRecord[];
  // W7 M55: Continuous learning
  learningHypotheses: LearningHypothesis[];
  learningLessons: LearningLesson[];
  // AI campaign management layer (0035)
  approvalPolicies: ApprovalPolicy[];
  aiPromptVersions: AiPromptVersion[];
  aiOrchestrationRuns: AiOrchestrationRun[];
  aiCampaignRecommendations: AiCampaignRecommendation[];
  campaignPerformanceSnapshots: CampaignPerformanceSnapshot[];
  // Privacy DSR (0037)
  privacyRequests: PrivacyRequest[];
  // Managed service delivery (0038)
  managedDeliveryRuns: ManagedDeliveryRun[];
  // Prepaid credit wallet (0039)
  companyCreditWallets: CompanyCreditWallet[];
  companyCreditLedger: CompanyCreditLedgerEntry[];
  tasks: Task[];
  // V1 module 11: AI-MOS opportunities
  aiMosOpportunities: AiMosOpportunity[];
  aiMosSignalRuns: AiMosSignalRun[];
  // W1 M22: Calendar assist suggestions
  calendarAssistSuggestions: CalendarAssistSuggestion[];
  // Phase 10: Advanced Admin & Security
  security: SecuritySettings[]; // one per tenant (T1)
  legalHolds: LegalHold[];
  // Phase 11: Creative Asset System
  assets: Asset[];
  brandTemplates: BrandTemplate[];
  // Phase 12: Enterprise Automation
  automation: AutomationSettings[]; // one per tenant (T1)
  automationRuns: AutomationRun[];
  // Client onboarding + versioned Terms & Conditions
  termsVersions: TermsVersion[]; // platform-level
  termsAcceptances: TermsAcceptance[];
}

function seed(): DataStore {
  const t = "2026-06-01T09:00:00.000Z";

  // ---- SaaS T1: two tenants prove isolation ---------------------------------
  // t_wattle = a business group (the original demo); t_bright = a marketing
  // agency with client companies. Nothing from one may ever be visible to the
  // other. Alex additionally carries the platformAdmin flag (curates the
  // platform template library) — that flag grants NO tenant-data access.
  const tenants: Tenant[] = [
    {
      id: "t_wattle",
      name: "Wattle Group",
      kind: "business_group",
      plan: "agency",
      status: "active",
      timezone: "Australia/Sydney",
      onboardingCompletedAt: t, // seeded demo tenants are already onboarded
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "t_bright",
      name: "BrightSpark Marketing",
      kind: "agency",
      plan: "starter",
      status: "active",
      onboardingCompletedAt: t,
      createdAt: t,
      updatedAt: t,
    },
  ];

  const users: User[] = [
    {
      id: "u_admin",
      email: "admin@wattlegroup.dev",
      name: "Alex Carter",
      role: "super_admin",
      active: true,
      platformAdmin: true,
      createdAt: t,
    },
    {
      id: "u_priya",
      email: "priya@millbrookiga.dev",
      name: "Priya Sharma",
      role: "admin",
      active: true,
      createdAt: t,
    },
    {
      id: "u_tom",
      email: "tom@millbrookiga.dev",
      name: "Tom Nguyen",
      role: "user",
      active: true,
      createdAt: t,
    },
    {
      id: "u_marco",
      email: "marco@westgateiga.dev",
      name: "Marco Bellini",
      role: "user",
      active: true,
      createdAt: t,
    },
    {
      id: "u_deb",
      email: "deb@goldenwattlemotel.dev",
      name: "Deb Hollis",
      role: "user",
      active: true,
      createdAt: t,
    },
    // BrightSpark Marketing (agency tenant)
    {
      id: "u_sasha",
      email: "sasha@brightspark.dev",
      name: "Sasha Nguyen",
      role: "super_admin",
      active: true,
      createdAt: t,
    },
    {
      id: "u_liam",
      email: "liam@brightspark.dev",
      name: "Liam Ford",
      role: "user",
      active: true,
      createdAt: t,
    },
    // A freelance consultant who works across BOTH workspaces — proves the
    // tenant switcher and that switching changes what they can see.
    {
      id: "u_jordan",
      email: "jordan@freelance.dev",
      name: "Jordan Lee",
      role: "user",
      active: true,
      createdAt: t,
    },
  ];

  const tenantMembers: TenantMember[] = [
    { tenantId: "t_wattle", userId: "u_admin", role: "owner", createdAt: t },
    { tenantId: "t_wattle", userId: "u_priya", role: "admin", createdAt: t },
    { tenantId: "t_wattle", userId: "u_tom", role: "member", createdAt: t },
    { tenantId: "t_wattle", userId: "u_marco", role: "member", createdAt: t },
    { tenantId: "t_wattle", userId: "u_deb", role: "member", createdAt: t },
    { tenantId: "t_bright", userId: "u_sasha", role: "owner", createdAt: t },
    {
      tenantId: "t_bright",
      userId: "u_liam",
      role: "member",
      portalOnly: true,
      createdAt: t,
    },
    // Jordan: a member of both tenants (different company in each).
    { tenantId: "t_wattle", userId: "u_jordan", role: "member", createdAt: t },
    { tenantId: "t_bright", userId: "u_jordan", role: "admin", createdAt: t },
  ];

  const companies: Company[] = [
    {
      id: "c_iga_millbrook",
      tenantId: "t_wattle",
      name: "Millbrook IGA",
      status: "ai_ready",
      profile: {
        legalName: "Millbrook Supermarkets Pty Ltd",
        tradingNames: "Millbrook IGA",
        industry: "Supermarket & Grocery Retail",
        businessType: "retail",
        website: "https://millbrookiga.example",
        approvalContact: "Priya Sharma (Store Owner)",
        serviceAreas: ["Millbrook", "Riverstone East", "Kurrajong Heights"],
        natureOfBusiness:
          "Full-service independent IGA supermarket: fresh produce, in-store butcher, bakery, deli, weekly catalogue specials, click & collect and local home delivery.",
        services: [
          "Weekly catalogue specials",
          "Fresh produce & butcher",
          "Bakery & deli",
          "Click & collect",
          "Local home delivery",
          "Community rewards program",
        ],
        targetCustomers:
          "Local families and seniors within 5km doing their weekly shop, plus tradies and commuters grabbing lunch and last-minute items.",
        brandVoice:
          "Friendly, community-first, proudly local. Plain everyday language — like chatting with a neighbour, never corporate.",
        callsToAction: [
          "Shop the weekly specials",
          "Order click & collect",
          "Visit us in store",
        ],
        prohibitedClaims: [
          "cheapest groceries",
          "half price (unless catalogue-confirmed)",
          "fresher than the big chains",
        ],
        approvedClaims: [
          "Locally owned & operated",
          "Supporting local growers and suppliers since 2009",
          "Community rewards — 1% back to local schools & clubs",
        ],
        requiredDisclaimers: ["Specials available while stocks last."],
        currentOffers:
          "$10 off your first click & collect order over $100 (ends 31 Aug 2026); weekly catalogue runs Wed–Tue",
        localMarketNotes:
          "Competes with Coles/Woolworths 15 min away on community, convenience and fresh quality — never on price claims. Sponsors the Millbrook Magpies footy club and two school fundraisers a term. Winter drives soup-veg, slow-cooking cuts and bakery lines.",
        retail: {
          productCategories: [
            "Fresh produce",
            "Butcher & deli",
            "Bakery",
            "Pantry & grocery",
            "Ready meals",
          ],
          heroProducts: [
            "In-store baked sourdough",
            "Local grass-fed mince",
            "Weekly catalogue fruit & veg box",
          ],
          promotions: [
            "$10 off first click & collect order over $100",
            "Community rewards — 1% back to local schools",
          ],
          seasons: [
            "Winter: soup vegetables, slow-cooking cuts, hot pies",
            "Summer: BBQ supplies, salads, ice cream",
            "Back-to-school: lunchbox snacks, drinks",
          ],
          pricePositioning:
            "Community value and freshness — never cheapest-in-town claims; catalogue-confirmed specials only.",
        },
      },
      documents: [
        {
          id: "doc_iga1",
          name: "Millbrook-IGA-brand-and-catalogue-guidelines.pdf",
          contentType: "application/pdf",
          size: 612480,
          approvalStatus: "approved",
          consentObtained: true,
          showsCustomer: false,
          uploadedBy: "u_priya",
          uploadedAt: t,
        },
      ],
      createdBy: "u_admin",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "c_iga_westgate",
      tenantId: "t_wattle",
      name: "Westgate IGA Xpress",
      status: "approved",
      profile: {
        legalName: "Westgate Convenience Retail Pty Ltd",
        tradingNames: "Westgate IGA Xpress",
        industry: "Convenience & Grocery Retail",
        website: "https://westgateiga.example",
        approvalContact: "Marco Bellini (Store Manager)",
        serviceAreas: ["Westgate", "Station Precinct"],
        natureOfBusiness:
          "Small-format IGA Xpress convenience store next to Westgate station: grab-and-go meals, barista coffee, essentials, snacks and top-up groceries with extended hours.",
        services: [
          "Barista coffee & grab-and-go",
          "Ready meals",
          "Everyday essentials",
          "Newspapers & parcel pickup",
        ],
        targetCustomers:
          "Commuters, apartment residents and office workers around the station wanting speed and convenience.",
        brandVoice:
          "Quick, upbeat, convenient. Short punchy lines for people on the move.",
        callsToAction: ["Grab it on your way", "Open early til late"],
        prohibitedClaims: [
          "cheapest coffee",
          "fastest service in Westgate",
        ],
        approvedClaims: ["Open 6am–10pm, 7 days", "Locally owned & operated"],
        requiredDisclaimers: [],
        currentOffers: "Coffee + breakfast wrap combo $9 before 9am",
        localMarketNotes:
          "Morning coffee rush is the peak; competes with two franchise cafes near the station. Parcel pickup drives afternoon foot traffic.",
      },
      documents: [],
      createdBy: "u_admin",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "c_motel",
      tenantId: "t_wattle",
      name: "Golden Wattle Motel",
      status: "ai_ready",
      profile: {
        legalName: "Golden Wattle Hospitality Pty Ltd",
        tradingNames: "Golden Wattle Motel",
        industry: "Accommodation & Hospitality",
        businessType: "hotel",
        website: "https://goldenwattlemotel.example",
        approvalContact: "Deb Hollis (Motel Manager)",
        serviceAreas: ["Millbrook", "Highway 31 corridor", "Wattle Valley wine region"],
        natureOfBusiness:
          "24-room family-run motel on the highway into Millbrook: queen and family rooms, free parking and Wi-Fi, pet-friendly rooms, weekly corporate rates for tradies and project crews.",
        services: [
          "Queen & family rooms",
          "Pet-friendly rooms",
          "Weekly corporate / tradie rates",
          "Free parking & Wi-Fi",
          "Early check-in by arrangement",
        ],
        targetCustomers:
          "Road travellers and grey nomads, tradies and corporate crews on weekly stays, families visiting for sport and events, wine-region weekenders.",
        brandVoice:
          "Warm country hospitality — genuine, unpretentious, helpful. The place that leaves the light on for you.",
        callsToAction: ["Book direct and save", "Call us on 03 5550 1234"],
        prohibitedClaims: [
          "luxury",
          "5-star",
          "best motel in town",
        ],
        approvedClaims: [
          "Free Wi-Fi and onsite parking",
          "Pet-friendly rooms available",
          "Book direct for the best rate — no booking fees",
        ],
        requiredDisclaimers: ["Rates subject to availability."],
        currentOffers:
          "Stay 2 nights, save 15% — direct bookings only (ends 30 Sep 2026)",
        localMarketNotes:
          "School holidays and local sports carnivals fill family rooms; winter weekday trade is tradie crews. OTAs take 15% commission, so pushing direct bookings is the priority. Wine-region weekenders are a growing segment.",
        hotel: {
          roomTypes: [
            "Queen standard",
            "Family room (queen + bunks)",
            "Pet-friendly queen",
          ],
          packages: [
            "Stay 2 nights save 15% — direct bookings",
            "Wine weekend: room + cellar-door voucher",
            "Tradie weekly rate — Mon–Thu",
          ],
          amenities: [
            "Free Wi-Fi",
            "Onsite parking",
            "Pet-friendly rooms",
            "Early check-in by arrangement",
          ],
          occupancyLanguage:
            "Limited rooms available — book direct for our best rate. Subject to availability.",
          directBookingBenefits:
            "No booking fees, best-rate guarantee, flexible change by phone.",
        },
      },
      documents: [
        {
          id: "doc_motel1",
          name: "Golden-Wattle-Motel-photo-pack-and-room-descriptions.pdf",
          contentType: "application/pdf",
          size: 1830912,
          approvalStatus: "approved",
          consentObtained: true,
          showsCustomer: false,
          uploadedBy: "u_deb",
          uploadedAt: t,
        },
      ],
      createdBy: "u_admin",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "c_cafe",
      tenantId: "t_wattle",
      name: "Wattle & Bean Cafe",
      status: "draft_onboarding",
      profile: {
        businessType: "restaurant_cafe",
        serviceAreas: ["Millbrook Main Street"],
        services: ["Coffee & brunch"],
        callsToAction: [],
        prohibitedClaims: [],
        approvedClaims: [],
        requiredDisclaimers: [],
        restaurant: {
          cuisineStyle: "Specialty coffee, all-day brunch, house-made pastries",
          serviceModes: ["Dine-in", "Takeaway coffee"],
          dietaryOptions: ["Vegetarian", "Gluten-friendly options"],
          peakServicePeriods: [
            "Weekday morning coffee rush 7–9am",
            "Weekend brunch 8am–1pm",
          ],
        },
      },
      documents: [],
      createdBy: "u_admin",
      createdAt: t,
      updatedAt: t,
    },
    // ---- BrightSpark Marketing's client companies (tenant t_bright) ----------
    {
      id: "c_dental",
      tenantId: "t_bright",
      name: "Harbour View Dental",
      status: "ai_ready",
      profile: {
        legalName: "Harbour View Dental Pty Ltd",
        industry: "Health & Dental",
        website: "https://harbourviewdental.example",
        approvalContact: "Dr. Mei Chen (Principal Dentist)",
        serviceAreas: ["Harbourside", "North Quay"],
        natureOfBusiness:
          "Family dental practice: check-ups, hygiene, cosmetic dentistry and emergency appointments.",
        services: ["Check-up & clean", "Teeth whitening", "Emergency dentistry"],
        targetCustomers: "Families and professionals within 10 minutes of Harbourside.",
        brandVoice: "Calm, reassuring, professional — never salesy about health.",
        callsToAction: ["Book online", "Call the practice"],
        prohibitedClaims: ["painless", "guaranteed results", "cheapest dentist"],
        approvedClaims: ["Same-week appointments available", "Preferred provider for major health funds"],
        requiredDisclaimers: ["Any surgical or invasive procedure carries risks."],
      },
      documents: [
        {
          id: "doc_dental1",
          name: "harbour-view-brand-guide.pdf",
          contentType: "application/pdf",
          size: 402100,
          approvalStatus: "approved",
          consentObtained: true,
          showsCustomer: false,
          uploadedBy: "u_sasha",
          uploadedAt: t,
        },
      ],
      createdBy: "u_sasha",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "c_florist",
      tenantId: "t_bright",
      name: "Coastal Blooms Florist",
      status: "approved",
      profile: {
        industry: "Retail Florist",
        businessType: "retail",
        approvalContact: "Josie Park (Owner)",
        serviceAreas: ["Harbourside", "Bayview"],
        natureOfBusiness: "Boutique florist: bouquets, weddings and event styling, same-day local delivery.",
        services: ["Bouquets", "Weddings & events", "Same-day delivery"],
        targetCustomers: "Gift buyers and wedding couples across the bay suburbs.",
        brandVoice: "Warm, romantic, a little playful.",
        callsToAction: ["Order before 1pm for same-day delivery"],
        prohibitedClaims: ["cheapest flowers"],
        approvedClaims: ["Same-day delivery before 1pm"],
        requiredDisclaimers: [],
      },
      documents: [],
      createdBy: "u_sasha",
      createdAt: t,
      updatedAt: t,
    },
  ];

  const access: CompanyAccess[] = [
    { userId: "u_priya", companyId: "c_iga_millbrook" },
    { userId: "u_tom", companyId: "c_iga_millbrook" },
    { userId: "u_marco", companyId: "c_iga_westgate" },
    { userId: "u_deb", companyId: "c_motel" },
    // BrightSpark: Liam is scoped to the dental client only.
    { userId: "u_liam", companyId: "c_dental" },
    // Jordan: Westgate in Wattle, and (as a tenant admin) all of BrightSpark.
    { userId: "u_jordan", companyId: "c_iga_westgate" },
  ];

  const requests: MarketingRequest[] = [
    {
      id: "r_1001",
      companyId: "c_iga_millbrook",
      requesterId: "u_tom",
      requestType: "social_post",
      objective:
        "Drive weekly-shop traffic by promoting this week's winter warmers catalogue lines and the click & collect offer",
      targetAudience: "Local families within 5km planning the weekly shop",
      platform: "Facebook",
      topic:
        "Winter warmers week — slow-cooking cuts from our butcher and soup veggies on special",
      offer: "$10 off your first click & collect order over $100",
      callToAction: "Order click & collect",
      preferredDate: "2026-07-08",
      preferredTime: "09:00",
      urgency: "normal",
      notes:
        "Catalogue runs Wed–Tue. Please mention our butcher by name is fine (staff consent on file).",
      consent: {
        customerNamed: false,
        customerInPhotos: false,
        consentObtained: false,
        mentionsPricing: true,
        mentionsOffer: true,
        performanceClaims: false,
      },
      uploads: [],
      status: "submitted",
      assignedReviewerId: null,
      statusHistory: [
        { status: "submitted", at: "2026-06-29T08:30:00.000Z", byId: "u_tom" },
      ],
      createdAt: "2026-06-29T08:30:00.000Z",
      updatedAt: "2026-06-29T08:30:00.000Z",
    },
    {
      id: "r_1002",
      companyId: "c_motel",
      requesterId: "u_deb",
      requestType: "campaign",
      objective:
        "Fill family rooms across the July school holidays and push direct bookings over OTA listings",
      targetAudience:
        "Families within 3 hours' drive planning a school-holiday getaway",
      platform: "Facebook + Instagram",
      topic:
        "School holidays in the Wattle Valley — family rooms, pet-friendly, kids' wildlife park 10 minutes away",
      offer: "Stay 2 nights, save 15% — direct bookings only",
      callToAction: "Book direct and save",
      preferredDate: "2026-07-06",
      preferredTime: "18:00",
      urgency: "high",
      notes:
        "Holidays have already started — the sooner the better. Photos of the family rooms are in our profile pack.",
      consent: {
        customerNamed: false,
        customerInPhotos: false,
        consentObtained: false,
        mentionsPricing: false,
        mentionsOffer: true,
        performanceClaims: false,
      },
      uploads: [],
      status: "submitted",
      assignedReviewerId: null,
      statusHistory: [
        { status: "submitted", at: "2026-07-02T17:45:00.000Z", byId: "u_deb" },
      ],
      createdAt: "2026-07-02T17:45:00.000Z",
      updatedAt: "2026-07-02T17:45:00.000Z",
    },
  ];

  // ---- Phase 2: Brand Brain seeds --------------------------------------------

  const knowledgeDocs: KnowledgeDocument[] = [
    {
      id: "kd_iga_about",
      companyId: "c_iga_millbrook",
      title: "Website — About Millbrook IGA",
      sourceType: "website_copy",
      status: "approved",
      version: 1,
      previousVersions: [],
      addedById: "u_priya",
      createdAt: t,
      updatedAt: t,
      content: [
        "Millbrook IGA has been locally owned and operated since 2009. We're your full-service community supermarket on Miller Street, with free parking and everything you need for the weekly shop.",
        "Our in-store butcher counter is run by Dave, who's been cutting meat in Millbrook for over 20 years. In winter his slow-cooking cuts — chuck, brisket, osso buco and lamb shanks — are customer favourites for soups and casseroles.",
        "We stock fresh produce from Wattle Valley growers, bake bread daily in-store, and run a full deli counter. Our community rewards program gives 1% of member purchases back to local schools and sporting clubs, including the Millbrook Magpies.",
        "Order online for click & collect — ready in two hours — or local home delivery to Millbrook, Riverstone East and Kurrajong Heights.",
      ].join("\n\n"),
    },
    {
      id: "kd_iga_faq",
      companyId: "c_iga_millbrook",
      title: "Customer FAQs",
      sourceType: "faq",
      status: "approved",
      version: 1,
      previousVersions: [],
      addedById: "u_priya",
      createdAt: t,
      updatedAt: t,
      content: [
        "Q: When do the weekly specials change? A: Our catalogue runs Wednesday to Tuesday. New specials go live in-store and online every Wednesday morning.",
        "Q: How does click & collect work? A: Order online before 2pm and your shop is ready to collect from the service desk within two hours. First order over $100 gets $10 off.",
        "Q: Do you deliver? A: Yes — local home delivery to Millbrook, Riverstone East and Kurrajong Heights for a flat $10 fee, Monday to Saturday.",
        "Q: What are your hours? A: Open 7am–8pm, seven days a week.",
      ].join("\n\n"),
    },
    {
      id: "kd_motel_rooms",
      companyId: "c_motel",
      title: "Room types & descriptions",
      sourceType: "brochure",
      status: "approved",
      version: 1,
      previousVersions: [],
      addedById: "u_deb",
      createdAt: t,
      updatedAt: t,
      content: [
        "Queen rooms: comfortable queen bed, ensuite, reverse-cycle air conditioning, smart TV, free Wi-Fi, tea and coffee, mini fridge. Parking at your door.",
        "Family rooms: queen bed plus two singles, sleeps four comfortably. Kitchenette with microwave, ensuite, and space for the kids to spread out. Two family rooms are pet-friendly.",
        "Pet-friendly rooms: ground-floor rooms with easy access to the exercise lawn. Pets welcome by arrangement.",
        "All stays include free onsite parking, free Wi-Fi and a guest laundry. The Wattle Valley wildlife park is 10 minutes up the road, and we're 15 minutes from the wine region cellar doors.",
      ].join("\n\n"),
    },
    {
      id: "kd_motel_faq",
      companyId: "c_motel",
      title: "Guest FAQs",
      sourceType: "faq",
      status: "approved",
      version: 1,
      previousVersions: [],
      addedById: "u_deb",
      createdAt: t,
      updatedAt: t,
      content: [
        "Q: Can I bring my dog? A: Yes — we have dedicated pet-friendly ground-floor rooms. Please let us know when booking.",
        "Q: What time is check-in? A: From 2pm. Early check-in by arrangement — just call ahead.",
        "Q: Is there parking? A: Free onsite parking right outside your room, including space for trailers.",
        "Q: Do you do weekly rates? A: Yes, weekly corporate and tradie rates are available — call us for a quote.",
      ].join("\n\n"),
    },
  ];

  const services: ServiceRecord[] = [
    {
      id: "svc_iga_butcher",
      companyId: "c_iga_millbrook",
      name: "In-store butcher",
      description:
        "Full-service butcher counter run by Dave — slow-cooking cuts, BBQ packs, bulk buys and custom cuts to order.",
      targetCustomer: "Families cooking at home; winter slow-cooker households",
      priceRange: undefined,
      priceApproved: false,
      marginPriority: "high",
      seasonality: "Winter peaks for slow-cooking cuts; summer for BBQ packs",
      locations: ["Millbrook"],
      requiredDisclaimer: undefined,
      restrictions: "No price-match or 'cheapest' wording",
      active: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "svc_iga_cc",
      companyId: "c_iga_millbrook",
      name: "Click & collect",
      description:
        "Order online before 2pm, collect from the service desk within two hours.",
      targetCustomer: "Busy families and commuters",
      priceRange: "Free service; $10 off first order over $100",
      priceApproved: true,
      marginPriority: "medium",
      seasonality: undefined,
      locations: ["Millbrook"],
      requiredDisclaimer: "Specials available while stocks last.",
      restrictions: undefined,
      active: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "svc_iga_delivery",
      companyId: "c_iga_millbrook",
      name: "Local home delivery",
      description:
        "Flat-fee home delivery to Millbrook, Riverstone East and Kurrajong Heights, Monday to Saturday.",
      targetCustomer: "Seniors and households without transport",
      priceRange: "$10 flat fee",
      priceApproved: true,
      marginPriority: "medium",
      seasonality: undefined,
      locations: ["Millbrook", "Riverstone East", "Kurrajong Heights"],
      requiredDisclaimer: undefined,
      restrictions: undefined,
      active: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "svc_motel_family",
      companyId: "c_motel",
      name: "Family rooms",
      description:
        "Queen bed plus two singles, kitchenette, sleeps four. Two rooms are pet-friendly.",
      targetCustomer: "Families on school-holiday and sports trips",
      priceRange: "From $189 per night",
      priceApproved: true,
      marginPriority: "high",
      seasonality: "School holidays and sports carnival weekends book out first",
      locations: ["Millbrook"],
      requiredDisclaimer: "Rates subject to availability.",
      restrictions: undefined,
      active: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "svc_motel_pet",
      companyId: "c_motel",
      name: "Pet-friendly rooms",
      description:
        "Ground-floor rooms with access to the exercise lawn. Pets by arrangement.",
      targetCustomer: "Road travellers and grey nomads with pets",
      priceRange: "$25 pet surcharge per stay",
      priceApproved: true,
      marginPriority: "medium",
      seasonality: undefined,
      locations: ["Millbrook"],
      requiredDisclaimer: "Rates subject to availability.",
      restrictions: undefined,
      active: true,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "svc_motel_weekly",
      companyId: "c_motel",
      name: "Weekly corporate / tradie rate",
      description:
        "Discounted weekly stays for project crews and corporate travellers, including trailer parking.",
      targetCustomer: "Tradies and corporate crews on regional projects",
      priceRange: "Price on application",
      priceApproved: false,
      marginPriority: "high",
      seasonality: "Steady winter weekday trade",
      locations: ["Millbrook"],
      requiredDisclaimer: undefined,
      restrictions: "Do not publish rates — quote only",
      active: true,
      createdAt: t,
      updatedAt: t,
    },
  ];

  const localProfiles: LocalAreaProfile[] = [
    {
      companyId: "c_iga_millbrook",
      suburbs: ["Millbrook", "Riverstone East", "Kurrajong Heights"],
      demographics:
        "Established families and downsizing seniors; median age 41; strong loyalty to local businesses.",
      commonNeeds:
        "Weekly shop convenience, quality meat and fresh produce, school lunch staples, delivery for seniors.",
      competitors: ["Coles Riverstone (15 min)", "Woolworths Metro Kurrajong", "Local farmers market (Sat)"],
      localEvents:
        "Millbrook Magpies home games (winter Saturdays), school fetes each term, Wattle Valley food festival (October).",
      seasonalPatterns:
        "Winter: soup vegetables, slow-cooking cuts, bakery. Summer: BBQ, salads, drinks. Catalogue weeks starting Wednesday.",
      searchTerms: ["iga millbrook", "grocery delivery millbrook", "butcher near me", "click and collect groceries"],
      buyingTriggers:
        "Weekly catalogue drop, school events, footy season catering, cold snaps driving comfort-food shops.",
      updatedAt: t,
    },
    {
      companyId: "c_motel",
      suburbs: ["Millbrook", "Highway 31 corridor", "Wattle Valley"],
      demographics:
        "Road travellers, tradie crews on weekly stays, families visiting for sport, wine-region weekenders.",
      commonNeeds:
        "Clean comfortable rooms, parking for trailers, pet-friendly options, easy direct booking.",
      competitors: ["Highway Inn (budget)", "Wattle Valley B&Bs", "OTA listings taking 15% commission"],
      localEvents:
        "School-holiday periods, regional sports carnivals, wine region festivals (autumn), highway trade year-round.",
      seasonalPatterns:
        "School holidays fill family rooms; winter weekdays are tradie crews; wine-region weekends peak in autumn.",
      searchTerms: ["motel millbrook", "pet friendly motel wattle valley", "family accommodation millbrook"],
      buyingTriggers:
        "School holidays, sports fixtures, wildlife park visits, cellar-door weekends.",
      updatedAt: t,
    },
  ];

  // ---- Phase 3: Governance seeds ----------------------------------------------

  const consents: ConsentRecord[] = [
    {
      id: "cons_dave",
      companyId: "c_iga_millbrook",
      personShown: "Dave Kowalski (butcher, staff member)",
      consentObtained: true,
      documentName: "staff-media-consent-dave-2026.pdf",
      permittedChannels: ["Facebook", "Instagram", "In-store"],
      expiryDate: "2027-01-31",
      restrictions: "Work context only",
      approvedById: "u_priya",
      withdrawn: false,
      createdAt: t,
    },
    {
      id: "cons_singh",
      companyId: "c_motel",
      personShown: "R. Singh (guest testimonial)",
      consentObtained: true,
      documentName: "guest-testimonial-consent-singh.pdf",
      permittedChannels: ["Website"],
      expiryDate: "2026-12-31",
      restrictions: "Testimonial text only, no photos",
      approvedById: "u_admin",
      withdrawn: true, // withdrawn — any use must now be blocked
      createdAt: t,
    },
    {
      id: "cons_motel_guest",
      companyId: "c_motel",
      personShown: "Poolside guest photo (adults, non-identifying)",
      consentObtained: true,
      documentName: "guest-photo-release-pool.pdf",
      permittedChannels: ["Website"],
      restrictions: "Website only; no paid promotion",
      approvedById: "u_deb",
      withdrawn: false,
      createdAt: t,
    },
  ];

  const evidence: EvidenceRecord[] = [
    {
      id: "ev_iga_pricing",
      companyId: "c_iga_millbrook",
      title: "Weekly catalogue pricing — current week",
      evidenceType: "pricing",
      detail:
        "Signed-off catalogue price file for the current Wed–Tue week, including $10-off first click & collect order over $100.",
      documentName: "catalogue-week-pricing.xlsx",
      validUntil: "2026-08-31",
      createdById: "u_priya",
      createdAt: t,
    },
    {
      id: "ev_iga_suppliers",
      companyId: "c_iga_millbrook",
      title: "Local supplier register 2009–2026",
      evidenceType: "other",
      detail: "Register of Wattle Valley growers and suppliers stocked since 2009.",
      createdById: "u_priya",
      createdAt: t,
    },
    {
      id: "ev_iga_rewards",
      companyId: "c_iga_millbrook",
      title: "Community rewards program terms",
      evidenceType: "other",
      detail: "Program terms confirming 1% of member purchases returned to local schools and clubs.",
      documentName: "community-rewards-terms.pdf",
      createdById: "u_priya",
      createdAt: t,
    },
    {
      id: "ev_motel_rating",
      companyId: "c_motel",
      title: "3.5-star rating certificate",
      evidenceType: "certification",
      detail: "Current independent star-rating certificate for Golden Wattle Motel.",
      documentName: "star-rating-certificate.pdf",
      validUntil: "2027-06-30",
      createdById: "u_deb",
      createdAt: t,
    },
    {
      id: "ev_motel_direct",
      companyId: "c_motel",
      title: "Direct vs OTA rate comparison",
      evidenceType: "comparison",
      detail:
        "Rate sheet showing direct bookings are never dearer than OTA listings and carry no booking fee.",
      documentName: "direct-rate-comparison.xlsx",
      validUntil: "2026-09-30",
      createdById: "u_deb",
      createdAt: t,
    },
  ];

  const claims: ApprovedClaim[] = [
    {
      id: "clm_iga_local",
      companyId: "c_iga_millbrook",
      claimText: "Locally owned & operated",
      evidenceId: "ev_iga_suppliers",
      allowedChannels: [],
      active: true,
      createdAt: t,
    },
    {
      id: "clm_iga_growers",
      companyId: "c_iga_millbrook",
      claimText: "Supporting local growers and suppliers since 2009",
      evidenceId: "ev_iga_suppliers",
      allowedChannels: [],
      active: true,
      createdAt: t,
    },
    {
      id: "clm_iga_rewards",
      companyId: "c_iga_millbrook",
      claimText: "Community rewards — 1% back to local schools & clubs",
      evidenceId: "ev_iga_rewards",
      allowedChannels: [],
      active: true,
      createdAt: t,
    },
    {
      id: "clm_motel_direct",
      companyId: "c_motel",
      claimText: "Book direct for the best rate — no booking fees",
      evidenceId: "ev_motel_direct",
      allowedChannels: [],
      active: true,
      createdAt: t,
    },
    {
      id: "clm_motel_wifi",
      companyId: "c_motel",
      claimText: "Free Wi-Fi and onsite parking",
      evidenceId: null,
      allowedChannels: [],
      active: true,
      createdAt: t,
    },
  ];

  const responses: ApprovedResponse[] = [
    {
      id: "resp_thanks",
      tenantId: null, // platform library
      companyId: null,
      category: "compliment_thanks",
      title: "Thanks for a compliment",
      responseText:
        "Thank you so much for the kind words! The whole {company} team really appreciates it — we'll pass it on. 🙌",
      active: true,
      createdAt: t,
    },
    {
      id: "resp_complaint",
      tenantId: null, // platform library
      companyId: null,
      category: "complaint_acknowledgement",
      title: "Complaint acknowledgement (no liability)",
      responseText:
        "We're really sorry to hear about your experience — that's not the standard we aim for at {company}. Could you please send us a private message with your details so we can look into it straight away?",
      active: true,
      createdAt: t,
    },
    {
      id: "resp_review",
      tenantId: null, // platform library
      companyId: null,
      category: "review_response",
      title: "Negative review response",
      responseText:
        "Thank you for taking the time to leave feedback. We'd like to understand what happened and make it right — please contact us directly at {company} so we can follow up personally.",
      active: true,
      createdAt: t,
    },
    {
      id: "resp_iga_pricing",
      tenantId: "t_wattle",
      companyId: "c_iga_millbrook",
      category: "pricing_reply",
      title: "Catalogue pricing enquiry",
      responseText:
        "Great question! Our specials change every Wednesday — you'll find the current catalogue on our website and in store. Specials available while stocks last.",
      active: true,
      createdAt: t,
    },
    {
      id: "resp_motel_booking",
      tenantId: "t_wattle",
      companyId: "c_motel",
      category: "booking_reply",
      title: "Booking enquiry",
      responseText:
        "Thanks for getting in touch! We'd love to have you — the best rates are always booking direct. Give us a call on 03 5550 1234 or send us a message and we'll sort your dates.",
      active: true,
      createdAt: t,
    },
  ];

  // ---- Phase 4: Offer & Promotion Manager seeds --------------------------------

  const offers: Offer[] = [
    {
      id: "off_iga_cc",
      companyId: "c_iga_millbrook",
      name: "$10 off first click & collect order",
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      terms: "First online order over $100, one per customer.",
      exclusions: "Tobacco, gift cards.",
      approvedWording:
        "Get $10 off your first click & collect order over $100 — order online, collect in two hours.",
      requiredDisclaimer: "Specials available while stocks last.",
      channelsAllowed: [],
      status: "approved",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "off_westgate_combo",
      companyId: "c_iga_westgate",
      name: "Coffee + breakfast wrap combo $9",
      startDate: "2026-06-01",
      endDate: undefined, // standing offer
      terms: "Before 9am, weekdays.",
      approvedWording:
        "Beat the morning rush: barista coffee + breakfast wrap for just $9 before 9am.",
      channelsAllowed: [],
      status: "approved",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "off_motel_stay2",
      companyId: "c_motel",
      name: "Stay 2 nights, save 15%",
      startDate: "2026-06-01",
      endDate: "2026-09-30",
      terms: "Direct bookings only. Subject to availability.",
      exclusions: "Not valid with other offers or long-weekend peak dates.",
      approvedWording:
        "Stay 2 nights and save 15% — direct bookings only, never dearer than the booking sites.",
      requiredDisclaimer: "Rates subject to availability.",
      channelsAllowed: [],
      status: "approved",
      createdAt: t,
      updatedAt: t,
    },
  ];

  // ---- Phase 11: Creative Asset System seeds ----------------------------------

  const assets: Asset[] = [
    {
      id: "as_iga_logo",
      companyId: "c_iga_millbrook",
      folder: "Brand",
      name: "Millbrook IGA logo (primary)",
      description: "Primary colour logo, transparent PNG. Use on all channels.",
      assetType: "logo",
      source: "upload",
      fileName: "millbrook-iga-logo.png",
      mimeType: "image/png",
      sizeBytes: 84213,
      tags: ["logo", "brand", "evergreen"],
      usageRights: {
        owner: "Millbrook Supermarkets Pty Ltd",
        licenceType: "owned",
        consentObtained: true,
        allowedChannels: [], // all channels
      },
      status: "approved",
      createdById: "u_priya",
      approvedById: "u_admin",
      approvedAt: t,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "as_iga_butcher",
      companyId: "c_iga_millbrook",
      folder: "Store photos",
      name: "Dave at the butcher counter",
      description:
        "Hero shot of Dave the butcher with slow-cooking cuts. Staff member shown — consent on file.",
      assetType: "image",
      source: "upload",
      fileName: "dave-butcher-counter.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 2213888,
      tags: ["butcher", "staff", "winter", "hero"],
      usageRights: {
        owner: "Millbrook IGA",
        licenceType: "owned",
        consentObtained: true,
        consentRef: "cons_dave",
        // Matches Dave's media-consent channels (Facebook/Instagram/In-store).
        allowedChannels: ["Facebook", "Instagram", "In-store"],
        expiryDate: "2027-01-31", // mirrors the staff consent expiry
        restrictions: "Work context only",
      },
      status: "approved",
      createdById: "u_priya",
      approvedById: "u_admin",
      approvedAt: t,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "as_iga_stock_soup",
      companyId: "c_iga_millbrook",
      folder: "Stock",
      name: "Winter soup flatlay (stock)",
      description:
        "Licensed stock image of a winter soup spread. Stock licence expired 30 Jun 2026.",
      assetType: "image",
      source: "stock",
      externalRef: "stock:istock/1284419",
      fileName: "winter-soup-flatlay.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1740000,
      tags: ["winter", "soup", "stock"],
      usageRights: {
        owner: "iStock",
        licenceType: "licensed",
        licenceRef: "iStock standard licence #1284419",
        consentObtained: true,
        allowedChannels: [],
        expiryDate: "2026-06-30", // EXPIRED relative to seed "today" — blocks use
      },
      status: "approved",
      createdById: "u_priya",
      approvedById: "u_admin",
      approvedAt: t,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "as_motel_family",
      companyId: "c_motel",
      folder: "Rooms",
      name: "Family room — made up",
      description: "Wide shot of a family room, beds made, curtains open.",
      assetType: "image",
      source: "upload",
      fileName: "family-room-wide.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1980000,
      tags: ["family-room", "rooms", "hero"],
      usageRights: {
        owner: "Golden Wattle Hospitality Pty Ltd",
        licenceType: "owned",
        consentObtained: true,
        allowedChannels: [], // all channels
      },
      status: "approved",
      createdById: "u_deb",
      approvedById: "u_admin",
      approvedAt: t,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "as_motel_ugc",
      companyId: "c_motel",
      folder: "Guest photos",
      name: "Guest holiday snap (UGC)",
      description:
        "Guest-supplied photo by the pool. Consent given for WEBSITE use only.",
      assetType: "image",
      source: "upload",
      fileName: "guest-poolside.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1440000,
      tags: ["ugc", "guests", "summer"],
      usageRights: {
        owner: "Golden Wattle Motel (guest release)",
        licenceType: "user_generated",
        consentObtained: true,
        consentRef: "cons_motel_guest", // valid Consent Register record (Website only)
        allowedChannels: ["Website"], // NOT cleared for social — blocks Facebook/Instagram
        restrictions: "Website only; no paid promotion",
      },
      status: "approved",
      createdById: "u_deb",
      approvedById: "u_admin",
      approvedAt: t,
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "as_motel_draft_video",
      companyId: "c_motel",
      folder: "Video",
      name: "Wattle Valley 20s promo (draft)",
      description:
        "Draft highway-to-wine-region promo video. Awaiting music-licence confirmation.",
      assetType: "video",
      source: "canva",
      externalRef: "https://canva.com/design/DAF-golden-wattle-promo/edit",
      fileName: "wattle-valley-promo-20s.mp4",
      mimeType: "video/mp4",
      sizeBytes: 18400000,
      tags: ["video", "promo", "wine-region"],
      usageRights: {
        owner: "Golden Wattle Hospitality Pty Ltd",
        licenceType: "owned",
        consentObtained: false, // music licence unconfirmed
        allowedChannels: [],
        restrictions: "Confirm background-music licence before publishing",
      },
      status: "draft",
      createdById: "u_deb",
      createdAt: t,
      updatedAt: t,
    },
  ];

  const brandTemplates: BrandTemplate[] = [
    {
      // PLATFORM library (owner decision 1): curated by the platform admin,
      // visible read-only to EVERY tenant.
      id: "bt_platform_promo",
      tenantId: null,
      companyId: null,
      name: "Clean square promo (platform)",
      kind: "social_post",
      description:
        "Neutral 1080×1080 promo layout: bold headline band, single image, CTA chip. Works for any brand.",
      dimensions: "1080x1080",
      source: "canva",
      externalRef: "https://canva.com/platform/clean-square-promo/template",
      spec: "Safe margins 72px. Headline ≤ 7 words. Swap brand colours per tenant.",
      active: true,
      createdById: "u_admin", // platform admin
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "bt_square_social",
      tenantId: "t_wattle", // tenant-wide
      companyId: null,
      name: "Square social post — Wattle brand",
      kind: "social_post",
      description:
        "1080×1080 square post: logo top-left, headline band, single hero image, CTA chip bottom-right.",
      dimensions: "1080x1080",
      source: "canva",
      externalRef: "https://canva.com/brand/wattle-square-social/template",
      spec: "Safe margins 80px. Headline ≤ 6 words. Brand colours only. Logo mandatory. One approved hero image.",
      active: true,
      createdById: "u_admin",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "bt_iga_specials_story",
      tenantId: "t_wattle",
      companyId: "c_iga_millbrook",
      name: "Weekly specials story (9:16)",
      kind: "story",
      description:
        "Vertical story for the Wednesday catalogue drop: price tiles over a produce photo, swipe-up to click & collect.",
      dimensions: "1080x1920",
      source: "figma",
      externalRef: "figma:file/iga-specials-story",
      spec: "Up to 3 price tiles. Include 'Specials available while stocks last.' disclaimer. Approved catalogue pricing only.",
      active: true,
      createdById: "u_priya",
      createdAt: t,
      updatedAt: t,
    },
  ];

  return {
    tenants,
    tenantMembers,
    users,
    access,
    sessions: [],
    companies,
    requests,
    content: [],
    socialResponses: [],
    socialMentions: [
      {
        id: "sm_1",
        companyId: "c_iga_millbrook",
        platform: "Facebook",
        externalId: "fb_c_88213",
        authorName: "Rita Alvarez",
        text: "Do you have the winter soup vegetable bundle in stock this week? Loved it last year!",
        receivedAt: "2026-07-04T22:10:00.000Z",
        status: "new",
        createdAt: "2026-07-04T22:10:00.000Z",
      },
      {
        id: "sm_2",
        companyId: "c_iga_millbrook",
        platform: "Instagram",
        externalId: "ig_c_44510",
        authorName: "@localfoodie",
        text: "Waited 20 minutes at the deli counter today and no one served me. Not good enough.",
        receivedAt: "2026-07-05T01:30:00.000Z",
        status: "new",
        createdAt: "2026-07-05T01:30:00.000Z",
      },
      {
        id: "sm_3",
        companyId: "c_motel",
        platform: "Facebook",
        externalId: "fb_c_77102",
        authorName: "Greg Tan",
        text: "Are family rooms available for the school holidays in late September? Two adults, three kids.",
        receivedAt: "2026-07-05T03:05:00.000Z",
        status: "new",
        createdAt: "2026-07-05T03:05:00.000Z",
      },
    ],
    companyReviews: [],
    reviewRequestCampaigns: [],
    contentComments: [],
    knowledgeDocs,
    services,
    localProfiles,
    gaps: [],
    consents,
    evidence,
    claims,
    responses,
    aiRuns: [],
    campaigns: [],
    campaignItems: [],
    offers,
    promptTemplates: [
      {
        id: "pt_weekly_specials",
        tenantId: "t_wattle",
        companyId: "c_iga_millbrook",
        name: "Weekly specials post (Wed catalogue drop)",
        contentType: "social_post",
        topic: "This week's catalogue specials are live",
        objective:
          "Drive weekly-shop traffic when the new Wed–Tue catalogue drops",
        audience: "Local families planning the weekly shop",
        channel: "Facebook",
        tone: "friendly",
        active: true,
        createdById: "u_priya",
        createdAt: t,
      },
      {
        id: "pt_bright_monthly",
        tenantId: "t_bright",
        companyId: null,
        name: "Monthly client newsletter",
        contentType: "email_newsletter",
        topic: "Your monthly update from us",
        objective: "Re-engage clients with approved offers and local news only",
        audience: "Past customers and email subscribers",
        channel: "Email",
        tone: "friendly",
        active: true,
        createdById: "u_sasha",
        createdAt: t,
      },
      {
        id: "pt_bright_social",
        tenantId: "t_bright",
        companyId: null,
        name: "Social proof spotlight",
        contentType: "social_post",
        topic: "Customer success story (consent required)",
        objective: "Build trust with a real client outcome — no performance claims",
        audience: "Prospective customers in the service area",
        channel: "Instagram",
        tone: "professional",
        active: true,
        createdById: "u_sasha",
        createdAt: t,
      },
    ],
    scheduledPosts: [],
    integrations: [
      {
        id: "int_iga_fb",
        companyId: "c_iga_millbrook",
        platform: "Facebook",
        accountName: "Millbrook IGA Facebook Page",
        encryptedToken: encryptToken("demo-oauth-token-millbrook-fb-4821"),
        tokenLastFour: "4821",
        status: "connected",
        connectedById: "u_admin",
        connectedAt: t,
        updatedAt: t,
      },
      {
        id: "int_motel_fb",
        companyId: "c_motel",
        platform: "Facebook",
        accountName: "Golden Wattle Motel Page",
        encryptedToken: encryptToken("demo-oauth-token-motel-fb-9377"),
        tokenLastFour: "9377",
        status: "connected",
        connectedById: "u_admin",
        connectedAt: t,
        updatedAt: t,
      },
    ],
    connectInvites: [],
    apiKeys: [],
    partnerWebhooks: [],
    publishLogs: [],
    publishingControls: tenants.map((tn) => ({
      tenantId: tn.id,
      freezeAll: false,
      automatedPublishingDisabled: false,
      socialRepliesDisabled: false,
      frozenCompanyIds: [],
      frozenPlatforms: [],
      frozenCampaignIds: [],
    })),
    utmLinks: [
      {
        id: "utm_iga_cc",
        companyId: "c_iga_millbrook",
        destinationUrl: "https://millbrookiga.example/click-collect",
        source: "facebook",
        medium: "social",
        campaign: "winter-warmers",
        contentType: "social_post",
        campaignId: null,
        contentId: null,
        requestId: "r_1001",
        createdById: "u_priya",
        createdAt: t,
      },
    ],
    // Module 6: Paid advertising — a seeded delegated Meta ad account, a budget
    // and a live campaign for Millbrook IGA so the demo shows the unified
    // dashboard + AI allocation with data (all metrics simulated by id).
    adAccounts: [
      {
        id: "ad_iga_meta",
        companyId: "c_iga_millbrook",
        platform: "meta_ads",
        accountName: "Millbrook IGA — Meta Ads",
        externalAccountId: "act_5567891234",
        encryptedToken: encryptToken("demo-delegated-ads-token-iga-meta"),
        tokenLastFour: "meta",
        status: "connected",
        connectedById: "u_priya",
        connectedAt: t,
        updatedAt: t,
      },
    ],
    adBudgets: [
      {
        companyId: "c_iga_millbrook",
        monthlyBudgetUsd: 1500,
        allocation: { meta_ads: 0.6, google_ads: 0.4 },
        feeModel: "percent_of_spend",
        feePercent: 0.15,
        feeFlatUsd: 0,
        updatedById: "u_priya",
        updatedAt: t,
      },
    ],
    audienceSegments: [
      {
        id: "aud_iga_local",
        companyId: "c_iga_millbrook",
        name: "Local shoppers — 8km",
        platform: "all",
        targeting: {
          locations: [{ kind: "radius", value: "Millbrook VIC", radiusKm: 8 }],
          ageMin: 25,
          ageMax: 65,
          gender: "all",
          languages: ["English"],
          interests: ["Grocery shopping", "Home cooking", "Local deals"],
          customAudiences: [],
          exclusions: [],
          devices: "all",
          placements: [],
        },
        createdById: "u_priya",
        createdAt: t,
        updatedAt: t,
      },
    ],
    adCampaigns: [
      {
        id: "adc_iga_winter",
        companyId: "c_iga_millbrook",
        adAccountId: "ad_iga_meta",
        platform: "meta_ads",
        name: "Winter Warmers — lead gen",
        objective: "leads",
        dailyBudgetUsd: 30,
        status: "active",
        startDate: "2026-06-15",
        audienceSegmentId: "aud_iga_local",
        createdById: "u_priya",
        createdAt: t,
        updatedAt: t,
      },
    ],
    leads: [
      {
        id: "lead_iga_1",
        companyId: "c_iga_millbrook",
        platform: "meta_ads",
        adCampaignId: "adc_iga_winter",
        contact: "J. Nguyen",
        source: "meta_lead_ad",
        valueUsd: 32,
        status: "qualified",
        capturedAt: t,
      },
    ],
    emailTemplates: [
      {
        id: "etpl_motel_news",
        companyId: "c_motel",
        name: "Midweek escape newsletter",
        kind: "newsletter",
        subject: "Midweek rates from {{company}}",
        htmlBody: "<p>Hi {{name}} — midweek at <strong>{{company}}</strong>. <a href=\"{{unsubscribeUrl}}\">Unsubscribe</a></p>",
        active: true,
        createdById: "u_deb",
        createdAt: t,
        updatedAt: t,
      },
    ],
    emailSubscribers: [
      { id: "esub_motel_ok", companyId: "c_motel", email: "guest.return@example.com", name: "Sam Lee", tags: ["newsletter"], marketingConsent: true, createdAt: t, updatedAt: t },
      { id: "esub_motel_no_consent", companyId: "c_motel", email: "walkin@example.com", tags: ["newsletter"], marketingConsent: false, createdAt: t, updatedAt: t },
      { id: "esub_motel_unsub", companyId: "c_motel", email: "optout@example.com", tags: ["newsletter"], marketingConsent: true, unsubscribedAt: "2026-06-20T00:00:00.000Z", createdAt: t, updatedAt: t },
    ],
    emailCampaigns: [
      {
        id: "ecmp_motel_draft",
        companyId: "c_motel",
        templateId: "etpl_motel_news",
        name: "July midweek push",
        subject: "Midweek rates from Golden Wattle Motel",
        status: "draft",
        segmentTag: "newsletter",
        stats: { recipients: 0, sent: 0, failed: 0, opens: 0, clicks: 0, unsubscribes: 0, bounces: 0 },
        createdById: "u_deb",
        createdAt: t,
        updatedAt: t,
      },
    ],

    crmContacts: [],
    crmSegments: [],
    crmInteractions: [],
    funnelJourneys: [],
    conversionFunnels: [],
    funnelLandingPages: [],
    funnelAbExperiments: [],
    campaignExperiments: [],
    smsSubscribers: [],
    smsCampaigns: [],
    smsCompanySettings: [],
    marketingWorkflows: [],
    marketingWorkflowSettings: [],
    workflowDispatchLogs: [],
    cmsPages: [
      {
        id: "cmsp_motel_home",
        companyId: "c_motel",
        slug: "book-direct",
        title: "Book direct & save",
        kind: "landing",
        status: "approved",
        currentVersionId: "cmsv_motel_home_1",
        createdById: "u_deb",
        createdAt: t,
        updatedAt: t,
      },
    ],
    cmsPageVersions: [
      {
        id: "cmsv_motel_home_1",
        pageId: "cmsp_motel_home",
        companyId: "c_motel",
        versionNumber: 1,
        title: "Book direct & save",
        bodyHtml: "<h1>Book direct</h1><p>Best rate guaranteed at Golden Wattle Motel.</p>",
        changeSummary: "Initial landing page",
        status: "approved",
        createdById: "u_deb",
        createdAt: t,
        approvedById: "u_admin",
        approvedAt: t,
      },
    ],
    cmsSeoMetadata: [
      {
        id: "cmss_motel_home",
        pageId: "cmsp_motel_home",
        companyId: "c_motel",
        metaTitle: "Book direct & save | Golden Wattle Motel",
        metaDescription: "Reserve your stay at Golden Wattle Motel with our best online rate.",
        ogTitle: "Book direct & save",
        ogDescription: "Golden Wattle Motel — book direct for the best rate.",
        noIndex: false,
        createdAt: t,
        updatedAt: t,
      },
    ],
    cmsUpdateRequests: [
      {
        id: "cmsr_motel_hero",
        companyId: "c_motel",
        pageId: "cmsp_motel_home",
        title: "Refresh winter hero",
        description: "Update hero image and headline for winter campaign.",
        status: "open",
        requestedById: "u_deb",
        createdAt: t,
        updatedAt: t,
      },
    ],
    ragKnowledgeSources: [],
    ragKnowledgeVersions: [],
    campaignPlanVersions: [],
    campaignBuilderRuns: [],
    campaignDraftScheduleItems: [],
    loyaltyPrograms: [],
    loyaltyTiers: [],
    loyaltyMembers: [],
    loyaltyCoupons: [],
    loyaltyReferrals: [],
    loyaltyRedemptions: [],

    // Module 3 demo:
    // add-ons enabled, proving per-company entitlements. Other companies have none
    // (so the matrix shows a mix). Demo mode → enabled directly (no Stripe sub).
    companyEntitlements: [
      { id: "ent_cafe_menus", companyId: "c_cafe", addonId: "menus", status: "active", enabledById: "u_priya", enabledAt: t, updatedAt: t },
      { id: "ent_cafe_order", companyId: "c_cafe", addonId: "order_button", status: "active", enabledById: "u_priya", enabledAt: t, updatedAt: t },
      { id: "ent_cafe_bookings", companyId: "c_cafe", addonId: "bookings", status: "active", enabledById: "u_priya", enabledAt: t, updatedAt: t },
      { id: "ent_cafe_video", companyId: "c_cafe", addonId: "video", status: "active", enabledById: "u_priya", enabledAt: t, updatedAt: t },
      { id: "ent_cafe_photo", companyId: "c_cafe", addonId: "photo", status: "active", enabledById: "u_priya", enabledAt: t, updatedAt: t },
    ],
    photoShoots: [
      {
        id: "ps_cafe_winter",
        companyId: "c_cafe",
        brief: "Winter warmers menu hero shots — latte art, pastries, cosy interior.",
        location: "Millbrook Café, main dining room",
        scheduledAt: "2026-07-15T09:00:00.000Z",
        status: "scheduled",
        deliverableAssetIds: [],
        targetChannels: ["instagram", "facebook"],
        createdById: "u_priya",
        createdAt: t,
        updatedAt: t,
      },
    ],
    photographerProfiles: [
      {
        id: "ph_platform_lens",
        tenantId: null,
        name: "Lens & Ladle Co.",
        bio: "Platform marketplace — food, hospitality, and retail product photography across Australia.",
        specialty: ["food", "hospitality", "product"],
        serviceArea: "Australia-wide (travel fees may apply)",
        stripeConnectAccountId: "acct_demo_lens",
        connectStatus: "active",
        active: true,
        createdAt: t,
        updatedAt: t,
      },
      {
        id: "ph_brightspark_jade",
        tenantId: "t_brightspark",
        name: "Jade Morrison Photography",
        bio: "BrightSpark preferred supplier — lifestyle + venue shoots for agency clients.",
        specialty: ["lifestyle", "venue", "events"],
        serviceArea: "Greater Sydney",
        stripeConnectAccountId: "acct_demo_jade",
        connectStatus: "active",
        active: true,
        createdAt: t,
        updatedAt: t,
      },
    ],
    photographerPackages: [
      {
        id: "pkg_lens_food",
        photographerId: "ph_platform_lens",
        title: "Food & menu hero (2 hr)",
        description: "Up to 15 edited hero shots for menus and social.",
        durationMinutes: 120,
        priceCents: 89000,
        includes: ["On-site shoot", "15 edited images", "Commercial licence"],
        active: true,
        createdAt: t,
        updatedAt: t,
      },
      {
        id: "pkg_lens_product",
        photographerId: "ph_platform_lens",
        title: "Product packshot (1 hr)",
        description: "White-background product shots for e-commerce.",
        durationMinutes: 60,
        priceCents: 45000,
        includes: ["Studio or on-site", "10 packshots", "Web-ready exports"],
        active: true,
        createdAt: t,
        updatedAt: t,
      },
      {
        id: "pkg_jade_venue",
        photographerId: "ph_brightspark_jade",
        title: "Venue lifestyle (3 hr)",
        description: "Atmospheric venue + team portraits for hospitality clients.",
        durationMinutes: 180,
        priceCents: 120000,
        includes: ["Venue walk-through", "25 edited images", "Social crops"],
        active: true,
        createdAt: t,
        updatedAt: t,
      },
    ],
    photoMarketplaceBookings: [],
    menuDesigns: [
      {
        id: "md_cafe_winter",
        companyId: "c_cafe",
        title: "Winter warmers lunch menu",
        brief: "Seasonal lunch menu — soups, toasties, hot drinks. A4 print + QR digital.",
        format: "both",
        status: "in_design",
        billingClass: "included",
        quotaYear: 2026,
        deliverableAssetIds: [],
        createdById: "u_priya",
        createdAt: t,
        updatedAt: t,
      },
    ],
    orderMenuItems: [
      { id: "omi_latte", companyId: "c_cafe", name: "Flat white", description: "Double shot, velvety milk", priceCents: 550, category: "Coffee", available: true, sortOrder: 1, createdAt: t, updatedAt: t },
      { id: "omi_toastie", companyId: "c_cafe", name: "Cheese & tomato toastie", description: "Sourdough, gruyère, house relish", priceCents: 1200, category: "Food", available: true, sortOrder: 2, createdAt: t, updatedAt: t },
      { id: "omi_soup", companyId: "c_cafe", name: "Soup of the day", description: "Ask your server — always vegetarian option", priceCents: 950, category: "Food", available: true, sortOrder: 3, createdAt: t, updatedAt: t },
    ],
    orderingSettings: [
      {
        companyId: "c_cafe",
        pickupEnabled: true,
        deliveryEnabled: false,
        minOrderCents: 500,
        buttonLabel: "Order Now",
        stripeConnectAccountId: "acct_demo_cafe",
        connectStatus: "active",
        updatedAt: t,
      },
    ],
    restaurantOrders: [
      {
        id: "ro_cafe_1",
        companyId: "c_cafe",
        status: "preparing",
        fulfillment: "pickup",
        customerName: "Sam Lee",
        customerEmail: "sam@example.com",
        customerPhone: "0400 000 111",
        lines: [
          { menuItemId: "omi_latte", name: "Flat white", priceCents: 550, quantity: 2 },
          { menuItemId: "omi_toastie", name: "Cheese & tomato toastie", priceCents: 1200, quantity: 1 },
        ],
        subtotalCents: 2300,
        totalCents: 2300,
        paymentStatus: "simulated",
        createdAt: t,
        updatedAt: t,
      },
    ],
    bookingServicePeriods: [
      {
        id: "sp_cafe_lunch",
        companyId: "c_cafe",
        name: "Weekday lunch",
        dayOfWeek: 1,
        startTime: "11:30",
        endTime: "14:00",
        capacity: 24,
        slotMinutes: 30,
        active: true,
        createdAt: t,
        updatedAt: t,
      },
    ],
    bookingSettings: [
      {
        companyId: "c_cafe",
        venueKind: "restaurant",
        enabled: true,
        buttonLabel: "Book a table",
        leadTimeHours: 1,
        maxPartySize: 8,
        updatedAt: t,
      },
    ],
    reservations: [
      {
        id: "res_cafe_1",
        companyId: "c_cafe",
        servicePeriodId: "sp_cafe_lunch",
        status: "confirmed",
        guestName: "Jordan Kim",
        guestEmail: "jordan@example.com",
        guestPhone: "0400 111 222",
        partySize: 4,
        scheduledAt: new Date(Date.now() + 86400000).toISOString().slice(0, 11) + "12:00:00.000Z",
        confirmationMode: "simulated",
        createdAt: t,
        updatedAt: t,
      },
    ],
    recommendations: [],
    recommendationDismissHistory: [],
    learningHypotheses: [],
    learningLessons: [],
    approvalPolicies: [],
    aiPromptVersions: [],
    aiOrchestrationRuns: [],
    aiCampaignRecommendations: [],
    campaignPerformanceSnapshots: [],
    privacyRequests: [],
    managedDeliveryRuns: [],
    companyCreditWallets: [
      {
        id: "cw_dental",
        tenantId: "t_bright",
        companyId: "c_dental",
        balanceUsd: 200,
        minFloorUsd: 50,
        autoTopUpEnabled: false,
        topUpTriggerBalanceUsd: 50,
        topUpAmountUsd: 100,
        maxTopUpAmountUsd: 500,
        maxTopUpPerDay: 3,
        createdAt: t,
        updatedAt: t,
      },
      {
        id: "cw_florist",
        tenantId: "t_bright",
        companyId: "c_florist",
        balanceUsd: 0,
        minFloorUsd: 50,
        autoTopUpEnabled: false,
        topUpTriggerBalanceUsd: 50,
        topUpAmountUsd: 100,
        maxTopUpAmountUsd: 500,
        maxTopUpPerDay: 3,
        createdAt: t,
        updatedAt: t,
      },
    ],
    companyCreditLedger: [],
    tasks: [],
    aiMosOpportunities: [],
    aiMosSignalRuns: [],
    calendarAssistSuggestions: [],
    security: tenants.map((tn) => ({
      tenantId: tn.id,
      crisisMode: false,
      sandboxMode: false,
      retentionDays: 730,
      aiMonthlyCapUsd: 50,
      updatedAt: t,
    })),
    legalHolds: [],
    assets,
    brandTemplates,
    automation: tenants.map((tn) => ({
      tenantId: tn.id,
      enabled: false,
      draftCampaignSuggestions: true,
      monthlyContentGeneration: true,
      analyticsSummaries: true,
      contentAlerts: true,
      lowRiskAutoResponses: false, // §40 — off by default
      maxCampaignsPerRun: 2,
      maxDraftsPerCompany: 2,
      updatedAt: t,
    })),
    automationRuns: [],
    // Terms & Conditions: one active version (v1). Seeded demo users have all
    // accepted it, so they aren't gated; a NEW signup (no acceptance) hits the
    // /accept-terms gate, and publishing v2 forces everyone to re-accept.
    termsVersions: [
      {
        id: "tv_1",
        version: 1,
        title: "Terms of Service",
        body:
          "These are the Marketing Command Centre Terms of Service. By using the " +
          "platform you agree to our acceptable-use, billing, data-protection and " +
          "liability terms. Ad spend on connected platforms is billed to your own " +
          "card by the platform; we charge only our subscription and any management " +
          "fee. See the full terms on the /terms page.",
        summary: "Initial terms.",
        effectiveDate: "2026-07-05",
        active: true,
        publishedById: "u_admin",
        publishedAt: t,
      },
    ],
    termsAcceptances: [
      ["u_admin", "t_wattle"],
      ["u_priya", "t_wattle"],
      ["u_tom", "t_wattle"],
      ["u_marco", "t_wattle"],
      ["u_deb", "t_wattle"],
      ["u_sasha", "t_bright"],
      ["u_liam", "t_bright"],
      ["u_jordan", "t_wattle"],
    ].map(([userId, tenantId]) => ({
      id: `ta_${userId}`,
      userId,
      tenantId,
      version: 1,
      acceptedAt: t,
    })),
    audit: [
      {
        id: "a_seed",
        action: "system.seeded",
        actorId: "u_admin",
        actorEmail: "admin@wattlegroup.dev",
        detail: "Initial demo data seeded (Wattle Group: IGA stores, motel, cafe)",
        createdAt: t,
      },
    ],
  };
}

const g = globalThis as unknown as {
  __ccStore?: DataStore;
  __ccPersistStarted?: boolean;
};

// ---- Dev persistence (devtool placeholder for the Supabase production path) --
//
// Set CC_STORE_FILE=<path> to make the in-memory store SURVIVE RESTARTS: the
// store hydrates from the file on first access and is snapshotted back every
// few seconds (plus on clean exit). This closes the "resets to seed on restart"
// gap for LOCAL / single-node dev + demos with zero external accounts.
//
// It is deliberately a DEV tool, not production: a file snapshot can't be shared
// across serverless instances. Production persistence is Supabase (the env-gated
// adapter). Leave CC_STORE_FILE unset for the classic reset-to-seed behaviour
// the verification workflow relies on.
const STORE_FILE = process.env.CC_STORE_FILE?.trim() || undefined;

function hydrateOrSeed(): DataStore {
  if (STORE_FILE) {
    try {
      const parsed = JSON.parse(readFileSync(STORE_FILE, "utf8")) as Partial<DataStore>;
      // Light shape check — a corrupt/stale snapshot falls back to a fresh seed.
      if (parsed && Array.isArray(parsed.tenants) && Array.isArray(parsed.users)) {
        // Normalise every top-level collection to an array: backfills keys
        // added since the snapshot (schema drift) AND coerces any present-but-
        // corrupt (non-array) value, so a partially-corrupt file can't crash a
        // later db().<coll>.filter(...) — every collection is an array or [].
        const template = seed();
        for (const k of Object.keys(template) as (keyof DataStore)[]) {
          if (!Array.isArray(parsed[k])) (parsed as Record<string, unknown>)[k] = [];
        }
        return parsed as DataStore;
      }
    } catch {
      /* missing / unreadable / corrupt → seed fresh */
    }
  }
  return seed();
}

function startPersistence(): void {
  if (!STORE_FILE || g.__ccPersistStarted) return;
  g.__ccPersistStarted = true;
  const flush = () => {
    try {
      const tmp = `${STORE_FILE}.tmp`;
      writeFileSync(tmp, JSON.stringify(g.__ccStore ?? {}));
      renameSync(tmp, STORE_FILE); // atomic-ish: never leave a half-written file
    } catch {
      /* best-effort dev persistence — never crash the app over a snapshot */
    }
  };
  const timer = setInterval(flush, 2000);
  timer.unref?.(); // don't keep the process alive just for snapshots
  process.once("beforeExit", flush);
}

export function db(): DataStore {
  if (!g.__ccStore) {
    g.__ccStore = hydrateOrSeed();
    startPersistence();
  }
  return g.__ccStore;
}

// Test/dev helper to reset state.
export function resetStore() {
  g.__ccStore = seed();
}
