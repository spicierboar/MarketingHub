import type { DataStore } from "@/lib/db/store";
import {
  STAGING_FIXTURE_KEY,
  STAGING_FIXTURE_TENANT_ID,
  createStagingAgencyFixture,
} from "@/lib/fixtures/staging-agency";
import { createStagingSalesFixture } from "@/lib/fixtures/staging-sales";
import { resetManagedContentJobMemory } from "@/lib/managed-content-jobs/repository";

const DAY = 86_400_000;
export const LOCAL_DEMO_RESET_ANCHOR_ISO =
  "2026-07-19T00:00:00.000Z" as const;

function addDays(anchor: number, days: number, hour = 9): string {
  const value = new Date(anchor + days * DAY);
  value.setUTCHours(hour, 0, 0, 0);
  return value.toISOString();
}

function dateAt(anchor: number, days: number): string {
  return addDays(anchor, days).slice(0, 10);
}

function quarterStart(anchor: number): string {
  const date = new Date(anchor);
  const month = Math.floor(date.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(date.getUTCFullYear(), month, 1)).toISOString().slice(0, 10);
}

function push<T>(target: T[], ...rows: T[]): void {
  target.push(...rows);
}

function fixtureBillingStatus(
  companyIndex: number,
): "active" | "past_due_grace" | "cancel_at_period_end" {
  if (companyIndex === 3) return "past_due_grace";
  if (companyIndex === 7) return "cancel_at_period_end";
  return "active";
}

/**
 * Loads the ten fictional Australian Indian restaurants into the local
 * in-memory store and adds linked, side-effect-free records for every major
 * product domain. IDs and dates are stable across every reset.
 */
export function extendLocalDemoSeed(store: DataStore): DataStore {
  const fixture = createStagingAgencyFixture();
  const anchor = Date.parse(LOCAL_DEMO_RESET_ANCHOR_ISO);
  const createdAt = addDays(anchor, -45);
  const admin = fixture.users.find((user) => user.fixtureRole === "Admin")!;
  const staff = fixture.users.find((user) => user.fixtureRole === "Staff")!;

  store.tenants.push(fixture.tenant);
  store.users.push(...fixture.users);
  store.tenantMembers.push(...fixture.memberships);
  store.companies.push(...fixture.companies);
  store.access.push(...fixture.access);

  const sales = createStagingSalesFixture();
  store.users.push(sales.salesUser, ...sales.approvers);
  store.tenantMembers.push(...sales.memberships);
  store.companies.push(...sales.companies);
  store.access.push(...sales.access);

  store.assets.push(
    ...fixture.assets.map((asset) =>
      asset.source === "upload"
        ? {
            ...asset,
            rightsConfirmedAt: createdAt,
            rightsConfirmationEmail: "rights-confirmed@staging-fixture.invalid",
          }
        : {
            ...asset,
            privateProvenance: {
              mode: "simulated",
              source: "synthetic fixture brief",
              generatedAt: createdAt,
              externalCalls: false,
            },
          },
    ),
  );
  store.adBudgets.push(...fixture.adBudgets);
  store.publishingControls.push({
    tenantId: fixture.tenant.id,
    freezeAll: false,
    automatedPublishingDisabled: true,
    socialRepliesDisabled: false,
    frozenCompanyIds: [],
    frozenPlatforms: [],
    frozenCampaignIds: [],
  });
  store.security.push({
    tenantId: fixture.tenant.id,
    crisisMode: false,
    sandboxMode: true,
    retentionDays: 730,
    aiMonthlyCapUsd: 25,
    updatedAt: createdAt,
    updatedById: admin.id,
  });
  store.automation.push({
    tenantId: fixture.tenant.id,
    enabled: false,
    draftCampaignSuggestions: true,
    monthlyContentGeneration: true,
    analyticsSummaries: true,
    contentAlerts: true,
    lowRiskAutoResponses: false,
    maxCampaignsPerRun: 2,
    maxDraftsPerCompany: 4,
    updatedAt: createdAt,
    updatedById: admin.id,
  });

  fixture.companies.forEach((company, index) => {
    const managedService = company.profile.managedService!;
    const slug = company.profile.stagingFixture.fixtureKey.split(":").at(-1)!;
    const approver = fixture.users.find(
      (user) => user.fixtureKey === `${STAGING_FIXTURE_KEY}:approver:${slug}`,
    )!;
    const packageId = managedService.marketingPackageId as
      | "starter"
      | "growth"
      | "managed";
    const serviceLevel = managedService.serviceLevel;
    const asset = fixture.assets.find(
      (item) => item.companyId === company.id && item.source === "upload",
    )!;
    const prefix = `demo-${String(index + 1).padStart(2, "0")}`;
    const campaignId = `${prefix}-campaign`;
    const conceptId = `${prefix}-concept`;
    const adaptationId = `${prefix}-adaptation`;
    const contentPendingId = `${prefix}-content-pending`;
    const contentPublishedId = `${prefix}-content-published`;
    const slotId = `${prefix}-slot`;
    const scheduledPostId = `${prefix}-post-scheduled`;
    const options = managedService.serviceOptions!;

    company.profile.managedService = {
      ...managedService,
      strategyDueAt: addDays(anchor, -40),
      strategyStartedAt: addDays(anchor, -44),
      strategyCompletedAt: addDays(anchor, -43),
      calendarCompletedAt: addDays(anchor, -42),
      implementationPlanEmailedAt: addDays(anchor, -42),
      lastDeliveryRunId: `${prefix}-delivery`,
      strategySummary: `A fictional quarterly plan for ${company.name}: build local discovery, turn menu interest into bookings, and maintain a reliable approval rhythm.`,
      strategyChannelPlan:
        "Instagram and Facebook for visual discovery; Google Business Profile for local intent; email for opted-in repeat diners. All activity remains simulated.",
      strategyPackageName: company.profile.stagingFixture.serviceTier,
      detailedStrategy: {
        id: `${prefix}-strategy-document`,
        version: 1,
        title: `${company.name} — fictional quarterly marketing strategy`,
        status: "approved",
        generatedAt: addDays(anchor, -43),
        model: "fixture-template/no-provider-call",
        packageName: company.profile.stagingFixture.serviceTier,
        executiveSummary: `TEST ONLY. A practical local growth plan focused on ${company.profile.stagingFixture.goals.join(" and ").toLowerCase()}.`,
        businessObjectives: company.profile.stagingFixture.goals,
        personas: [
          {
            name: "Local weeknight diner",
            demographics: `Fictional residents and workers near ${company.profile.stagingFixture.suburb}`,
            motivations: "Easy planning, clear menu information and a welcoming local venue",
            painPoints: "Unclear dietary options and difficulty choosing a midweek venue",
          },
        ],
        channels: [
          {
            channel: "Instagram",
            rationale: "Show menu detail and dining atmosphere using approved fixture assets.",
            tactics: ["Weekly menu story", "Chef-note carousel", "Booking reminder"],
          },
          {
            channel: "Google Business Profile",
            rationale: "Support high-intent local discovery without implying a live connector.",
            tactics: ["Simulated weekly update", "Menu highlight", "Review response draft"],
          },
        ],
        roadmap: [
          {
            key: "30",
            title: "Establish cadence",
            objectives: ["Confirm baseline", "Publish consistently"],
            activities: ["Complete 30-day plan", "Prepare reusable visual"],
            kpis: ["Approval turnaround", "Planned slots completed"],
          },
          {
            key: "60",
            title: "Learn",
            objectives: ["Compare themes"],
            activities: ["Review simulated engagement", "Refine timing"],
            kpis: ["Engagement trend", "Booking-intent clicks"],
          },
          {
            key: "90",
            title: "Optimise",
            objectives: ["Repeat effective themes"],
            activities: ["Refresh quarterly strategy"],
            kpis: ["Qualified enquiries", "Repeat diner sign-ups"],
          },
          {
            key: "annual",
            title: "Build durable local demand",
            objectives: ["Maintain a trusted local presence"],
            activities: ["Quarterly planning and rights review"],
            kpis: ["Local discovery", "Retention"],
          },
        ],
        approvedAt: addDays(anchor, -41),
        approvedByUserId: approver.id,
      },
      serviceBilling: {
        status: fixtureBillingStatus(index),
        activePackageId: packageId,
        currentPeriodEnd: addDays(anchor, 21),
        cancelAtPeriodEnd: index === 7,
        ...(index === 3
          ? { failedPaymentAt: addDays(anchor, -2), graceEndsAt: addDays(anchor, 5) }
          : { lastPaidAt: addDays(anchor, -9) }),
        serviceOptions: options,
      },
    };

    push(store.managedDeliveryRuns, {
      id: `${prefix}-delivery`,
      tenantId: fixture.tenant.id,
      companyId: company.id,
      phase: index === 8 ? "awaiting_approval" : "active",
      serviceLevel,
      onboardingCompletedAt: createdAt,
      strategyEligibleAt: createdAt,
      strategyDueAt: addDays(anchor, -40),
      strategyStartedAt: addDays(anchor, -44),
      strategyCompletedAt: addDays(anchor, -43),
      calendarCompletedAt: addDays(anchor, -42),
      implementationPlanEmailedAt: addDays(anchor, -42),
      enqueueReason: "onboarding",
      campaignId,
      strategyVersion: 1,
      calendarVersion: 1,
      missingInfo: [],
      assumptions: ["All records are fictional and local-demo only."],
      errors: [],
      retryCount: 0,
      statusMessageKey: index === 8 ? "waiting_for_your_approval" : "delivery_active",
      createdAt,
      updatedAt: addDays(anchor, -1),
    });
    push(store.managedStrategyCycles, {
      id: `${prefix}-strategy-cycle`,
      tenantId: fixture.tenant.id,
      companyId: company.id,
      quarterStart: quarterStart(anchor),
      status: "approved",
      confirmedInputs: {
        profileConfirmedAt: addDays(anchor, -44),
        goals: company.profile.stagingFixture.goals,
        packageId,
        locations: company.profile.serviceAreas,
        seasonalInputs: ["Fictional winter dining pattern", "Local event fixture"],
      },
      guardrails: {
        channels: ["instagram", "facebook", "google_business_profile", "email"],
        themes: ["Menu discovery", "Local dining", "Group bookings"],
        publishWindows: ["Tue–Thu 11:00–19:00", "Fri 10:00–14:00"],
      },
      approvedAt: addDays(anchor, -41),
      createdAt,
      updatedAt: addDays(anchor, -41),
    });
    push(store.campaigns, {
      id: campaignId,
      companyId: company.id,
      name: `${company.name} local dining month [TEST]`,
      objective: company.profile.stagingFixture.goals[0],
      audience: `Fictional diners near ${company.profile.stagingFixture.suburb}`,
      serviceFocus: company.profile.stagingFixture.serviceDetails[0],
      channels: ["Instagram", "Facebook", "Google Business Profile"],
      durationDays: 30,
      startDate: dateAt(anchor, -7),
      endDate: dateAt(anchor, 23),
      keyMessage: `Explore ${company.profile.restaurant!.cuisineStyle} in ${company.profile.stagingFixture.suburb}.`,
      status: index % 3 === 0 ? "completed" : "approved",
      createdById: staff.id,
      approvedById: approver.id,
      approvedAt: addDays(anchor, -9),
      createdAt: addDays(anchor, -20),
      updatedAt: addDays(anchor, -2),
      campaignType: "local_awareness",
      priority: "medium",
      timezone: company.profile.stagingFixture.timezone,
      budgetAmount: 0,
      currency: "AUD",
      dailySpendLimit: 0,
      geographicScope: company.profile.serviceAreas,
      layerMeta: {
        assumptions: ["Simulation only; no campaign has been created on an ad platform."],
        performanceTargets: { bookingIntentClicks: 40, note: "fictional target" },
      },
    });
    push(store.campaignItems, {
      id: `${prefix}-campaign-item`,
      campaignId,
      companyId: company.id,
      dayOffset: 8,
      channel: "Instagram",
      contentType: "social_post",
      title: `${company.profile.stagingFixture.menuHighlights[0]} spotlight`,
      brief: "Use approved fixture visual and neutral menu language.",
      contentId: contentPublishedId,
      status: "published",
      createdAt,
      updatedAt: addDays(anchor, -4),
    });
    push(store.managedContentConcepts, {
      id: conceptId,
      tenantId: fixture.tenant.id,
      companyId: company.id,
      strategyCycleId: `${prefix}-strategy-cycle`,
      campaignId,
      packagePeriod: dateAt(anchor, 0).slice(0, 7),
      unitKey: `${prefix}-menu-discovery`,
      title: `${company.profile.stagingFixture.menuHighlights[0]} menu discovery`,
      theme: "Menu discovery",
      status: index % 2 ? "approval" : "scheduled",
      reusableAssetId: asset.id,
      quotaConsumedAt: addDays(anchor, -12),
      createdAt: addDays(anchor, -14),
      updatedAt: addDays(anchor, -1),
    });
    push(store.managedChannelAdaptations, {
      id: adaptationId,
      tenantId: fixture.tenant.id,
      companyId: company.id,
      conceptId,
      channelKey: "instagram",
      copy: `TEST FIXTURE: Discover ${company.profile.stagingFixture.menuHighlights[0]} at ${company.name}. View the fictional menu and plan your next local dinner.`,
      status: "ready",
      createdAt: addDays(anchor, -12),
      updatedAt: addDays(anchor, -1),
    });
    push(store.managedPlannedSlots, {
      id: slotId,
      tenantId: fixture.tenant.id,
      companyId: company.id,
      conceptId,
      adaptationId,
      plannedPublishAt: addDays(anchor, 5 + index, 10),
      finalContentDueAt: addDays(anchor, -9 + index, 10),
      status: "awaiting_approval",
      scheduledPostId,
      createdAt: addDays(anchor, -13),
      updatedAt: addDays(anchor, -1),
    });

    const pendingBody = `A closer look at ${company.profile.stagingFixture.menuHighlights[0]}. ${company.profile.brandVoice} TEST ONLY — no booking or order will be processed.`;
    push(
      store.content,
      {
        id: contentPendingId,
        companyId: company.id,
        managedConceptId: conceptId,
        managedChannelKey: "instagram",
        requestId: `${prefix}-request`,
        type: "social_post",
        title: `${company.profile.stagingFixture.menuHighlights[0]} — client review`,
        body: pendingBody,
        status: "pending_approval",
        createdById: staff.id,
        createdAt: addDays(anchor, -3),
        updatedAt: addDays(anchor, -1),
        versions: [
          {
            body: `${pendingBody} First draft.`,
            editedById: staff.id,
            editedAt: addDays(anchor, -3),
          },
        ],
        compliance: {
          riskLevel: "low",
          issues: [],
          canProceed: true,
          requiresEvidence: false,
          checkedAt: addDays(anchor, -2),
        },
        brandFitScore: 91,
        aiModel: "fixture-template/no-provider-call",
        aiPrompt: "Synthetic local-demo menu spotlight prompt.",
        sourcesUsed: [
          "fixture://restaurant-profile",
          asset.externalRef ?? "fixture://approved-rights-record",
        ],
        aiRunId: `${prefix}-ai-run`,
        estCostUsd: 0,
        assetIds: [asset.id],
        reusePermitted: true,
        reuseChannels: ["Instagram", "Facebook"],
        reviewDate: dateAt(anchor, 60),
        qualityRouting: {
          gate: "pass",
          decision: "auto_submit_client",
          serviceLevel,
          decidedAt: addDays(anchor, -2),
          decidedById: staff.id,
          reason: "Fixture content passed deterministic checks.",
          queue: "in_client_review",
        },
      },
      {
        id: contentPublishedId,
        companyId: company.id,
        managedConceptId: conceptId,
        managedChannelKey: "facebook",
        type: "social_post",
        title: `${company.name} local menu story [TEST]`,
        body: `TEST FIXTURE: This week we are highlighting ${company.profile.stagingFixture.menuHighlights[1]}. Fictional venue; not redeemable.`,
        status: "published",
        createdById: staff.id,
        approvedById: approver.id,
        approvedAt: addDays(anchor, -8),
        createdAt: addDays(anchor, -15),
        updatedAt: addDays(anchor, -4),
        versions: [],
        compliance: {
          riskLevel: "low",
          issues: [],
          canProceed: true,
          requiresEvidence: false,
          checkedAt: addDays(anchor, -10),
        },
        brandFitScore: 94,
        aiModel: "fixture-template/no-provider-call",
        sourcesUsed: ["fixture://restaurant-profile"],
        estCostUsd: 0,
        assetIds: [asset.id],
        campaignId,
        campaignItemId: `${prefix}-campaign-item`,
        reusePermitted: true,
        reuseChannels: ["Facebook"],
      },
    );
    push(store.aiRuns, {
      id: `${prefix}-ai-run`,
      tenantId: fixture.tenant.id,
      companyId: company.id,
      userId: staff.id,
      kind: "content_draft",
      model: "fixture-template/no-provider-call",
      promptSummary: "Generated a synthetic menu-discovery draft from fixture profile fields.",
      outputChars: pendingBody.length,
      sourcesUsed: ["fixture://restaurant-profile", "fixture://approved-rights-record"],
      estCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      contextChars: 0,
      createdAt: addDays(anchor, -3),
    });
    push(store.managedApprovalRequests, {
      id: `${prefix}-approval-pending`,
      tenantId: fixture.tenant.id,
      companyId: company.id,
      contentId: contentPendingId,
      conceptId,
      plannedSlotId: slotId,
      scope: "standard_content",
      recipientEmail: approver.email,
      tokenHash: `fixture-hash-${prefix}`,
      status: "pending",
      dueAt: addDays(anchor, 3),
      revisionRound: index % 3 === 0 ? 1 : 0,
      reminder7dAt: addDays(anchor, -1),
      reminder7dKey: `approval:${prefix}:client_7d`,
      createdAt: addDays(anchor, -4),
      updatedAt: addDays(anchor, -1),
    });
    if (index === 0) {
      push(store.managedApprovalRequests, {
        id: `${prefix}-approval-revision`,
        tenantId: fixture.tenant.id,
        companyId: company.id,
        contentId: contentPublishedId,
        conceptId,
        plannedSlotId: slotId,
        scope: "standard_content",
        recipientEmail: approver.email,
        tokenHash: `fixture-hash-${prefix}-revision`,
        status: "changes_requested",
        dueAt: addDays(anchor, -8),
        revisionRound: 1,
        respondedAt: addDays(anchor, -9),
        responsePayload: { note: "Please make the dietary wording more specific. TEST FIXTURE." },
        createdAt: addDays(anchor, -12),
        updatedAt: addDays(anchor, -9),
      });
    }
    push(
      store.scheduledPosts,
      {
        id: scheduledPostId,
        contentId: contentPendingId,
        companyId: company.id,
        platform: "Instagram",
        scheduledDate: dateAt(anchor, 5 + index),
        scheduledTime: "10:00",
        status: "scheduled",
        createdById: staff.id,
        createdAt: addDays(anchor, -2),
        updatedAt: addDays(anchor, -2),
      },
      {
        id: `${prefix}-post-published`,
        contentId: contentPublishedId,
        companyId: company.id,
        platform: "Facebook",
        scheduledDate: dateAt(anchor, -4),
        scheduledTime: "18:00",
        status: "published",
        createdById: staff.id,
        createdAt: addDays(anchor, -10),
        updatedAt: addDays(anchor, -4),
      },
    );
    push(store.publishLogs, {
      id: `${prefix}-publish-log`,
      companyId: company.id,
      platform: "Facebook",
      scheduledPostId: `${prefix}-post-published`,
      contentId: contentPublishedId,
      status: "skipped",
      attempt: 1,
      detail: "SIMULATED LOCAL DEMO — no provider request was made.",
      actorId: staff.id,
      createdAt: addDays(anchor, -4),
    });
    push(store.requests, {
      id: `${prefix}-request`,
      companyId: company.id,
      requesterId: approver.id,
      requestType: "social_post",
      objective: company.profile.stagingFixture.goals[0],
      targetAudience: `Fictional local diners in ${company.profile.stagingFixture.suburb}`,
      platform: "Instagram",
      topic: `${company.profile.stagingFixture.menuHighlights[0]} menu spotlight`,
      callToAction: "View the test menu",
      preferredDate: dateAt(anchor, 8 + index),
      preferredTime: "10:00",
      urgency: index === 8 ? "high" : "normal",
      notes: "TEST ONLY — this request must not trigger email, publishing or provider calls.",
      consent: {
        customerNamed: false,
        customerInPhotos: false,
        consentObtained: false,
        mentionsPricing: false,
        mentionsOffer: false,
        performanceClaims: false,
      },
      uploads: [],
      status: index % 2 ? "ai_drafting" : "submitted",
      assignedReviewerId: staff.id,
      statusHistory: [
        { status: "submitted", at: addDays(anchor, -6), byId: approver.id },
      ],
      createdAt: addDays(anchor, -6),
      updatedAt: addDays(anchor, -2),
    });
    push(store.services, {
      id: `${prefix}-service`,
      companyId: company.id,
      name: company.profile.stagingFixture.serviceDetails[0],
      description: `TEST ONLY — ${company.profile.restaurant!.cuisineStyle} ${company.profile.stagingFixture.serviceDetails[0].toLowerCase()} fixture.`,
      targetCustomer: `Fictional diners near ${company.profile.stagingFixture.suburb}`,
      priceApproved: false,
      marginPriority: "high",
      seasonality: "Fictional local seasonal pattern",
      locations: company.profile.serviceAreas,
      restrictions: "No real price, award or availability claims.",
      active: true,
      createdAt,
      updatedAt: addDays(anchor, -2),
    });
    push(store.localProfiles, {
      companyId: company.id,
      suburbs: [company.profile.stagingFixture.suburb],
      demographics: "Synthetic local-demo audience; not sourced from personal data.",
      commonNeeds: "Clear menus, dietary information, convenient booking and local discovery.",
      competitors: ["Fictional neighbourhood venue A", "Fictional neighbourhood venue B"],
      localEvents: "TEST ONLY community dining week",
      seasonalPatterns: "Synthetic seasonal dining pattern for demonstration.",
      searchTerms: [
        `${(company.profile.restaurant?.cuisineStyle ?? "Indian dining").toLowerCase()} ${company.profile.stagingFixture.suburb}`,
        `restaurant near ${company.profile.stagingFixture.suburb}`,
      ],
      buyingTriggers: "Menu discovery, group occasions and easy planning.",
      updatedAt: addDays(anchor, -2),
    });
    push(store.ragKnowledgeSources, {
      id: `${prefix}-rag-source`,
      companyId: company.id,
      title: `${company.name} fixture menu and service guide`,
      sourceType: "menu",
      status: "approved",
      currentVersionId: `${prefix}-rag-version`,
      approvedVersionId: `${prefix}-rag-version`,
      addedById: approver.id,
      createdAt,
      updatedAt: addDays(anchor, -2),
    });
    push(store.ragKnowledgeVersions, {
      id: `${prefix}-rag-version`,
      sourceId: `${prefix}-rag-source`,
      companyId: company.id,
      versionNumber: 1,
      title: `${company.name} fictional menu`,
      content: `TEST ONLY. Menu highlights: ${company.profile.stagingFixture.menuHighlights.join(", ")}. Services: ${company.profile.stagingFixture.serviceDetails.join(", ")}.`,
      status: "approved",
      fileName: `${slug}-fixture-menu.txt`,
      contentType: "text/plain",
      createdById: approver.id,
      createdAt,
      approvedById: admin.id,
      approvedAt: addDays(anchor, -40),
    });
    push(store.evidence, {
      id: `${prefix}-evidence`,
      companyId: company.id,
      title: "TEST ONLY visual rights confirmation",
      evidenceType: "other",
      detail: "Synthetic rights evidence linked to the fixture-owned metadata asset.",
      documentName: `TEST-ONLY-${slug}-rights.txt`,
      validUntil: dateAt(anchor, 365),
      createdById: approver.id,
      createdAt,
    });
    push(store.claims, {
      id: `${prefix}-claim`,
      companyId: company.id,
      claimText: `Located in ${company.profile.stagingFixture.suburb}`,
      evidenceId: `${prefix}-evidence`,
      allowedChannels: [],
      active: true,
      createdAt,
    });
    push(store.recommendations, {
      id: `${prefix}-route-recommendation`,
      companyId: company.id,
      type: "content_gap",
      title: `Confirm the next ${company.profile.stagingFixture.goals[0].toLowerCase()} test`,
      rationale:
        "Synthetic route-coverage recommendation derived from the fixture profile.",
      action: {
        kind: "task",
        topic: "Review the next fictional local marketing experiment",
        _score: 70 + index,
      },
      status: "open",
      createdById: staff.id,
      createdAt: addDays(anchor, -2),
      score: 70 + index,
      evidence: [
        {
          signal: "fixture_profile",
          observed: "TEST ONLY representative recommendation.",
        },
      ],
    });
    push(store.companyCreditWallets, {
      id: `${prefix}-wallet`,
      tenantId: fixture.tenant.id,
      companyId: company.id,
      balanceUsd: index % 3 === 0 ? 35 : 120,
      minFloorUsd: 50,
      autoTopUpEnabled: false,
      topUpTriggerBalanceUsd: 50,
      topUpAmountUsd: 100,
      maxTopUpAmountUsd: 500,
      maxTopUpPerDay: 1,
      createdAt,
      updatedAt: addDays(anchor, -1),
    });
    push(store.companyCreditLedger, {
      id: `${prefix}-credit-entry`,
      tenantId: fixture.tenant.id,
      companyId: company.id,
      walletId: `${prefix}-wallet`,
      kind: "adjustment",
      amountUsd: index % 3 === 0 ? 35 : 120,
      balanceAfterUsd: index % 3 === 0 ? 35 : 120,
      reason: "TEST ONLY opening fixture balance — no payment processed.",
      createdById: admin.id,
      createdAt,
    });
    push(store.taxInvoices, {
      id: `${prefix}-invoice`,
      tenantId: fixture.tenant.id,
      companyId: company.id,
      invoiceNumber: `TEST-${dateAt(anchor, 0).slice(0, 7).replace("-", "")}-${String(index + 1).padStart(3, "0")}`,
      kind: index === 9 ? "credit_note" : "subscription",
      status: index === 9 ? "credited" : "issued",
      currency: "aud",
      seller: {
        name: fixture.tenant.name,
        email: "billing@staging-fixture.invalid",
        address: "TEST ONLY — no physical address",
      },
      buyer: {
        name: company.profile.legalName ?? `TEST ONLY — ${company.name}`,
        email: approver.email,
        address: "TEST ONLY — fictional restaurant",
      },
      lines: [
        {
          description: `${company.profile.stagingFixture.serviceTier} managed service — TEST ONLY`,
          quantity: 1,
          unitAmountExGst: 100,
          gstAmount: 10,
          amountIncGst: 110,
        },
      ],
      subtotalExGst: 100,
      gstAmount: 10,
      totalIncGst: 110,
      gstInclusive: true,
      issuedAt: addDays(anchor, -9),
      notes: "FICTIONAL DOCUMENT — no charge, tax event or payment occurred.",
      createdById: admin.id,
      createdAt: addDays(anchor, -9),
      updatedAt: addDays(anchor, -8),
    });
    push(store.audit, {
      id: `${prefix}-audit`,
      tenantId: fixture.tenant.id,
      action: "fixture.demo_record_loaded",
      actorId: admin.id,
      actorEmail: admin.email,
      targetType: "company",
      targetId: company.id,
      companyId: company.id,
      detail: "Loaded linked TEST ONLY local-demo records; external side effects disabled.",
      createdAt,
    });
  });

  addPortfolioAndJobFixtures(store, fixture, anchor);
  return store;
}

function addPortfolioAndJobFixtures(
  store: DataStore,
  fixture: ReturnType<typeof createStagingAgencyFixture>,
  anchor: number,
): void {
  const company = fixture.companies[0]!;
  const second = fixture.companies[1]!;
  const admin = fixture.users.find((user) => user.fixtureRole === "Admin")!;
  const staff = fixture.users.find((user) => user.fixtureRole === "Staff")!;
  const approver = fixture.users.find(
    (user) => user.fixtureRole === "Client Approver" && fixture.access.some(
      (access) => access.userId === user.id && access.companyId === company.id,
    ),
  )!;
  const p = "demo-01";
  const secondPrefix = "demo-02";

  resetManagedContentJobMemory(
    [
      {
        id: `${p}-generation-job`,
        tenantId: fixture.tenant.id,
        companyId: company.id,
        requestId: `${p}-request`,
        conceptId: `${p}-concept`,
        strategyCycleId: `${p}-strategy-cycle`,
        idempotencyKey: `${STAGING_FIXTURE_KEY}:${p}:generation`,
        requestFingerprint: "fixture-fingerprint-ready",
        request: {
          tenantId: fixture.tenant.id,
          companyId: company.id,
          requestId: `${p}-request`,
          conceptId: `${p}-concept`,
          strategyCycleId: `${p}-strategy-cycle`,
          packagePeriod: dateAt(anchor, 0).slice(0, 7),
          theme: "Menu discovery",
          brief: "TEST ONLY — create a fictional menu-discovery concept.",
          strategyContext: { fixture: true, externalCallsAllowed: false },
          channels: ["instagram"],
          assetReferences: [
            {
              assetId: fixture.assets.find(
                (asset) => asset.companyId === company.id && asset.source === "upload",
              )!.id,
              rightsConfirmed: true,
              usageRights: "Synthetic fixture rights record; local demo only.",
            },
          ],
          plannedPublishAt: addDays(anchor, 5),
        },
        schemaVersion: "1.0",
        callbackTarget: "command-centre",
        externalJobId: "TEST-ONLY-SIMULATED-JOB-001",
        status: "ready",
        pollAttempts: 1,
        resultPayload: {
          schemaVersion: "1.0",
          note: "Synthetic fixture result; no content-engine network request occurred.",
        },
        privateProvenance: {
          mode: "simulated",
          provider: "none",
          model: "fixture-template/no-provider-call",
          externalNetwork: false,
          sources: ["fixture://restaurant-profile", "fixture://approved-rights-record"],
        },
        importedConceptId: `${p}-concept`,
        createdAt: addDays(anchor, -4),
        updatedAt: addDays(anchor, -3),
      },
      {
        id: `${secondPrefix}-generation-job`,
        tenantId: fixture.tenant.id,
        companyId: second.id,
        requestId: `${secondPrefix}-request`,
        conceptId: `${secondPrefix}-concept`,
        strategyCycleId: `${secondPrefix}-strategy-cycle`,
        idempotencyKey: `${STAGING_FIXTURE_KEY}:${secondPrefix}:generation`,
        requestFingerprint: "fixture-fingerprint-paused",
        request: {
          tenantId: fixture.tenant.id,
          companyId: second.id,
          requestId: `${secondPrefix}-request`,
          conceptId: `${secondPrefix}-concept`,
          strategyCycleId: `${secondPrefix}-strategy-cycle`,
          packagePeriod: dateAt(anchor, 0).slice(0, 7),
          theme: "Local dining",
          brief: "TEST ONLY — exercise a paused generation job.",
          strategyContext: { fixture: true, externalCallsAllowed: false },
          channels: ["facebook"],
          assetReferences: [],
          plannedPublishAt: addDays(anchor, 7),
        },
        schemaVersion: "1.0",
        callbackTarget: "command-centre",
        status: "paused",
        pollAttempts: 0,
        lastError: "SIMULATED: content engine is not configured in local demo.",
        privateProvenance: {
          mode: "simulated",
          provider: "none",
          externalNetwork: false,
        },
        createdAt: addDays(anchor, -2),
        updatedAt: addDays(anchor, -2),
      },
    ],
    [
      {
        id: `${secondPrefix}-generation-exception`,
        jobId: `${secondPrefix}-generation-job`,
        tenantId: fixture.tenant.id,
        companyId: second.id,
        kind: "provider_unavailable",
        message: "SIMULATED: generation provider is unavailable; no network call was attempted.",
        status: "open",
        createdAt: addDays(anchor, -2),
      },
    ],
  );

  push(
    store.scheduledPosts,
    {
      id: `${p}-post-failed`,
      contentId: `${p}-content-published`,
      companyId: company.id,
      platform: "Instagram",
      scheduledDate: dateAt(anchor, -2),
      scheduledTime: "12:00",
      status: "failed",
      createdById: staff.id,
      createdAt: addDays(anchor, -5),
      updatedAt: addDays(anchor, -2),
    },
  );
  push(store.publishLogs, {
    id: `${p}-publish-failed-log`,
    companyId: company.id,
    platform: "Instagram",
    scheduledPostId: `${p}-post-failed`,
    contentId: `${p}-content-published`,
    status: "failed",
    attempt: 1,
    detail: "SIMULATED FAILURE — connector unavailable; no provider request made.",
    actorId: staff.id,
    createdAt: addDays(anchor, -2),
  });
  push(store.integrations, {
    id: `${p}-integration`,
    companyId: company.id,
    platform: "Instagram",
    accountName: "TEST ONLY — simulated connector",
    encryptedToken: "SIMULATED-NOT-A-TOKEN",
    tokenLastFour: "TEST",
    status: "disconnected",
    connectedById: admin.id,
    connectedAt: addDays(anchor, -30),
    updatedAt: addDays(anchor, -2),
  });
  push(store.connectInvites, {
    id: `${p}-connect-invite`,
    tenantId: fixture.tenant.id,
    companyId: second.id,
    platform: "Google Business Profile",
    token: "TEST-ONLY-CONNECT-TOKEN",
    recipientEmail: fixture.users.find((user) =>
      fixture.access.some((access) => access.userId === user.id && access.companyId === second.id),
    )!.email,
    status: "pending",
    invitedById: admin.id,
    expiresAt: addDays(anchor, 7),
    createdAt: addDays(anchor, -1),
    updatedAt: addDays(anchor, -1),
  });
  push(store.adAccounts, {
    id: `${p}-ad-account`,
    companyId: company.id,
    platform: "meta_ads",
    accountName: "TEST ONLY — simulated Meta account",
    externalAccountId: "TEST-ONLY-NOT-CONNECTED",
    encryptedToken: "SIMULATED-NOT-A-TOKEN",
    tokenLastFour: "TEST",
    status: "disconnected",
    connectedById: admin.id,
    connectedAt: addDays(anchor, -20),
    updatedAt: addDays(anchor, -1),
  });
  store.adBudgets.splice(
    store.adBudgets.findIndex((budget) => budget.companyId === company.id),
    1,
    {
      companyId: company.id,
      monthlyBudgetUsd: 0,
      allocation: { meta_ads: 0.6, google_ads: 0.4 },
      feeModel: "percent_of_spend",
      feePercent: 0.12,
      feeFlatUsd: 0,
      updatedById: admin.id,
      updatedAt: addDays(anchor, -2),
    },
  );
  push(store.audienceSegments, {
    id: `${p}-audience`,
    companyId: company.id,
    name: "TEST ONLY — local dinner planners",
    platform: "all",
    targeting: {
      locations: [{ kind: "radius", value: company.profile.stagingFixture.suburb, radiusKm: 8 }],
      ageMin: 25,
      ageMax: 65,
      gender: "all",
      languages: ["English"],
      interests: ["Local dining", "Group dining"],
      customAudiences: [],
      exclusions: [],
      devices: "all",
      placements: [],
    },
    createdById: staff.id,
    createdAt: addDays(anchor, -12),
    updatedAt: addDays(anchor, -2),
  });
  push(store.adCampaigns, {
    id: `${p}-ad-campaign`,
    companyId: company.id,
    adAccountId: `${p}-ad-account`,
    platform: "meta_ads",
    name: "TEST ONLY — weekday dinner enquiries",
    objective: "leads",
    dailyBudgetUsd: 0,
    status: "paused",
    startDate: dateAt(anchor, -10),
    endDate: dateAt(anchor, 20),
    audienceSegmentId: `${p}-audience`,
    createdById: staff.id,
    createdAt: addDays(anchor, -12),
    updatedAt: addDays(anchor, -1),
  });
  push(store.managedPaidAuthorizations, {
    id: `${p}-paid-authorization`,
    tenantId: fixture.tenant.id,
    companyId: company.id,
    adCampaignId: `${p}-ad-campaign`,
    monthKey: dateAt(anchor, 0).slice(0, 7),
    requestedBudgetAud: 300,
    clientMonthlyCapAud: company.profile.stagingFixture.monthlyAdCapAud,
    creativeApprovalId: `${p}-paid-creative-approval`,
    budgetTargetingApprovalId: `${p}-paid-budget-approval`,
    disclosureAcceptedAt: addDays(anchor, -4),
    status: "pending",
    createdAt: addDays(anchor, -5),
    updatedAt: addDays(anchor, -1),
  });
  for (const [id, scope] of [
    [`${p}-paid-creative-approval`, "paid_creative"],
    [`${p}-paid-budget-approval`, "paid_budget_targeting"],
  ] as const) {
    push(store.managedApprovalRequests, {
      id,
      tenantId: fixture.tenant.id,
      companyId: company.id,
      adCampaignId: `${p}-ad-campaign`,
      scope,
      recipientEmail: approver.email,
      tokenHash: `${id}-fixture-hash`,
      status: scope === "paid_creative" ? "approved" : "pending",
      dueAt: addDays(anchor, 3),
      revisionRound: 0,
      respondedAt: scope === "paid_creative" ? addDays(anchor, -1) : null,
      directChargeDisclosureAcceptedAt: addDays(anchor, -4),
      createdAt: addDays(anchor, -5),
      updatedAt: addDays(anchor, -1),
    });
  }
  push(store.leads, {
    id: `${p}-lead`,
    companyId: company.id,
    platform: "meta_ads",
    contact: "Fictional Event Enquiry",
    source: "test_fixture_form",
    valueUsd: 180,
    status: "qualified",
    capturedAt: addDays(anchor, -3),
  });
  push(store.crmContacts, {
    id: `${p}-crm-contact`,
    companyId: company.id,
    email: "fictional-diner@customer.example",
    phone: "+61000000001",
    firstName: "Fictional",
    lastName: "Diner",
    tags: ["test-only", "group-enquiry"],
    consentStatus: "subscribed",
    source: "manual",
    leadId: `${p}-lead`,
    notes: "TEST ONLY — not a real person or contact method.",
    createdById: staff.id,
    createdAt: addDays(anchor, -10),
    updatedAt: addDays(anchor, -2),
  });
  push(store.crmSegments, {
    id: `${p}-crm-segment`,
    companyId: company.id,
    name: "TEST ONLY — opted-in group enquiries",
    description: "Synthetic audience for demo filtering.",
    ruleType: "tag",
    ruleConfig: { tags: ["group-enquiry"] },
    createdById: staff.id,
    createdAt: addDays(anchor, -9),
    updatedAt: addDays(anchor, -2),
  });
  push(store.crmInteractions, {
    id: `${p}-crm-interaction`,
    companyId: company.id,
    contactId: `${p}-crm-contact`,
    channel: "form",
    direction: "inbound",
    summary: "Fictional group-dining enquiry",
    detail: "No message was sent; this is deterministic fixture history.",
    occurredAt: addDays(anchor, -3),
    createdById: staff.id,
    metadata: { simulated: true },
  });
  push(store.companyReviews, {
    id: `${p}-review`,
    companyId: company.id,
    platform: "google",
    externalId: "TEST-ONLY-REVIEW-001",
    authorName: "Fictional Reviewer",
    rating: 4,
    body: "TEST ONLY: Helpful dietary notes and a welcoming fictional team.",
    reviewedAt: addDays(anchor, -5),
    sentiment: "positive",
    topics: ["dietary information", "service"],
    urgency: "low",
    escalationRequired: false,
    status: "drafted",
    draftResponse: "Thank you for the fictional feedback. This response will not be published.",
    importedAt: addDays(anchor, -5),
    createdById: staff.id,
  });
  push(store.reviewRequestCampaigns, {
    id: `${p}-review-campaign`,
    companyId: company.id,
    name: "TEST ONLY post-visit feedback",
    channel: "email",
    status: "paused",
    messageTemplate: "Thanks for visiting our fictional venue. No message is sent.",
    targetSegment: "test-only",
    sentCount: 12,
    clickCount: 5,
    reviewCount: 3,
    createdById: staff.id,
    createdAt: addDays(anchor, -20),
    updatedAt: addDays(anchor, -2),
  });
  push(store.socialMentions, {
    id: `${p}-mention`,
    companyId: company.id,
    platform: "Instagram",
    externalId: "TEST-ONLY-MENTION-001",
    authorName: "@fictional_diner",
    text: "TEST ONLY: Are there vegan options on the fictional group menu?",
    receivedAt: addDays(anchor, -1),
    status: "new",
    createdAt: addDays(anchor, -1),
  });
  push(store.socialResponses, {
    id: `${p}-social-response`,
    companyId: company.id,
    platform: "Instagram",
    originalComment: "TEST ONLY: Are there vegan options on the fictional group menu?",
    sentiment: "neutral",
    intent: "general_enquiry",
    draftResponse: "TEST ONLY draft: Yes, the fixture profile lists vegan options. Please check the sample menu.",
    status: "pending_approval",
    riskLevel: "low",
    escalationRequired: false,
    createdById: staff.id,
    createdAt: addDays(anchor, -1),
  });
  push(store.managedEngagementRoutes, {
    id: `${p}-engagement-route`,
    tenantId: fixture.tenant.id,
    companyId: company.id,
    sourceKind: "message",
    sourceId: `${p}-mention`,
    riskLevel: "low",
    confidence: 0.93,
    sentiment: "neutral",
    decision: "staff_review",
    reason: "Local demo keeps all engagement in staff review despite low risk.",
    createdAt: addDays(anchor, -1),
  });
  push(store.emailTemplates, {
    id: `${p}-email-template`,
    companyId: company.id,
    name: "TEST ONLY monthly menu note",
    kind: "newsletter",
    subject: "A fictional menu update from {{company}}",
    htmlBody: "<p>TEST ONLY — no email is sent. <a href=\"{{unsubscribeUrl}}\">Unsubscribe</a></p>",
    active: true,
    createdById: staff.id,
    createdAt: addDays(anchor, -20),
    updatedAt: addDays(anchor, -2),
  });
  push(store.emailSubscribers, {
    id: `${p}-email-subscriber`,
    companyId: company.id,
    email: "opted-in-fixture@customer.example",
    name: "Fictional Subscriber",
    tags: ["test-only", "newsletter"],
    marketingConsent: true,
    createdAt: addDays(anchor, -30),
    updatedAt: addDays(anchor, -2),
  });
  push(store.emailCampaigns, {
    id: `${p}-email-campaign`,
    companyId: company.id,
    templateId: `${p}-email-template`,
    name: "TEST ONLY winter menu note",
    subject: "A fictional winter menu update",
    status: "sent",
    sentAt: addDays(anchor, -6),
    segmentTag: "test-only",
    stats: { recipients: 24, sent: 24, failed: 1, opens: 13, clicks: 5, unsubscribes: 1, bounces: 1 },
    createdById: staff.id,
    createdAt: addDays(anchor, -10),
    updatedAt: addDays(anchor, -6),
  });
  push(store.smsCompanySettings, {
    companyId: company.id,
    countryCode: "AU",
    senderId: "TESTONLY",
    quietHoursStart: "20:00",
    quietHoursEnd: "09:00",
    monthlySpendCapUsd: 0,
    updatedById: admin.id,
    updatedAt: addDays(anchor, -2),
  });
  push(store.smsSubscribers, {
    id: `${p}-sms-subscriber`,
    companyId: company.id,
    phoneE164: "+61000000001",
    name: "Fictional SMS Subscriber",
    tags: ["test-only"],
    consentStatus: "opted_in",
    consentedAt: addDays(anchor, -30),
    source: "manual",
    createdAt: addDays(anchor, -30),
    updatedAt: addDays(anchor, -2),
  });
  push(store.smsCampaigns, {
    id: `${p}-sms-campaign`,
    companyId: company.id,
    name: "TEST ONLY booking reminder",
    body: "TEST ONLY: Fictional booking reminder. No SMS was sent. STOP to opt out.",
    kind: "transactional",
    status: "sent",
    sentAt: addDays(anchor, -1),
    segmentTag: "test-only",
    shortLink: "https://example.test/fixture",
    utmCampaign: "test-only-booking-reminder",
    stats: {
      recipients: 8,
      segments: 1,
      estimatedCostUsd: 0,
      actualCostUsd: 0,
      delivered: 7,
      failed: 1,
      blockedOptOut: 1,
      blockedNoConsent: 1,
      blockedQuietHours: 0,
    },
    createdById: staff.id,
    createdAt: addDays(anchor, -3),
    updatedAt: addDays(anchor, -1),
  });
  push(store.cmsPages, {
    id: `${p}-cms-page`,
    companyId: company.id,
    slug: "test-only-group-dining",
    title: "TEST ONLY group dining",
    kind: "landing",
    status: "approved",
    currentVersionId: `${p}-cms-version`,
    createdById: staff.id,
    createdAt: addDays(anchor, -25),
    updatedAt: addDays(anchor, -2),
  });
  push(store.cmsPageVersions, {
    id: `${p}-cms-version`,
    pageId: `${p}-cms-page`,
    companyId: company.id,
    versionNumber: 1,
    title: "TEST ONLY group dining",
    bodyHtml: "<h1>Plan a fictional group dinner</h1><p>No booking is processed.</p>",
    changeSummary: "Initial local-demo page",
    status: "approved",
    createdById: staff.id,
    createdAt: addDays(anchor, -25),
    approvedById: approver.id,
    approvedAt: addDays(anchor, -24),
  });
  push(store.cmsSeoMetadata, {
    id: `${p}-cms-seo`,
    pageId: `${p}-cms-page`,
    companyId: company.id,
    metaTitle: `Group dining | ${company.name} [TEST]`,
    metaDescription: "Fictional local-demo landing page for group dining.",
    ogTitle: "TEST ONLY group dining",
    ogDescription: "No real venue, booking or offer.",
    noIndex: true,
    createdAt: addDays(anchor, -25),
    updatedAt: addDays(anchor, -2),
  });
  push(store.cmsUpdateRequests, {
    id: `${p}-cms-request`,
    companyId: company.id,
    pageId: `${p}-cms-page`,
    title: "Add AEO dining FAQ",
    description: "Add concise fictional answers for group size and dietary options.",
    status: "open",
    requestedById: approver.id,
    createdAt: addDays(anchor, -2),
    updatedAt: addDays(anchor, -2),
  });
  push(store.gaps, {
    id: `${p}-knowledge-gap`,
    companyId: company.id,
    requestId: `${p}-request`,
    question: "How much notice should fictional groups provide?",
    context: "Needed for the group-dining page and approval-safe booking copy.",
    blocking: false,
    status: "open",
    createdAt: addDays(anchor, -2),
  });
  push(store.recommendations, {
    id: `${p}-recommendation`,
    companyId: company.id,
    type: "content_gap",
    title: "Clarify group-dining lead time",
    rationale: "The fixture profile has group dining but no lead-time guidance.",
    action: { kind: "task", topic: "Confirm fictional group-dining lead time", _score: 82 },
    status: "open",
    createdById: staff.id,
    createdAt: addDays(anchor, -2),
    score: 82,
    evidence: [{ signal: "knowledge_gap", observed: "Group menu lead time is missing." }],
  });
  push(store.tasks, {
    id: `${p}-task`,
    companyId: company.id,
    title: "Confirm fictional group-dining lead time",
    detail: "Resolve the linked knowledge gap before the next content batch.",
    status: "open",
    sourceRecommendationId: `${p}-recommendation`,
    createdById: staff.id,
    createdAt: addDays(anchor, -2),
  });
  push(store.orderMenuItems, {
    id: `${p}-menu-item`,
    companyId: company.id,
    name: company.profile.stagingFixture.menuHighlights[0],
    description: "TEST ONLY sample menu item; not available to order.",
    priceCents: 2400,
    category: "Sample mains",
    available: true,
    sortOrder: 1,
    createdAt: addDays(anchor, -20),
    updatedAt: addDays(anchor, -2),
  });
  push(store.menuDesigns, {
    id: `${p}-menu-design`,
    companyId: company.id,
    title: "TEST ONLY seasonal dining menu",
    brief: "Fictional A4 and QR menu using approved fixture content.",
    format: "both",
    status: "in_design",
    billingClass: "included",
    quotaYear: new Date(anchor).getUTCFullYear(),
    deliverableAssetIds: [],
    createdById: staff.id,
    createdAt: addDays(anchor, -8),
    updatedAt: addDays(anchor, -2),
  });
  push(store.orderingSettings, {
    companyId: company.id,
    pickupEnabled: true,
    deliveryEnabled: false,
    minOrderCents: 2000,
    buttonLabel: "Test order",
    connectStatus: "not_started",
    updatedAt: addDays(anchor, -2),
  });
  push(store.restaurantOrders, {
    id: `${p}-order`,
    companyId: company.id,
    status: "completed",
    fulfillment: "pickup",
    customerName: "Fictional Customer",
    customerEmail: "fictional-order@customer.example",
    customerPhone: "+61000000001",
    lines: [{ menuItemId: `${p}-menu-item`, name: company.profile.stagingFixture.menuHighlights[0], priceCents: 2400, quantity: 2 }],
    subtotalCents: 4800,
    totalCents: 4800,
    paymentStatus: "simulated",
    createdAt: addDays(anchor, -4),
    updatedAt: addDays(anchor, -4),
  });
  push(store.bookingServicePeriods, {
    id: `${p}-service-period`,
    companyId: company.id,
    name: "Fictional dinner service",
    dayOfWeek: 5,
    startTime: "17:30",
    endTime: "22:00",
    capacity: 48,
    slotMinutes: 30,
    active: true,
    createdAt: addDays(anchor, -20),
    updatedAt: addDays(anchor, -2),
  });
  push(store.bookingSettings, {
    companyId: company.id,
    venueKind: "restaurant",
    enabled: true,
    buttonLabel: "Test booking",
    leadTimeHours: 2,
    maxPartySize: 10,
    updatedAt: addDays(anchor, -2),
  });
  push(store.reservations, {
    id: `${p}-reservation`,
    companyId: company.id,
    servicePeriodId: `${p}-service-period`,
    status: "confirmed",
    guestName: "Fictional Guest",
    guestEmail: "fictional-booking@customer.example",
    guestPhone: "+61000000002",
    partySize: 4,
    scheduledAt: addDays(anchor, 2, 18),
    confirmationMode: "simulated",
    createdAt: addDays(anchor, -3),
    updatedAt: addDays(anchor, -3),
  });
  push(store.loyaltyPrograms, {
    companyId: company.id,
    rewardMode: "points",
    pointsPerDollar: 1,
    stampsPerReward: 8,
    referralBonusPoints: 50,
    enabled: true,
    updatedAt: addDays(anchor, -2),
  });
  push(store.loyaltyTiers, {
    id: `${p}-loyalty-tier`,
    companyId: company.id,
    name: "Fixture regular",
    thresholdPoints: 100,
    benefits: "TEST ONLY priority menu preview",
    sortOrder: 1,
    createdAt: addDays(anchor, -20),
    updatedAt: addDays(anchor, -2),
  });
  push(store.loyaltyMembers, {
    id: `${p}-loyalty-member`,
    companyId: company.id,
    contactId: `${p}-crm-contact`,
    email: "fictional-diner@customer.example",
    displayName: "Fictional Diner",
    pointsBalance: 140,
    stampsBalance: 0,
    tierId: `${p}-loyalty-tier`,
    referralCode: "TESTONLY01",
    status: "active",
    createdAt: addDays(anchor, -18),
    updatedAt: addDays(anchor, -2),
  });
  push(store.loyaltyCoupons, {
    id: `${p}-loyalty-coupon`,
    companyId: company.id,
    code: "TEST-NOT-REDEEMABLE",
    name: "TEST ONLY bonus points",
    kind: "bonus_points",
    value: 25,
    segmentTag: "test-only",
    maxRedemptions: 100,
    perMemberLimit: 1,
    channels: ["email"],
    status: "active",
    redemptionCount: 1,
    createdById: staff.id,
    createdAt: addDays(anchor, -10),
    updatedAt: addDays(anchor, -2),
  });
  push(store.loyaltyReferrals, {
    id: `${p}-loyalty-referral`,
    companyId: company.id,
    referrerMemberId: `${p}-loyalty-member`,
    refereeEmail: "fictional-referee@customer.example",
    status: "completed",
    bonusAwarded: 50,
    createdAt: addDays(anchor, -8),
    completedAt: addDays(anchor, -6),
  });
  push(store.loyaltyRedemptions, {
    id: `${p}-loyalty-redemption`,
    companyId: company.id,
    memberId: `${p}-loyalty-member`,
    couponId: `${p}-loyalty-coupon`,
    amountOff: 0,
    mode: "simulated",
    abuseFlagged: false,
    redeemedAt: addDays(anchor, -4),
  });
  push(store.marketingWorkflows, {
    id: `${p}-workflow`,
    tenantId: fixture.tenant.id,
    companyId: company.id,
    name: "TEST ONLY booking follow-up",
    description: "Simulated workflow; dispatch is disabled.",
    triggerKind: "booking_made",
    templateKind: "post_stay",
    status: "active",
    steps: [
      { id: "delay-1", kind: "delay", delay: { amount: 1, unit: "hours" } },
      {
        id: "action-1",
        kind: "action",
        action: {
          kind: "send_email",
          subject: "TEST ONLY booking follow-up",
          body: "No email is sent from the local demo.",
        },
      },
    ],
    isAgencyTemplate: false,
    createdById: staff.id,
    createdAt: addDays(anchor, -15),
    updatedAt: addDays(anchor, -2),
  });
  push(store.marketingWorkflowSettings, {
    companyId: company.id,
    quietHoursStart: "20:00",
    quietHoursEnd: "09:00",
    frequencyCapPerWeek: 2,
    updatedById: admin.id,
    updatedAt: addDays(anchor, -2),
  });
  push(store.workflowDispatchLogs, {
    id: `${p}-workflow-log`,
    workflowId: `${p}-workflow`,
    companyId: company.id,
    contactId: `${p}-crm-contact`,
    channel: "email",
    stepId: "action-1",
    status: "simulated",
    detail: "SIMULATED — no email provider call was made.",
    createdAt: addDays(anchor, -1),
  });
  push(store.learningHypotheses, {
    id: `${p}-hypothesis`,
    tenantId: fixture.tenant.id,
    companyId: company.id,
    title: "Menu-detail posts may lift booking-intent clicks",
    statement: "More specific dish context will outperform generic venue posts in the fixture dataset.",
    metric: "simulated booking-intent clicks",
    status: "running",
    createdById: staff.id,
    createdAt: addDays(anchor, -14),
    updatedAt: addDays(anchor, -2),
  });
  push(store.learningLessons, {
    id: `${p}-lesson`,
    tenantId: fixture.tenant.id,
    companyId: company.id,
    source: "experiment_outcome",
    title: "Specific menu details performed better in simulation",
    lesson: "Reuse approved dish context, while keeping availability language neutral.",
    hypothesisId: `${p}-hypothesis`,
    createdById: staff.id,
    createdAt: addDays(anchor, -2),
  });
  push(store.privacyRequests, {
    id: `${p}-privacy`,
    tenantId: fixture.tenant.id,
    companyId: company.id,
    subjectRef: "fictional-diner@customer.example",
    requestType: "access",
    status: "in_progress",
    lawfulBasis: "TEST ONLY workflow exercise",
    jurisdiction: "AU",
    dueAt: addDays(anchor, 20),
    notes: "Synthetic request; contains no real personal information.",
    createdBy: admin.id,
    createdAt: addDays(anchor, -2),
  });
  push(store.photoShoots, {
    id: `${p}-photo-shoot`,
    companyId: company.id,
    brief: "TEST ONLY menu and dining-room fixture photography.",
    location: "Fictional venue — no real address",
    scheduledAt: addDays(anchor, 10, 10),
    status: "scheduled",
    deliverableAssetIds: [],
    targetChannels: ["instagram", "facebook"],
    createdById: staff.id,
    createdAt: addDays(anchor, -5),
    updatedAt: addDays(anchor, -2),
  });
  push(store.calendarAssistSuggestions, {
    id: `${p}-calendar-assist`,
    tenantId: STAGING_FIXTURE_TENANT_ID,
    companyId: company.id,
    kind: "seasonal_prompt",
    title: "TEST ONLY local dining week",
    brief: "Adds a visible fixture planning suggestion in the current month.",
    proposedDate: dateAt(anchor, 12),
    proposedTime: "11:00",
    platform: "Instagram",
    requestType: "social_post",
    evidence: [
      {
        signal: "fixture_calendar_gap",
        observed: "No menu-discovery post exists on this test date.",
      },
    ],
    priority: 70,
    status: "open",
    createdById: staff.id,
    createdAt: addDays(anchor, -1),
  });
  push(store.audit,
    {
      id: "demo-ops-connector-exception",
      tenantId: fixture.tenant.id,
      action: "connector.simulated_unavailable",
      actorId: staff.id,
      actorEmail: staff.email,
      targetType: "publishing_integration",
      targetId: `${p}-integration`,
      companyId: company.id,
      detail: "Instagram connector unavailable in local demo; publish attempt recorded as simulated failure.",
      createdAt: addDays(anchor, -2),
    },
    {
      id: "demo-ops-billing-exception",
      tenantId: fixture.tenant.id,
      action: "billing.fixture_grace_period",
      actorId: admin.id,
      actorEmail: admin.email,
      targetType: "company",
      targetId: fixture.companies[3]!.id,
      companyId: fixture.companies[3]!.id,
      detail: "TEST ONLY grace-period example; no payment provider event occurred.",
      createdAt: addDays(anchor, -2),
    },
  );
}
