// Cross-tenant isolation self-test (SaaS T7 hardening).
//
// A PERMANENT, runnable fixture that codifies the isolation invariants so they
// can't silently regress. It provisions two THROWAWAY tenants, runs an
// adversarial battery of cross-tenant assertions against the repo + RBAC layer
// (the choke points every action funnels through), then PURGES both tenants so
// the store is left exactly as it was — safe to run against a live demo.
//
// Why the repo/RBAC layer and not the action layer: every company-scoped action
// resolves access through canAccessCompany / accessibleCompanyIds and reads via
// the required-tenantId list functions. Pinning those guarantees pins the
// actions transitively. The action layer's session-bound guards
// (assertAdminCompanyAccess etc.) are exercised by the live browser isolation
// matrix; they can't be driven headlessly without a request/cookie context.
//
// Run it via GET /api/dev/self-test (env/secret-gated). If any check flips to
// false, an isolation guarantee has regressed.

import {
  aiSpendThisMonth,
  aiTokensThisMonth,
  createAdAccount,
  createAsset,
  createCompany,
  createContent,
  createResponse,
  createTenant,
  createUser,
  effectiveAiCapUsd,
  effectiveAiTokenCap,
  getAsset,
  getCompany,
  grantAccess,
  listCompanies,
  listConnectInvites,
  listContent,
  listLeads,
  listResponses,
  logAiRun,
  addMembership,
  exportTenantData,
  getSecuritySettings,
  listCompanyEntitlements,
  purgeTenant,
  updateSecuritySettings,
  upsertCompanyEntitlement,
  getConnectInviteByToken,
  createIntegration,
  createConnectInvite,
  updateCompany,
  upsertLocalProfile,
  getLocalProfile,
} from "@/lib/db";
import { companyHasAddon } from "@/lib/entitlements";
import { listAudit, logAction } from "@/lib/audit";
import { runInServiceContext } from "@/lib/db/service-context";
import { accessibleCompanyIds, canAccessCompany } from "@/lib/auth/rbac";
import {
  ingestAdLead,
  parseMetaLeadPayload,
  verifyMetaLeadSignature,
} from "@/lib/ad-leads";
import {
  checkLiveAdsDispatchNullWhenOff,
  checkLiveAdsResolveFallsBack,
  checkLiveAdsSimulatedWhenOff,
  checkLiveAdsTranslateGoogle,
  checkLiveAdsTranslateMeta,
} from "@/lib/selftest/live-ads";
import { encryptToken } from "@/lib/crypto";
import { createHmac } from "node:crypto";
import {
  bulkCreateConnectInvites,
  completeConnectInvite,
  generateInviteToken,
} from "@/lib/connect-invites";
import {
  assertAiRateLimit,
  checkRate,
  forgetRateCountersContaining,
  rateLimitEnabled,
} from "@/lib/ratelimit";
import { PLANS } from "@/lib/plans";
import { critiqueForPublish, critiqueBlocksScheduling } from "@/lib/ai/critique";
import {
  checkPlatformCharLimits,
  checkPlatformVariantsDistinct,
  checkRepurposeCreatesAiDraft,
  checkRepurposeSourceEligibility,
} from "@/lib/selftest/repurposing";
import {
  filterPortfolioEntries,
  optimalPostWindows,
  seasonalPromptsForMonth,
  type EnrichedCalendarEntry,
} from "@/lib/calendar-intelligence";
import { resolveQueueClockAt } from "@/lib/tenant-timezone";
import {
  buildBusinessProfileAiContext,
  recommendedCampaignGoals,
  resolveBusinessType,
} from "@/lib/business-profiles";
import {
  buildLocalIntelAiContext,
  localIntelCompleteness,
  localIntelSummary,
} from "@/lib/local-area-intel";
import {
  checkGbpChecklistActionable,
  checkGbpNapConsistency,
  checkGbpSimulatedWhenLiveOff,
} from "@/lib/selftest/gbp-audit";
import {
  checkCampaignBuilderGoalProducesPlan,
  checkCampaignBuilderKpisPresent,
  checkCampaignBuilderSpawnsDraftContentNotScheduled,
} from "@/lib/selftest/campaign-builder";
import {
  checkCalendarGapSignal,
  checkDismissPersistsReason,
  checkRankedTopFive,
} from "@/lib/selftest/recommendations";
import {
  checkApprovedCited,
  checkUploadCreatesDraftVersion,
} from "@/lib/selftest/brand-brain-rag";
import {
  checkAgencyNeedsAttentionSort,
  checkFactorsExplainable,
  checkScoreInRange,
} from "@/lib/selftest/health-scores";
import {
  checkOverdueApprovalDetected,
  checkTemplateApplyPrefill,
  checkWorkloadSummaryTotals,
} from "@/lib/selftest/agency-ops";
import {
  checkConvertCreatesDraftOnly,
  checkDismissAudited,
  checkSignalsProduceOpportunity,
} from "@/lib/selftest/ai-mos";
import {
  checkAcceptCreatesDraftOnly as checkCalendarAssistAcceptDraftOnly,
  checkBuildCalendarAssistDrafts,
  checkDismissAudited as checkCalendarAssistDismissAudited,
} from "@/lib/selftest/calendar-assist";
import {
  checkApplyPrefillsProfile,
  checkConsentRequired,
  checkSimulatedWhenLiveOff,
} from "@/lib/selftest/auto-onboarding";
import {
  checkInjectionPatternsStripped,
  checkProviderFailureRecorded,
  checkTenantContextFence,
} from "@/lib/selftest/security-slice";
import {
  checkBookingCreatesShoot,
  checkMarketplaceTenantIsolation,
  checkSimulatedBillingWhenLiveOff,
} from "@/lib/selftest/photo-marketplace";
import {
  checkPublishingHealthInBundle,
  checkPublishingPlatformHealthRows,
  checkPublishingSimWhenLiveOff,
} from "@/lib/selftest/publishing-connectors";
import {
  checkLogRecordsDedupeKey,
  checkRetrySkipsWhenAlreadyPublished,
  checkStaleClaimSafeRecovery,
} from "@/lib/selftest/publish-idempotency";
import { TENANT_ROLE_TIER } from "@/lib/types";
import type { ActingUser, TenantRole, User } from "@/lib/types";

export interface IsoCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface IsoReport {
  ok: boolean; // every check passed AND teardown purged cleanly
  passed: number;
  failed: number;
  purgeFailed: string[]; // tenants whose teardown purge failed — investigate!
  durationMs: number;
  checks: IsoCheck[];
}

// Build the session-resolved ActingUser the RBAC helpers expect (mirrors what
// auth/session.ts stamps from a TenantMember row).
function acting(user: User, tenantId: string, tenantRole: TenantRole): ActingUser {
  return { ...user, tenantId, tenantRole, role: TENANT_ROLE_TIER[tenantRole] };
}

// Rate-limit checks use a FIXED 60s window (reset at wall-clock minute
// boundaries). A measurement that straddles a boundary would see the counter
// reset mid-run and report a spurious failure. Reset the counters and retry so
// the whole measurement lands in one window; return null after repeated
// straddles (astronomically rare — the loop is sub-millisecond) so the caller
// reports a skip, never a false red.
async function measureInOneWindow<T>(
  reset: () => void,
  body: () => Promise<T>,
): Promise<T | null> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    reset();
    const before = Math.floor(Date.now() / 1000 / 60);
    const value = await body();
    const after = Math.floor(Date.now() / 1000 / 60);
    if (before === after) return value;
  }
  return null;
}

export async function runIsolationSelfTest(): Promise<IsoReport> {
  const startedAt = Date.now();
  const checks: IsoCheck[] = [];
  const expect = async (
    name: string,
    fn: () => Promise<{ ok: boolean; detail: string }>,
  ): Promise<void> => {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({
        name,
        ok: false,
        detail: `threw: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  let tenantAId: string | undefined;
  let tenantBId: string | undefined;
  const purgeFailed: string[] = [];

  try {
    // ---- Provision two isolated throwaway tenants ----------------------------
    const tA = await createTenant({ name: "SelfTest A", kind: "agency", plan: "starter", status: "active" });
    tenantAId = tA.id;
    const tB = await createTenant({ name: "SelfTest B", kind: "agency", plan: "agency", status: "active" });
    tenantBId = tB.id;

    // The battery runs session-less (an API route, no signed-in user). Under
    // Supabase the company-scoped repo calls would otherwise hit the RLS client
    // with no auth.uid() and be refused — run them in the same trusted service
    // context the cron uses. Every assertion below tests APP-LAYER scoping
    // (required-tenantId lists, canAccessCompany), which is exactly the layer
    // service-role code paths rely on; RLS itself is covered by the live
    // leak-test battery. (In-memory mode: the context is inert.)
    await runInServiceContext(tA.id, async () => {
    const suffix = tA.id; // unique per run → no global-identity collisions
    const ownerAUser = await createUser({ email: `owner-a+${suffix}@selftest.dev`, name: "Owner A", role: "user" });
    const ownerBUser = await createUser({ email: `owner-b+${suffix}@selftest.dev`, name: "Owner B", role: "user" });
    const memberAUser = await createUser({ email: `member-a+${suffix}@selftest.dev`, name: "Member A", role: "user" });
    await addMembership({ tenantId: tA.id, userId: ownerAUser.id, role: "owner" });
    await addMembership({ tenantId: tB.id, userId: ownerBUser.id, role: "owner" });
    await addMembership({ tenantId: tA.id, userId: memberAUser.id, role: "member" });

    const companyA = await createCompany({ tenantId: tA.id, name: "Company A", createdBy: ownerAUser.id });
    const companyB = await createCompany({ tenantId: tB.id, name: "Company B", createdBy: ownerBUser.id });
    await grantAccess(memberAUser.id, companyA.id); // member A: access to company A only

    const ownerA = acting(ownerAUser, tA.id, "owner");
    const ownerB = acting(ownerBUser, tB.id, "owner");
    const memberA = acting(memberAUser, tA.id, "member");

    const contentA = await createContent({
      companyId: companyA.id, type: "social_post", title: "A post", body: "Body A",
      status: "ai_draft", createdById: ownerAUser.id,
    });
    const contentB = await createContent({
      companyId: companyB.id, type: "social_post", title: "B post", body: "Body B",
      status: "ai_draft", createdById: ownerBUser.id,
    });

    await logAction({ id: ownerAUser.id, email: ownerAUser.email, tenantId: tA.id }, "selftest.action", {
      companyId: companyA.id, targetType: "content", targetId: contentA.id,
    });
    await logAction({ id: ownerBUser.id, email: ownerBUser.email, tenantId: tB.id }, "selftest.action", {
      companyId: companyB.id, targetType: "content", targetId: contentB.id,
    });

    // ---- Assertion battery ---------------------------------------------------

    await expect("companies.listScopedToTenant", async () => {
      const a = (await listCompanies(tA.id)).map((c) => c.id);
      const b = (await listCompanies(tB.id)).map((c) => c.id);
      const ok = a.includes(companyA.id) && !a.includes(companyB.id) && b.includes(companyB.id) && !b.includes(companyA.id);
      return { ok, detail: `A=${JSON.stringify(a)} B=${JSON.stringify(b)}` };
    });

    await expect("canAccessCompany.crossTenantDenied", async () => {
      const aToB = await canAccessCompany(ownerA, companyB.id);
      const bToA = await canAccessCompany(ownerB, companyA.id);
      return { ok: aToB === false && bToA === false, detail: `ownerA→B=${aToB} ownerB→A=${bToA} (both must be false)` };
    });

    await expect("canAccessCompany.ownTenantAllowed", async () => {
      const aToA = await canAccessCompany(ownerA, companyA.id);
      const memberToA = await canAccessCompany(memberA, companyA.id);
      return { ok: aToA === true && memberToA === true, detail: `ownerA→A=${aToA} memberA→A=${memberToA} (both must be true)` };
    });

    await expect("canAccessCompany.memberDeniedOtherTenant", async () => {
      const memberToB = await canAccessCompany(memberA, companyB.id);
      return { ok: memberToB === false, detail: `memberA→B=${memberToB} (must be false)` };
    });

    await expect("accessibleCompanyIds.scoped", async () => {
      const owner = await accessibleCompanyIds(ownerA);
      const member = await accessibleCompanyIds(memberA);
      const ok = owner.length === 1 && owner[0] === companyA.id && member.length === 1 && member[0] === companyA.id;
      return { ok, detail: `ownerA=${JSON.stringify(owner)} memberA=${JSON.stringify(member)} (each must be [${companyA.id}])` };
    });

    await expect("content.listScopedToTenant", async () => {
      const a = (await listContent(tA.id)).map((c) => c.id);
      const b = (await listContent(tB.id)).map((c) => c.id);
      const ok = a.includes(contentA.id) && !a.includes(contentB.id) && b.includes(contentB.id) && !b.includes(contentA.id);
      return { ok, detail: `A has ${a.length}, leak=${a.includes(contentB.id)}` };
    });

    await expect("audit.listScopedToTenant", async () => {
      const a = await listAudit(tA.id);
      const leaked = a.some((e) => e.tenantId === tB.id);
      const hasOwn = a.some((e) => e.targetId === contentA.id);
      return { ok: !leaked && hasOwn, detail: `A entries=${a.length} leakFromB=${leaked} hasOwn=${hasOwn}` };
    });

    await expect("securitySettings.crisisModeIndependent", async () => {
      await updateSecuritySettings(tA.id, { crisisMode: true });
      const a = await getSecuritySettings(tA.id);
      const b = await getSecuritySettings(tB.id);
      return { ok: a.crisisMode === true && b.crisisMode === false, detail: `A.crisis=${a.crisisMode} B.crisis=${b.crisisMode} (B must stay false)` };
    });

    await expect("aiCap.perTenantPlan", async () => {
      // B uncapped by admin → effective cap = its plan allowance; A stays on its
      // own plan+admin cap. The two must reflect their OWN tenant, never merge.
      await updateSecuritySettings(tB.id, { aiMonthlyCapUsd: 0 });
      const capA = await effectiveAiCapUsd(tA.id); // starter plan (25) vs default admin cap (50) → 25
      const capB = await effectiveAiCapUsd(tB.id); // agency plan (100), admin uncapped → 100
      return { ok: capA === 25 && capB === 100, detail: `capA=$${capA} (want 25) capB=$${capB} (want 100)` };
    });

    await expect("aiSpend.perTenantIsolated", async () => {
      await logAiRun({
        tenantId: tA.id, companyId: companyA.id, userId: ownerAUser.id, kind: "content_draft",
        model: "selftest", promptSummary: "x", outputChars: 10, sourcesUsed: [], estCostUsd: 5,
      });
      const spendA = await aiSpendThisMonth(tA.id);
      const spendB = await aiSpendThisMonth(tB.id);
      return { ok: spendA >= 5 && spendB === 0, detail: `spendA=$${spendA} spendB=$${spendB} (B must be 0)` };
    });

    await expect("templates.tenantWideIsolated", async () => {
      // A tenant-wide response (companyId null) belongs to A only — B must never
      // see it. (Platform-library rows, tenantId null, are shared by design and
      // are covered by the live browser matrix; not created here so nothing
      // persists past the purge.)
      await createResponse({
        tenantId: tA.id, companyId: null, category: "compliment_thanks",
        title: "A tenant template", responseText: "Thanks from A", active: true,
      });
      const bSees = (await listResponses(tB.id)).some((r) => r.title === "A tenant template");
      const aSees = (await listResponses(tA.id)).some((r) => r.title === "A tenant template");
      return { ok: aSees === true && bSees === false, detail: `A sees=${aSees} B sees=${bSees} (B must be false)` };
    });

    await expect("entitlements.listScopedToTenant", async () => {
      // An add-on enabled on company A belongs to tenant A only — the tenant list
      // must never surface tenant B's (or vice-versa).
      await upsertCompanyEntitlement({ companyId: companyA.id, addonId: "video", status: "active", enabledById: ownerAUser.id });
      const a = (await listCompanyEntitlements(tA.id)).map((e) => `${e.companyId}:${e.addonId}`);
      const b = (await listCompanyEntitlements(tB.id)).map((e) => `${e.companyId}:${e.addonId}`);
      const key = `${companyA.id}:video`;
      return { ok: a.includes(key) && !b.includes(key), detail: `A has=${a.includes(key)} B leak=${b.includes(key)} (B must be false)` };
    });

    await expect("entitlements.gateReflectsState", async () => {
      // companyHasAddon is the deliverable-module gate: true only for an ACTIVE
      // add-on, and disabling flips it back to false (fail-closed).
      const onVideo = await companyHasAddon(companyA.id, "video"); // enabled above
      const onPhoto = await companyHasAddon(companyA.id, "photo"); // never enabled
      await upsertCompanyEntitlement({ companyId: companyA.id, addonId: "video", status: "cancelled", enabledById: ownerAUser.id });
      const afterDisable = await companyHasAddon(companyA.id, "video");
      const ok = onVideo === true && onPhoto === false && afterDisable === false;
      return { ok, detail: `video=${onVideo} photo=${onPhoto} afterDisable=${afterDisable} (want true,false,false)` };
    });

    await expect("adLeads.metaSignatureValid", async () => {
      const body = '{"entry":[{"changes":[{"field":"leadgen","value":{"leadgen_id":"1"}}]}]}';
      const secret = "selftest-meta-secret";
      const sig = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
      const ok =
        verifyMetaLeadSignature(body, sig, secret) &&
        !verifyMetaLeadSignature(body, "sha256=deadbeef", secret);
      return { ok, detail: ok ? "valid sig accepted, bad sig rejected" : "signature check failed" };
    });

    await expect("adLeads.ingestIdempotent", async () => {
      const extAcct = `act_selftest_${suffix}`;
      await createAdAccount({
        companyId: companyA.id,
        platform: "meta_ads",
        accountName: "SelfTest Meta",
        externalAccountId: extAcct,
        encryptedToken: encryptToken("selftest-token"),
        tokenLastFour: "test",
        status: "connected",
        connectedById: ownerAUser.id,
      });
      const payload = {
        entry: [{
          changes: [{
            field: "leadgen",
            value: { leadgen_id: `lg_${suffix}`, ad_account_id: extAcct, created_time: 1710000000 },
          }],
        }],
      };
      const parsed = parseMetaLeadPayload(payload);
      if (!parsed) return { ok: false, detail: "parseMetaLeadPayload returned null" };
      const first = await ingestAdLead(parsed);
      const second = await ingestAdLead(parsed);
      const leads = (await listLeads(tA.id, companyA.id)).filter((l) => l.externalLeadId === parsed.externalLeadId);
      const ok =
        first.ok && first.created === true &&
        second.ok && !second.created && second.reason === "duplicate" &&
        leads.length === 1;
      const secondReason = second.ok && !second.created ? second.reason : "?";
      return {
        ok,
        detail: `first.created=${first.ok && first.created ? true : false} second.reason=${secondReason} count=${leads.length}`,
      };
    });

    await expect("connectInvites.listScopedToTenant", async () => {
      const { created } = await bulkCreateConnectInvites({
        tenantId: tA.id,
        companyIds: [companyA.id],
        platforms: ["TikTok"],
        invitedById: ownerAUser.id,
      });
      await runInServiceContext(tB.id, async () => {
        await bulkCreateConnectInvites({
          tenantId: tB.id,
          companyIds: [companyB.id],
          platforms: ["Facebook"],
          invitedById: ownerBUser.id,
        });
      });
      const aIds = (await listConnectInvites(tA.id)).map((i) => i.id);
      const bIds = (await listConnectInvites(tB.id)).map((i) => i.id);
      const ok =
        created.length === 1 &&
        aIds.includes(created[0]!.id) &&
        !aIds.some((id) => bIds.includes(id));
      return { ok, detail: `A invites=${aIds.length} B invites=${bIds.length}` };
    });

    await expect("connectInvite.bulkSkipsConnected", async () => {
      await createIntegration({
        companyId: companyA.id,
        platform: "Instagram",
        accountName: "A IG",
        encryptedToken: encryptToken("demo-ig-token"),
        tokenLastFour: "oken",
        status: "connected",
        connectedById: ownerAUser.id,
      });
      const { created, skipped } = await bulkCreateConnectInvites({
        tenantId: tA.id,
        companyIds: [companyA.id],
        platforms: ["Instagram", "TikTok"],
        invitedById: ownerAUser.id,
        skipPending: false,
      });
      const skippedIg = skipped.some((s) => s.platform === "Instagram" && s.reason === "already connected");
      const createdTk = created.some((c) => c.platform === "TikTok");
      return {
        ok: skippedIg && createdTk,
        detail: `skippedIg=${skippedIg} createdTikTok=${createdTk}`,
      };
    });

    await expect("connectInvite.completedNotReusable", async () => {
      const token = generateInviteToken();
      const invite = await createConnectInvite({
        tenantId: tA.id,
        companyId: companyA.id,
        platform: "TikTok",
        token,
        status: "pending",
        invitedById: ownerAUser.id,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const byToken = await getConnectInviteByToken(token);
      const integration = await createIntegration({
        companyId: companyA.id,
        platform: "TikTok",
        accountName: "A TikTok",
        encryptedToken: encryptToken("demo-tk"),
        tokenLastFour: "demo",
        status: "connected",
        connectedById: ownerAUser.id,
      });
      const done = await completeConnectInvite(invite.id, integration.id);
      const again = await completeConnectInvite(invite.id, integration.id);
      return {
        ok: !!byToken && byToken.id === invite.id && done?.status === "completed" && !again,
        detail: `found=${!!byToken} done=${done?.status} second=${!!again}`,
      };
    });

    await expect("aiHardening.tokenCapPerPlan", async () => {
      await logAiRun({
        tenantId: tA.id, companyId: companyA.id, userId: ownerAUser.id, kind: "content_draft",
        model: "selftest", promptSummary: "tok", outputChars: 100, sourcesUsed: [],
        estCostUsd: 0, inputTokens: 50_000, outputTokens: 50_000,
      });
      const capA = await effectiveAiTokenCap(tA.id);
      const capB = await effectiveAiTokenCap(tB.id);
      const tokA = await aiTokensThisMonth(tA.id);
      const tokB = await aiTokensThisMonth(tB.id);
      return {
        ok: capA === PLANS.starter.limits.aiTokensPerMonth && capB === PLANS.agency.limits.aiTokensPerMonth && tokA >= 100_000 && tokB === 0,
        detail: `capA=${capA} capB=${capB} tokA=${tokA} tokB=${tokB}`,
      };
    });

    await expect("aiHardening.critiqueBlocksOversized", async () => {
      const company = await getCompany(companyA.id);
      if (!company) return { ok: false, detail: "company missing" };
      const longBody = "x".repeat(3000);
      const critique = await critiqueForPublish({
        content: {
          id: contentA.id,
          companyId: companyA.id,
          type: "social_post",
          title: "Long post",
          body: longBody,
          status: "approved",
          createdById: ownerAUser.id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          versions: [],
        },
        company,
        platform: "Instagram",
      });
      return {
        ok: critiqueBlocksScheduling(critique) && critique.notes.some((n) => n.severity === "block"),
        detail: `status=${critique.status} blocks=${critique.notes.filter((n) => n.severity === "block").length}`,
      };
    });

    await expect("aiHardening.assetMetadataPersists", async () => {
      const asset = await createAsset({
        companyId: companyA.id,
        name: "SelfTest AI asset",
        assetType: "image",
        source: "ai_generated",
        tags: ["ai-visuals"],
        usageRights: {
          owner: "AI-generated (platform)",
          licenceType: "owned",
          consentObtained: true,
          allowedChannels: [],
          restrictions: "test",
        },
        status: "pending_approval",
        createdById: ownerAUser.id,
        aiModel: "template-test",
        aiPrompt: "selftest prompt",
        estCostUsd: 0.01,
        sourcesUsed: ["Brand Brain: company profile"],
      });
      const loaded = await getAsset(asset.id);
      const ok =
        loaded?.aiModel === "template-test" &&
        loaded?.aiPrompt === "selftest prompt" &&
        loaded?.estCostUsd === 0.01 &&
        loaded?.sourcesUsed?.includes("Brand Brain: company profile");
      return { ok: !!ok, detail: `aiModel=${loaded?.aiModel} cost=${loaded?.estCostUsd}` };
    });

    await expect("repurpose.sourceEligibility", () => checkRepurposeSourceEligibility());

    await expect("repurpose.platformVariantsDistinct", () =>
      checkPlatformVariantsDistinct(),
    );

    await expect("repurpose.charLimitsRespected", () => checkPlatformCharLimits());

    await expect("repurpose.createsAiDraftLinked", () =>
      checkRepurposeCreatesAiDraft(companyA.id, ownerAUser.id),
    );

    await expect("calendarIntelligence.seasonalPromptsAu", async () => {
      const prompts = seasonalPromptsForMonth("2026-07", ["accommodation", "cafe"]);
      const winter = prompts.some((p) => /school holiday/i.test(p.title));
      const clock = resolveQueueClockAt(new Date().toISOString(), { timezone: "Australia/Sydney" });
      return {
        ok: prompts.length >= 2 && winter && clock.clockLabel === "Australia/Sydney",
        detail: `count=${prompts.length} winter=${winter} tz=${clock.clockLabel}`,
      };
    });

    await expect("calendarIntelligence.optimalWindowsTenantScoped", async () => {
      const windowsA = await optimalPostWindows(tA.id, { companyIds: [companyA.id], limit: 3 });
      const windowsB = await optimalPostWindows(tB.id, { companyIds: [companyB.id], limit: 3 });
      const leak = windowsA.some((w) => w.companyId === companyB.id);
      return {
        ok: windowsA.length > 0 && !leak && windowsB.every((w) => !w.companyId || w.companyId === companyB.id),
        detail: `A=${windowsA.length} B=${windowsB.length} leak=${leak}`,
      };
    });

    await expect("calendarIntelligence.portfolioFilterBusinessType", async () => {
      const entries: EnrichedCalendarEntry[] = [
        {
          id: "e1",
          kind: "post",
          date: "2026-07-10",
          title: "Retail post",
          status: "scheduled",
          platform: "Facebook",
          companyId: companyA.id,
          companyName: "A Co",
          businessType: "Supermarket & Grocery Retail",
          href: "/content/x",
          preview: "",
          warnings: [],
        },
        {
          id: "e2",
          kind: "item",
          date: "2026-07-12",
          title: "Dental planned",
          status: "planned",
          platform: "Instagram",
          companyId: companyB.id,
          companyName: "B Co",
          businessType: "Health & Dental",
          href: "/campaigns/y",
          preview: "",
          warnings: [],
        },
      ];
      const retailOnly = filterPortfolioEntries(entries, { businessType: "grocery" });
      const igOnly = filterPortfolioEntries(entries, { channel: "instagram" });
      return {
        ok: retailOnly.length === 1 && retailOnly[0].id === "e1" && igOnly.length === 1 && igOnly[0].id === "e2",
        detail: `retail=${retailOnly.length} ig=${igOnly.length}`,
      };
    });

    await expect("gbpAudit.napConsistency", () => checkGbpNapConsistency());

    await expect("gbpAudit.simulatedWhenLiveOff", () => checkGbpSimulatedWhenLiveOff());

    await expect("gbpAudit.checklistActionable", () => checkGbpChecklistActionable());

    await expect("liveAds.simulatedWhenOff", () => checkLiveAdsSimulatedWhenOff());
    await expect("liveAds.dispatchNullWhenOff", () => checkLiveAdsDispatchNullWhenOff());
    await expect("liveAds.translateMeta", () => checkLiveAdsTranslateMeta());
    await expect("liveAds.translateGoogle", () => checkLiveAdsTranslateGoogle());
    await expect("liveAds.resolveFallsBack", () => checkLiveAdsResolveFallsBack());

    await expect("analytics.simulatedWhenLiveOff", () => checkAnalyticsSimulatedWhenLiveOff());

    await expect("analytics.fetchNullWhenLiveOff", () => checkFetchLiveMetricsNullWhenOff());

    await expect("analytics.platformPostIdParse", async () => checkPlatformPostIdParse());

    await expect("analytics.resolveDeterministic", () => checkResolvePostMetricsDeterministic());

    await expect("analytics.googleRoutedWhenLiveOff", () => checkGooglePlatformRoutedWhenLive());

    await expect("campaignBuilder.goalProducesPlan", () =>
      checkCampaignBuilderGoalProducesPlan(),
    );

    await expect("campaignBuilder.kpisPresent", () => checkCampaignBuilderKpisPresent());

    await expect("campaignBuilder.spawnsDraftContentNotScheduled", () =>
      checkCampaignBuilderSpawnsDraftContentNotScheduled(
        companyA.id,
        ownerAUser.id,
        tenantAId!,
      ),
    );

    await expect("recommendations.rankedTopFive", () => checkRankedTopFive());

    await expect("recommendations.calendarGapSignal", () => checkCalendarGapSignal());

    await expect("recommendations.dismissPersistsReason", () => checkDismissPersistsReason());

    await expect("brandBrainRag.uploadCreatesDraftVersion", () =>
      checkUploadCreatesDraftVersion(companyA.id, ownerAUser.id),
    );

    await expect("brandBrainRag.approvedCited", () =>
      checkApprovedCited(companyA.id, ownerAUser.id),
    );

    await expect("healthScores.scoreInRange", () => checkScoreInRange());

    await expect("healthScores.factorsExplainable", () => checkFactorsExplainable());

    await expect("healthScores.agencyNeedsAttentionSort", () => checkAgencyNeedsAttentionSort());

    await expect("agencyOps.overdueApprovalDetected", () => checkOverdueApprovalDetected());

    await expect("agencyOps.workloadSummaryTotals", () => checkWorkloadSummaryTotals());

    await expect("agencyOps.templateApplyPrefill", () => checkTemplateApplyPrefill());

    await expect("aiMos.signalsProduceOpportunity", () => checkSignalsProduceOpportunity());

    await expect("aiMos.convertCreatesDraftOnly", () =>
      checkConvertCreatesDraftOnly(companyA.id, ownerAUser.id, tenantAId!),
    );

    await expect("calendarAssist.buildDrafts", () => checkBuildCalendarAssistDrafts());

    await expect("calendarAssist.acceptDraftOnly", () =>
      checkCalendarAssistAcceptDraftOnly(companyA.id, ownerAUser.id, tenantAId!),
    );

    await expect("calendarAssist.dismissAudited", () =>
      checkCalendarAssistDismissAudited(companyA.id, ownerAUser.id, tenantAId!),
    );

    await expect("aiMos.dismissAudited", () =>
      checkDismissAudited(companyA.id, ownerAUser.id, tenantAId!),
    );

    await expect("autoOnboarding.consentRequired", () => checkConsentRequired());

    await expect("autoOnboarding.simulatedWhenLiveOff", () =>
      checkSimulatedWhenLiveOff(),
    );

    await expect("autoOnboarding.applyPrefillsProfile", () =>
      checkApplyPrefillsProfile(),
    );

    await expect("securitySlice.injectionPatternsStripped", () => checkInjectionPatternsStripped());

    await expect("securitySlice.tenantContextFence", () => checkTenantContextFence());

    await expect("securitySlice.providerFailureRecorded", () => checkProviderFailureRecorded());

    await expect("publishingConnectors.simWhenLiveOff", () => checkPublishingSimWhenLiveOff());

    await expect("publishingConnectors.platformHealthRows", () =>
      checkPublishingPlatformHealthRows(),
    );

    await expect("publishingConnectors.healthInBundle", () => checkPublishingHealthInBundle());

    await expect("photoMarketplace.bookingCreatesShoot", () => checkBookingCreatesShoot());

    await expect("photoMarketplace.simulatedBillingWhenLiveOff", () =>
      checkSimulatedBillingWhenLiveOff(),
    );

    await expect("photoMarketplace.tenantIsolation", () => checkMarketplaceTenantIsolation());

    await expect("publishIdempotency.retrySkipsWhenAlreadyPublished", () =>
      checkRetrySkipsWhenAlreadyPublished(),
    );

    await expect("publishIdempotency.staleClaimSafeRecovery", () =>
      checkStaleClaimSafeRecovery(),
    );

    await expect("publishIdempotency.logRecordsDedupeKey", () =>
      checkLogRecordsDedupeKey(),
    );

    await expect("businessProfiles.retailAiContext", async () => {
      const company = await getCompany(companyA.id);
      if (!company) return { ok: false, detail: "company missing" };
      await updateCompany(companyA.id, {
        profile: {
          ...company.profile,
          businessType: "retail",
          retail: {
            productCategories: ["Fresh produce"],
            heroProducts: ["Sourdough"],
            promotions: ["Weekly specials"],
            seasons: ["Winter soups"],
          },
        },
      });
      const updated = await getCompany(companyA.id);
      if (!updated) return { ok: false, detail: "update failed" };
      const ctx = buildBusinessProfileAiContext(updated);
      const ok =
        resolveBusinessType(updated) === "retail" &&
        ctx.includes("Hero products: Sourdough") &&
        recommendedCampaignGoals(updated).some((g) => /catalogue|foot traffic/i.test(g));
      return { ok, detail: `type=${resolveBusinessType(updated)} ctxLen=${ctx.length}` };
    });

    await expect("businessProfiles.hotelAiContext", async () => {
      const company = await getCompany(companyA.id);
      if (!company) return { ok: false, detail: "company missing" };
      await updateCompany(companyA.id, {
        profile: {
          ...company.profile,
          businessType: "hotel",
          hotel: {
            roomTypes: ["Queen standard"],
            packages: ["Wine weekend"],
            amenities: ["Free Wi-Fi"],
            occupancyLanguage: "Limited rooms — book direct",
          },
        },
      });
      const updated = await getCompany(companyA.id);
      if (!updated) return { ok: false, detail: "update failed" };
      const ctx = buildBusinessProfileAiContext(updated);
      const ok =
        resolveBusinessType(updated) === "hotel" &&
        ctx.includes("Occupancy language") &&
        ctx.includes("Wine weekend");
      return { ok, detail: `type=${resolveBusinessType(updated)}` };
    });

    await expect("localIntel.completenessAndSummary", async () => {
      await upsertLocalProfile({
        companyId: companyA.id,
        suburbs: ["Millbrook", "Riverstone"],
        competitors: ["Coles"],
        localEvents: "School fete",
        searchTerms: ["iga near me"],
        buyingTriggers: "Catalogue Wednesday",
      });
      const local = await getLocalProfile(companyA.id);
      if (!local) return { ok: false, detail: "profile missing" };
      const { score, missing } = localIntelCompleteness(local);
      const summary = localIntelSummary(local);
      const ctx = buildLocalIntelAiContext(local);
      const ok =
        score >= 60 &&
        missing.some((m: string) => /demographics|seasonal/i.test(m)) &&
        summary.includes("2 suburbs") &&
        ctx.includes("Suburbs: Millbrook, Riverstone") &&
        ctx.includes("Buying triggers: Catalogue Wednesday");
      return { ok, detail: `score=${score} missing=${missing.length}` };
    });

    await expect("localIntel.keyScopePreservesExtended", async () => {
      await upsertLocalProfile({
        companyId: companyA.id,
        suburbs: ["A"],
        competitors: [],
        demographics: "Families",
        commonNeeds: "Weekly shop",
        searchTerms: [],
        seasonalPatterns: "Winter soups",
      });
      const before = await getLocalProfile(companyA.id);
      await upsertLocalProfile({
        companyId: companyA.id,
        suburbs: ["A", "B"],
        competitors: ["Rival"],
        demographics: before?.demographics,
        commonNeeds: before?.commonNeeds,
        searchTerms: ["local"],
        seasonalPatterns: before?.seasonalPatterns,
      });
      const after = await getLocalProfile(companyA.id);
      const ok =
        after?.suburbs.length === 2 &&
        after?.demographics === "Families" &&
        after?.seasonalPatterns === "Winter soups";
      return { ok, detail: `suburbs=${after?.suburbs.length}` };
    });

    await expect("export.noCrossTenantLeak", async () => {
      // The strongest end-to-end check: A's full data export must not contain a
      // single identifier from tenant B.
      const dump = JSON.stringify(await exportTenantData(tA.id));
      const needles = [tB.id, companyB.id, contentB.id, ownerBUser.id, ownerBUser.email];
      const leaked = needles.filter((n) => dump.includes(n));
      return { ok: leaked.length === 0, detail: leaked.length ? `LEAKED: ${JSON.stringify(leaked)}` : "no B identifiers in A's export" };
    });

    // The three checks below assert that limiting is ENFORCED, so they only make
    // sense when it's on. Under the documented CC_RATE_LIMIT=off escape hatch
    // (load tests/demos) they'd falsely fail — report them as skipped instead of
    // signalling a phantom isolation regression (→ HTTP 500).
    const rlOn = rateLimitEnabled();
    const OFF = { ok: true, detail: "skipped (CC_RATE_LIMIT=off)" };
    const STRADDLED = { ok: true, detail: "skipped (rate-limit window boundary straddle)" };

    await expect("rateLimit.enforcesLimit", async () => {
      if (!rlOn) return OFF;
      const key = `enforce-${suffix}`;
      const r = await measureInOneWindow(
        () => forgetRateCountersContaining([key]),
        async () => [
          checkRate("selftest", key, 3, 60),
          checkRate("selftest", key, 3, 60),
          checkRate("selftest", key, 3, 60),
          checkRate("selftest", key, 3, 60),
        ] as const,
      );
      if (!r) return STRADDLED;
      const [d1, d2, d3, d4] = r;
      const ok = d1.allowed && d2.allowed && d3.allowed && !d4.allowed && d4.retryAfterSeconds > 0;
      return { ok, detail: `allowed=[${d1.allowed},${d2.allowed},${d3.allowed}] 4th=${d4.allowed} retryAfter=${d4.retryAfterSeconds}` };
    });

    await expect("aiRateLimit.bitesAtPlanLimitAndIsolates", async () => {
      if (!rlOn) return OFF;
      // The WIRED per-tenant/plan guard (used at every AI entry point): tenant A
      // is on starter, so it must allow exactly the plan's aiPerMinute and
      // reject the next — while agency tenant B keeps its own headroom.
      const limit = PLANS.starter.limits.aiPerMinute;
      const r = await measureInOneWindow(
        () => forgetRateCountersContaining([tA.id, tB.id]),
        async () => {
          let allowed = 0;
          let blocked = false;
          for (let i = 0; i < limit + 1; i += 1) {
            try {
              await assertAiRateLimit(tA.id);
              allowed += 1;
            } catch {
              blocked = true;
            }
          }
          let bHasHeadroom = true;
          try {
            await assertAiRateLimit(tB.id); // B (agency) untouched by A's exhaustion
          } catch {
            bHasHeadroom = false;
          }
          return { allowed, blocked, bHasHeadroom };
        },
      );
      if (!r) return STRADDLED;
      return {
        ok: r.allowed === limit && r.blocked && r.bHasHeadroom,
        detail: `A allowed=${r.allowed}/${limit} blocked=${r.blocked} B headroom=${r.bHasHeadroom}`,
      };
    });

    await expect("rateLimit.perKeyIsolated", async () => {
      if (!rlOn) return OFF;
      // Exhausting one tenant's bucket must NOT throttle another's (this is why
      // the rate-limit key is the tenantId).
      const keyA = `iso-a-${suffix}`;
      const keyB = `iso-b-${suffix}`;
      const r = await measureInOneWindow(
        () => forgetRateCountersContaining([keyA, keyB]),
        async () => {
          checkRate("selftest", keyA, 1, 60); // consume A's single hit
          const aBlocked = !checkRate("selftest", keyA, 1, 60).allowed; // A now blocked
          const bAllowed = checkRate("selftest", keyB, 1, 60).allowed; // B untouched
          return { aBlocked, bAllowed };
        },
      );
      if (!r) return STRADDLED;
      return { ok: r.aBlocked && r.bAllowed, detail: `A blocked=${r.aBlocked} B allowed=${r.bAllowed} (both must be true)` };
    });

    await expect("rateLimit.atomicMultiUnitCharge", async () => {
      if (!rlOn) return OFF;
      // Studio compare mode charges N generations atomically (cost > 1). A batch
      // that doesn't fit is denied WITHOUT consuming, so a smaller one still fits.
      const key = `cost-${suffix}`;
      const r = await measureInOneWindow(
        () => forgetRateCountersContaining([key]),
        async () => {
          const a = checkRate("selftest", key, 5, 60, 3); // 3 of 5 → allowed
          const b = checkRate("selftest", key, 5, 60, 3); // 3+3=6 > 5 → denied, no consume
          const c = checkRate("selftest", key, 5, 60, 2); // 3+2=5 → allowed
          return { a: a.allowed, b: b.allowed, c: c.allowed };
        },
      );
      if (!r) return STRADDLED;
      return { ok: r.a && !r.b && r.c, detail: `cost3=${r.a} cost3again=${r.b} cost2=${r.c} (want true,false,true)` };
    });
    }); // end runInServiceContext
  } finally {
    // Always tear both tenants down — even if provisioning/asserting threw — so
    // the fixture never leaks throwaway data into the store it's protecting.
    // A purge failure is REPORTED (ok:false), never swallowed: a leftover
    // ACTIVE throwaway tenant would be processed by every future cron tick.
    for (const id of [tenantAId, tenantBId]) {
      if (!id) continue;
      try {
        await purgeTenant(id);
      } catch (e) {
        purgeFailed.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // Leave the rate-limit store exactly as we found it too — purgeTenant only
    // touches the DB store. Every counter this run created keys on a throwaway
    // tenant id (the AI buckets on tA/tB directly; the "selftest" buckets via the
    // suffix, which IS tA.id), so forgetting both ids clears them all.
    forgetRateCountersContaining(
      [tenantAId, tenantBId].filter((x): x is string => Boolean(x)),
    );
  }

  const failed = checks.filter((c) => !c.ok).length;
  return {
    ok: failed === 0 && purgeFailed.length === 0,
    passed: checks.length - failed,
    failed,
    purgeFailed,
    durationMs: Date.now() - startedAt,
    checks,
  };
}
