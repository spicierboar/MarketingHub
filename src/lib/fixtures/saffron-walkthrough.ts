/**
 * Investor golden-path pack for Saffron Laneway (staging apply only).
 * Client-visible copy has no TEST ONLY / PLACEHOLDER labels.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { toRow } from "@/lib/db/mapper";
import {
  STAGING_FIXTURE_KEY,
  type StagingAgencyFixture,
} from "@/lib/fixtures/staging-agency";
import type { DetailedMarketingStrategy } from "@/lib/types";

const DAY = 86_400_000;

function addDays(anchor: number, days: number, hour = 9): string {
  const value = new Date(anchor + days * DAY);
  value.setUTCHours(hour, 0, 0, 0);
  return value.toISOString();
}

function dateAt(anchor: number, days: number): string {
  return addDays(anchor, days).slice(0, 10);
}

/** Deterministic UUIDs for walkthrough rows (group codes 21xx–28xx). */
function wtUuid(groupCode: string, index = 1): string {
  return `5f${groupCode}-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

async function expectOk<T>(
  label: string,
  operation: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const result = await operation;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

export function buildSaffronDetailedStrategy(args: {
  companyName: string;
  suburb: string;
  goals: string[];
  menuHighlight: string;
  packageName: string;
  generatedAt: string;
  approvedAt: string;
  approvedByUserId: string;
}): DetailedMarketingStrategy {
  return {
    id: wtUuid("210000", 9),
    version: 1,
    title: `${args.companyName} — quarterly marketing strategy`,
    status: "approved",
    generatedAt: args.generatedAt,
    model: "fixture-template/no-provider-call",
    packageName: args.packageName,
    executiveSummary: `A practical local growth plan for ${args.companyName} focused on ${args.goals.join(" and ").toLowerCase()}.`,
    businessObjectives: args.goals,
    personas: [
      {
        name: "Local weeknight diner",
        demographics: `Residents and workers near ${args.suburb}`,
        motivations: "Easy planning, clear menu information, and a welcoming local venue",
        painPoints: "Unclear dietary options and difficulty choosing a midweek venue",
      },
    ],
    channels: [
      {
        channel: "Instagram",
        rationale: "Show menu detail and dining atmosphere using approved assets.",
        tactics: ["Weekly menu story", "Chef-note carousel", "Booking reminder"],
      },
      {
        channel: "Google Business Profile",
        rationale: "Support high-intent local discovery.",
        tactics: ["Weekly update", "Menu highlight", "Review response draft"],
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
        activities: ["Review engagement", "Refine timing"],
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
    approvedAt: args.approvedAt,
    approvedByUserId: args.approvedByUserId,
  };
}

/**
 * Upsert Saffron-only walkthrough rows after the shell fixture is applied.
 * Uses real auth user ids from `actualIds` for FK columns.
 */
export async function upsertSaffronWalkthroughPack(
  sb: SupabaseClient,
  fixture: StagingAgencyFixture,
  actualIds: Map<string, string>,
): Promise<void> {
  const company = fixture.companies[0];
  if (
    !company ||
    company.profile.stagingFixture.fixtureKey !==
      `${STAGING_FIXTURE_KEY}:restaurant:saffron-laneway`
  ) {
    throw new Error("Saffron walkthrough expects companies[0] to be saffron-laneway");
  }

  const admin = fixture.users.find((u) => u.fixtureRole === "Admin");
  const staff = fixture.users.find((u) => u.fixtureRole === "Staff");
  const approver = fixture.users.find(
    (u) =>
      u.fixtureRole === "Client Approver" &&
      fixture.access.some((a) => a.userId === u.id && a.companyId === company.id),
  );
  if (!admin || !staff || !approver) {
    throw new Error("Saffron walkthrough missing admin/staff/approver");
  }

  const adminId = actualIds.get(admin.id);
  const staffId = actualIds.get(staff.id);
  const approverId = actualIds.get(approver.id);
  if (!adminId || !staffId || !approverId) {
    throw new Error("Saffron walkthrough auth id mapping incomplete");
  }

  const asset = fixture.assets.find(
    (a) => a.companyId === company.id && a.source === "upload",
  );
  if (!asset) throw new Error("Saffron walkthrough missing upload asset");

  const anchor = Date.now();
  const sf = company.profile.stagingFixture;
  const packageName = sf.serviceTier;
  const menu0 = sf.menuHighlights[0] ?? "Seasonal shared plate";
  const menu1 = sf.menuHighlights[1] ?? menu0;

  const campaignId = wtUuid("230000", 1);
  const campaignItemId = wtUuid("230100", 1);
  const runId = wtUuid("240000", 1);
  const contentPendingId = wtUuid("210000", 1);
  const contentPublishedId = wtUuid("210000", 2);
  const postScheduledId = wtUuid("220000", 1);
  const postPublishedId = wtUuid("220000", 2);
  const walletId = wtUuid("250000", 1);
  const ledgerId = wtUuid("250100", 1);
  const invoiceId = wtUuid("260000", 1);
  const integrationIgId = wtUuid("270000", 1);
  const integrationGbpId = wtUuid("270000", 2);

  const detailed = buildSaffronDetailedStrategy({
    companyName: company.name,
    suburb: sf.suburb,
    goals: sf.goals,
    menuHighlight: menu0,
    packageName,
    generatedAt: addDays(anchor, -43),
    approvedAt: addDays(anchor, -41),
    approvedByUserId: approverId,
  });

  const strategySummary = `A practical quarterly plan for ${company.name}: build local discovery, turn menu interest into bookings, and keep a reliable approval rhythm.`;
  const strategyChannelPlan =
    "Instagram and Facebook for visual discovery; Google Business Profile for local intent; email for opted-in repeat diners.";

  const ms = company.profile.managedService!;
  const enrichedProfile = {
    ...company.profile,
    managedService: {
      ...ms,
      strategyDueAt: addDays(anchor, -40),
      strategyStartedAt: addDays(anchor, -44),
      strategyCompletedAt: addDays(anchor, -43),
      calendarCompletedAt: addDays(anchor, -42),
      implementationPlanEmailedAt: addDays(anchor, -42),
      lastDeliveryRunId: runId,
      strategySummary,
      strategyChannelPlan,
      strategyPackageName: packageName,
      detailedStrategy: detailed,
      packageChangePendingBilling: false,
    },
    stagingFixture: {
      ...sf,
      connectors: [
        {
          mode: "simulated" as const,
          platform: "Google Business Profile",
          status: "connected" as const,
          externalAccountRef: "sim-gbp-saffron",
          liveOperationsAllowed: false,
        },
        {
          mode: "simulated" as const,
          platform: "Instagram",
          status: "connected" as const,
          externalAccountRef: "sim-ig-saffron",
          liveOperationsAllowed: false,
        },
        {
          mode: "simulated" as const,
          platform: "Meta Ads",
          status: "not_connected" as const,
          externalAccountRef: "sim-ads-saffron",
          liveOperationsAllowed: false,
        },
      ],
    },
  };

  await expectOk(
    "patch Saffron company walkthrough profile",
    sb
      .from("companies")
      .update({
        profile: enrichedProfile,
        updated_at: addDays(anchor, -1),
      })
      .eq("id", company.id),
  );

  await expectOk(
    "upsert Saffron managed delivery run",
    sb.from("managed_delivery_runs").upsert(
      toRow({
        id: runId,
        tenantId: fixture.tenant.id,
        companyId: company.id,
        phase: "active",
        serviceLevel: ms.serviceLevel,
        onboardingCompletedAt: company.createdAt,
        strategyEligibleAt: company.createdAt,
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
        assumptions: ["Walkthrough fixture — no live provider calls."],
        errors: [],
        retryCount: 0,
        statusMessageKey: "delivery_active",
        createdAt: company.createdAt,
        updatedAt: addDays(anchor, -1),
      }),
      { onConflict: "id" },
    ),
  );

  await expectOk(
    "upsert Saffron campaign",
    sb.from("campaigns").upsert(
      toRow({
        id: campaignId,
        companyId: company.id,
        name: `${company.name} local dining month`,
        objective: sf.goals[0] ?? "Local discovery",
        audience: `Diners near ${sf.suburb}`,
        serviceFocus: sf.serviceDetails[0],
        channels: ["Instagram", "Facebook", "Google Business Profile"],
        durationDays: 30,
        startDate: dateAt(anchor, -7),
        endDate: dateAt(anchor, 23),
        keyMessage: `Explore ${company.profile.restaurant?.cuisineStyle ?? "dining"} in ${sf.suburb}.`,
        status: "approved",
        createdById: staffId,
        approvedById: approverId,
        approvedAt: addDays(anchor, -9),
        createdAt: addDays(anchor, -20),
        updatedAt: addDays(anchor, -2),
        campaignType: "local_awareness",
        priority: "medium",
        timezone: sf.timezone,
        budgetAmount: 0,
        currency: "AUD",
        dailySpendLimit: 0,
        geographicScope: company.profile.serviceAreas,
      }),
      { onConflict: "id" },
    ),
  );

  await expectOk(
    "upsert Saffron campaign item",
    sb.from("campaign_items").upsert(
      toRow({
        id: campaignItemId,
        campaignId,
        companyId: company.id,
        dayOffset: 8,
        channel: "Instagram",
        contentType: "social_post",
        title: `${menu0} spotlight`,
        brief: "Use approved visual and clear menu language.",
        status: "published",
        createdAt: company.createdAt,
        updatedAt: addDays(anchor, -4),
      }),
      { onConflict: "id" },
    ),
  );

  const pendingBody = `A closer look at ${menu0}. ${company.profile.brandVoice}`;
  const publishedBody = `This week we are highlighting ${menu1} — a local favourite worth sharing.`;

  await expectOk(
    "upsert Saffron content items",
    sb.from("content_items").upsert(
      [
        toRow({
          id: contentPendingId,
          companyId: company.id,
          type: "social_post",
          title: `${menu0} — ready for your review`,
          body: pendingBody,
          status: "pending_approval",
          createdById: staffId,
          createdAt: addDays(anchor, -3),
          updatedAt: addDays(anchor, -1),
          versions: [
            {
              body: `${pendingBody} First draft.`,
              editedById: staffId,
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
          sourcesUsed: ["fixture://restaurant-profile"],
          estCostUsd: 0,
          assetIds: [asset.id],
          reusePermitted: true,
          reuseChannels: ["Instagram", "Facebook"],
          clientReview: {
            email: approver.email,
            sharedById: staffId,
            sharedAt: addDays(anchor, -2),
            expiresAt: addDays(anchor, 12),
            link: "/client/approvals",
            status: "pending",
          },
        }),
        toRow({
          id: contentPublishedId,
          companyId: company.id,
          type: "social_post",
          title: `${company.name} local menu story`,
          body: publishedBody,
          status: "published",
          createdById: staffId,
          approvedById: approverId,
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
          campaignItemId,
          reusePermitted: true,
          reuseChannels: ["Facebook"],
        }),
      ],
      { onConflict: "id" },
    ),
  );

  await expectOk(
    "link Saffron campaign item to published content",
    sb
      .from("campaign_items")
      .update({ content_id: contentPublishedId, updated_at: addDays(anchor, -4) })
      .eq("id", campaignItemId),
  );

  await expectOk(
    "upsert Saffron scheduled posts",
    sb.from("scheduled_posts").upsert(
      [
        toRow({
          id: postScheduledId,
          contentId: contentPendingId,
          companyId: company.id,
          platform: "Instagram",
          scheduledDate: dateAt(anchor, 5),
          scheduledTime: "10:00",
          status: "scheduled",
          createdById: staffId,
          createdAt: addDays(anchor, -2),
          updatedAt: addDays(anchor, -2),
        }),
        toRow({
          id: postPublishedId,
          contentId: contentPublishedId,
          companyId: company.id,
          platform: "Facebook",
          scheduledDate: dateAt(anchor, -4),
          scheduledTime: "18:00",
          status: "published",
          createdById: staffId,
          createdAt: addDays(anchor, -10),
          updatedAt: addDays(anchor, -4),
        }),
      ],
      { onConflict: "id" },
    ),
  );

  await expectOk(
    "upsert Saffron publishing integrations",
    sb.from("publishing_integrations").upsert(
      [
        toRow({
          id: integrationIgId,
          companyId: company.id,
          platform: "Instagram",
          accountName: `@${sf.fixtureKey.split(":").at(-1)}`,
          encryptedToken: "SIMULATED-NOT-A-TOKEN",
          tokenLastFour: "ig01",
          status: "connected",
          connectedById: adminId,
          connectedAt: addDays(anchor, -30),
          updatedAt: addDays(anchor, -2),
        }),
        toRow({
          id: integrationGbpId,
          companyId: company.id,
          platform: "Google Business Profile",
          accountName: company.name,
          encryptedToken: "SIMULATED-NOT-A-TOKEN",
          tokenLastFour: "gb01",
          status: "connected",
          connectedById: adminId,
          connectedAt: addDays(anchor, -28),
          updatedAt: addDays(anchor, -2),
        }),
      ],
      { onConflict: "id" },
    ),
  );

  const existingWallet = (await expectOk(
    "load Saffron wallet",
    sb
      .from("company_credit_wallets")
      .select("id")
      .eq("company_id", company.id)
      .maybeSingle(),
  )) as { id: string } | null;
  const resolvedWalletId = existingWallet?.id ?? walletId;

  if (existingWallet) {
    await expectOk(
      "update Saffron credit wallet",
      sb
        .from("company_credit_wallets")
        .update({
          balance_usd: 250,
          min_floor_usd: 50,
          auto_top_up_enabled: false,
          top_up_trigger_balance_usd: 50,
          top_up_amount_usd: 100,
          max_top_up_amount_usd: 500,
          max_top_up_per_day: 1,
          updated_at: addDays(anchor, -1),
        })
        .eq("id", resolvedWalletId),
    );
  } else {
    await expectOk(
      "insert Saffron credit wallet",
      sb.from("company_credit_wallets").insert(
        toRow({
          id: walletId,
          tenantId: fixture.tenant.id,
          companyId: company.id,
          balanceUsd: 250,
          minFloorUsd: 50,
          autoTopUpEnabled: false,
          topUpTriggerBalanceUsd: 50,
          topUpAmountUsd: 100,
          maxTopUpAmountUsd: 500,
          maxTopUpPerDay: 1,
          createdAt: company.createdAt,
          updatedAt: addDays(anchor, -1),
        }),
      ),
    );
  }

  await expectOk(
    "upsert Saffron credit ledger",
    sb.from("company_credit_ledger").upsert(
      toRow({
        id: ledgerId,
        tenantId: fixture.tenant.id,
        companyId: company.id,
        walletId: resolvedWalletId,
        kind: "adjustment",
        amountUsd: 250,
        balanceAfterUsd: 250,
        reason: "Opening wallet balance for managed service",
        createdById: adminId,
        createdAt: company.createdAt,
      }),
      { onConflict: "id" },
    ),
  );

  const period = dateAt(anchor, 0).slice(0, 7).replace("-", "");
  await expectOk(
    "upsert Saffron tax invoice",
    sb.from("tax_invoices").upsert(
      toRow({
        id: invoiceId,
        tenantId: fixture.tenant.id,
        companyId: company.id,
        invoiceNumber: `INV-${period}-001`,
        kind: "subscription",
        status: "issued",
        currency: "aud",
        seller: {
          name: fixture.tenant.name,
          email: "billing@staging-fixture.invalid",
          address: "Managed service billing",
        },
        buyer: {
          name: company.name,
          email: approver.email,
          address: company.profile.businessAddress,
        },
        lines: [
          {
            description: `${packageName} marketing package — monthly`,
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
        notes: "Managed marketing subscription for the current period.",
        createdById: adminId,
        createdAt: addDays(anchor, -9),
        updatedAt: addDays(anchor, -8),
      }),
      { onConflict: "id" },
    ),
  );

  await expectOk(
    "upsert Saffron ad budget",
    sb.from("ad_budgets").upsert(
      {
        company_id: company.id,
        monthly_budget_usd: 800,
        allocation: { meta_ads: 0.6, google_ads: 0.4 },
        fee_model: "percent_of_spend",
        fee_percent: 0.12,
        fee_flat_usd: 0,
        updated_by: adminId,
        updated_at: addDays(anchor, -2),
      },
      { onConflict: "company_id" },
    ),
  );
}
