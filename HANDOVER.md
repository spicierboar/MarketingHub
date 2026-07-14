# Marketing Command Centre — Handover

> ## ▶ NEXT SESSION — START HERE (2026-07-14, **STAGING · LEGAL PUBLISHER RBAC BUG · 0046 PASTE? · PRICING PARKED · W6 WAITING**)
>
> **Path:** `F:/MarketingHub/command-centre` · **Branch:** `staging` · Vercel Preview = staging · live flags **OFF**
>
> ### STATE
> | Item | Status |
> |------|--------|
> | Git tip | **`43d2508`+** — always verify `git rev-parse --short origin/staging` |
> | Staging URL | `https://marketing-hub-git-staging-nickmadahar-7174s-projects.vercel.app` |
> | Staging Supabase | **`ccgkbyboobctqjhjiejt`** (NOT live) · migrations **0001–0045** + **paste 0046** (`legal_docs_kind`) if not yet applied |
> | Staging login | Magic link rate-limited → **`/dev` staging quick login** (prefer agency seat e.g. `development@tglt.com.au`) |
> | Tenant name | **Staging Agency** (repaired; do **not** rename agency to Viya — Viya is a **client**) |
> | Vercel Preview Protection | **OFF** (owner) so staging URL works without Vercel auth |
> | Live / mangotickle.com.au / `*_LIVE` | **PARKED** · W6 Google still waiting |
>
> ### DONE this wave (verify SHAs on `origin/staging`)
> - **Client-only onboarding:** details → package → terms → payment; website-first + Prefill (`formNoValidate` fix); agency vs client tenancy — platform **agency seat**; new clients under **Staging Agency** (not rename agency → Viya)
> - **Staging deploy recovery:** `024203e` typecheck fail → follow-up **`51db48d`** live; tenant name repaired to Staging Agency
> - **Portal form validations** (demo payment Luhn etc.) ~`54b8768`
> - **Legal docs:** Terms + Privacy (`kind`), Settings `/settings/legal`, Format with AI, force re-accept + email on publish, Settings hub tile + sidebar · tip through **`a8893e2`**
> - Migration **0046** · Notepad paste: `F:\MarketingHub\command-centre\supabase\migrations\_owner_paste_0046_legal_docs_kind.sql` (exclude `_owner_paste_*` from commits)
> - **Pricing sheet** earlier: `docs/unit-pricing-simple.xlsx` (cost-only review; margin later) — **parked** mid-owner review
>
> ### IN PROGRESS / NEXT (ordered)
> 1. **Fix legal publisher gate for agency owner** — owner reports Legal/Settings still fails while **already signed in as agency** (RBAC/UI bug). Do **not** tell them to “switch to agency”; diagnose publisher/gate/seat check
> 2. Confirm owner pasted **0046** on staging Supabase (**blocking** for legal publish if not done)
> 3. Smoke: `/dev` → Staging Agency header → Clients (Viya as client) → Settings → Terms & Privacy (editors + Format with AI) → publish → accept-terms gate
> 4. Finish internal unit pricing (Excel review → finalize sell/margin later → wire rate card)
> 5. Optional: more portal validation / `RESEND_API_KEY` for legal emails
> 6. Later: main/live; multi-agency white-label; W6 Google waiting
>
> ### How to resume
> - **Human:** staging `/dev` quick login → Settings → Terms & Privacy; paste 0046 if needed. If legal UI fails while on Staging Agency, it’s a **bug** — report back (don’t re-login as “agency”)
> - **Agent:** `READ HANDOVER.md` · branch `staging` · fix legal publisher RBAC/UI first · never flip `*_LIVE` · never commit `_owner_paste_*` / integrator temps
>
> ### Resume in a new Cursor chat
> Paste:
> ```
> Path: F:/MarketingHub/command-centre — READ HANDOVER.md NEXT SESSION.
> STATE: staging @ 43d2508 (= origin/staging); Preview URL in HANDOVER; Supabase ccgkbyboobctqjhjiejt; live/W6 parked.
> IN PROGRESS: fix legal publisher gate (agency owner already on Staging Agency — RBAC/UI bug, not seat switch); confirm 0046 paste; unit pricing parked.
> NEXT: fix legal Settings/publish for agency owner → 0046 if needed → smoke Clients (Viya) + accept-terms → pricing Excel → optional RESEND → later main/live + W6.
> Login: staging /dev quick-login. No *_LIVE.
> ```
>
> **Hard locks:** No `*_LIVE`. Critique. Ads media always extra. Exclude `_owner_paste_*`, `scripts/*.snip`, integrator temps from commits. Owner applies SQL via Notepad paste only.
>
> **Envs:** Local / Staging / Live — **`docs/ENVIRONMENTS.md`**. Deploy: `docs/DEPLOYMENT.md`. Live cutover: `docs/OWNER-LIVE-CUTOVER.md`. Soft-block: `liveIntegrationsAllowed()` refuses cutover `*_LIVE` on staging / local demo / localhost `APP_ORIGIN`.
>
> **▶ STANDING INSTRUCTION — owner applies migrations (no psql/CLI/PAT):** give the full Notepad path.
>
> **▶ STANDING INSTRUCTION — next-session continue command:** update this block, then give Path + READ + STATE + NEXT.
>
> **NON-NEGOTIABLES:** Isolation rule · `appEnv()` never `NODE_ENV` · OAuth-only · never force-push main · exclude `scripts/*.snip`, `ship-*.mjs`, `_owner_paste_*`, integrator temps from commits.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-14, **STAGING · LEGAL DOCS · INTERNAL PRICING**) — archived
>
> Legal docs shipped (Settings `/settings/legal`, kind=terms|privacy, Format with AI, hub tile). Tip advanced through `a8893e2`. Superseded by full onboarding + deploy-recovery wave notes above.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-13, **STAGING LIVE @ `d9a2bad` · INTERNAL PRICING IN PROGRESS · W6 WAITING**) — archived
>
> Staging live; UX/Custom a-la-carte; pricing wave. Superseded by onboarding + legal-docs + tip advances on staging.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-12, **c1c30a0 SHIPPED · LARGE UX TREE UNCOMMITTED** · **0045 PASTE?** · **W6 WAITING**) — archived
>
> Pre-staging block: UX tree was uncommitted on `main`; staging cloud not yet created. Superseded — staging now live @ `d9a2bad`; UX committed through Custom a-la-carte.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-12, **c1c30a0 SHIPPED · 0043+0044 PASTED**) — archived
>
> Automation-first + packages shipped @ `c1c30a0`; 0043+0044 pasted. Large UX/polish tree continued uncommitted — see block above.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-12, **c1c30a0 SHIPPED · 0043+0044 PASTE**) — archived
>
> Migrations were pending — then pasted.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-11, **0041+0042 PASTED**) — archived
>
> Migrations pasted. Owner called out DIY UX → automation-first plan (see block above).
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-11, **AGENCY/CLIENT SURFACES + CALENDAR CONTEXT**) — archived
>
> Calendar/context shipped @ `2e55e78`.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-11, **UX + PROMO + CREATE-SCRAPE** · **uncommitted**) — archived
>
> Promo/onboarding/UX tree committed as `294611e`. Calendar agency/client split continued — see block above.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-11, **PLATFORM IMPROVEMENTS WAVE** · **W6 WAITING ON GOOGLE**) — archived
>
> Platform improvements shipped @ `a405118`. Large UX/promo/create-scrape tree continued uncommitted — see block above.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-11, **SIGNUP PRE-FILL + C2** · **W6 WAITING ON GOOGLE**) — archived
>
> Signup pre-fill + C2 credit/tax invoices shipped; platform improvements follow above.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-11, **MANAGED-SERVICE WAVE 2** · **W6 WAITING ON GOOGLE**) — archived
>
> Wave 2 shipped: foundation + rolling calendar · client assets · exception notify · service-level UI · fixtures 271/271 · W6 waiting on Google.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-11, AI CAMPAIGN LAYER + DEFERRED READY · uncommitted) — archived
>
> Large uncommitted AI/IA tree; fixtures baseline was 252/252 + 20/20; then committed as `6360e83` → fixtures **265/265 + 20/20**.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-11, W7 COMPLETE · WAITING ON GOOGLE · UX declutter) — archived
>
> W0–W5 + W7 DONE · fixtures 252/252 + 20/20 · W6 WAITING · live flags OFF · UX declutter then company-scoped nav committed (`ddbda68`, `ea7bfbf`).
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-10, W7 COMPLETE · WAITING ON GOOGLE) — archived
>
> W0–W5 + W7 DONE · fixtures 252/252 + 20/20 · `w7_complete=yes` · W6 WAITING on Google · live flags OFF · park code work.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-10, W7 code complete) — archived
>
> W7 M50–M55 code done; migrations pasted; then M01-FINAL fixture recount → 252/252 + 20/20.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-10, W5 SHIPPED) — archived context
>
> **W0–W5 DONE** @ `3668e35`. UX polish was uncommitted; then committed as `d0e3b3c`. W6 Google-blocked. Live flags OFF.
>
> ---
>
> ### ▶ PREVIOUS NEXT-SESSION BLOCK (2026-07-09, W2) — archived context
>
> **W2 merged to `main`:** live publish adapters (M24) · live ads execution (M25) · live analytics import (M26) · public REST API + partner webhooks (M27).
>
> **Build state (then):** tsc clean · fixtures **103/103 + 20/20**. Live flags OFF.
>
> ---
>
> ### ▶ AI ASSISTANT HARDENING (V1 module 3, 2026-07-08)
> **Metering:** `src/lib/ai/metering.ts` (`recordAiUsage`, token-aware cost estimate) + per-plan `aiTokensPerMonth` in `plans.ts` (starter 200k / agency 800k / scale 2M); `assertAiBudget` now checks USD cap AND token cap (`aiTokensThisMonth` / `aiTokenBudgetExceeded`). `callClaudeDetailed` returns real `input_tokens`/`output_tokens` when live.
> **Pre-publish critique:** `src/lib/ai/critique.ts` — rule-based + optional LLM review; runs in `scheduleOne()` before any post is scheduled; blocks on critical issues; stored as `content.aiCritique` + logged as `ai_run` kind `content_critique`. UI on `/content/[id]`.
> **Duplicate warnings:** extended to campaigns, repurpose, and studio (already on requests); re-checked at critique time.
> **Asset metadata:** `Asset` gains `aiModel`, `aiPrompt`, `aiRunId`, `estCostUsd`, `sourcesUsed`; `persistGeneratedAsset` + `/assets/[id]` provenance panel. Content rows gain `aiRunId` + `estCostUsd` on every AI draft path.
> **⚠️ Migration `0015_ai_hardening.sql` = PENDING (owner paste).** **Verified:** tsc + clean build (54 routes); fixtures **self-test 35/35 + queue-test 18/18** (batch 1 integrated).
>
> ---
>
> ### ▶ BUSINESS PROFILES — retail + hotel (V1 module 2, 2026-07-08)
> **Engine:** `src/lib/business-profiles.ts` — `BusinessType`, vertical field types, `resolveBusinessType`, `CAMPAIGN_GOALS`, `CONTENT_TEMPLATES`, `buildBusinessProfileAiContext`. **Profile:** `CompanyProfile` jsonb slices (`businessType`, `retail`, `hotel`, `restaurant`) — no new tables. **UI:** `/companies/[id]` business-type picker + conditional vertical sections (`business-profile-fields.tsx`); sidebar shows recommended campaign goals + content templates. **AI:** `buildBusinessProfileAiContext` wired in `ai/draft.ts` + `ai/campaign.ts`. **Self-test:** `businessProfiles.retailAiContext`, `businessProfiles.hotelAiContext`. **No migration.**
>
> ---
>
> ### ▶ CALENDAR INTELLIGENCE (V1 module 4, 2026-07-08)
> **Engine:** `src/lib/calendar-intelligence.ts` — AU seasonal/holiday prompts, analytics-informed optimal windows, agency portfolio filters, schedule timing hints. **UI:** `/calendar` intelligence panel + `?view=portfolio`; `calendar-intelligence-panel.tsx`. **Schedule:** `calendar/actions.ts` critique gate preserved (extend-only). **Self-test:** `calendarIntelligence.seasonalPromptsAu`, `optimalWindowsTenantScoped`, `portfolioFilterBusinessType`. **No migration.**
>
> ---
>
> ### ▶ CONTENT REPURPOSING (V1 module 5, 2026-07-08)
> **Engine:** `src/lib/content-repurposing.ts` — one brief → FB/IG/GBP/TikTok variants; deterministic templates when `ANTHROPIC_API_KEY` unset. **UI:** `/studio` “Repurpose for platforms” panel; `/content/[id]` → `/studio?repurposeFrom={id}`. **Action:** `repurposeForPlatformsAction` — variants as `ai_draft` with `repurposedFromId` / `variantGroupId` / `variantLabel`; `duplicateWarning` on each variant. **Self-test:** `repurpose.sourceEligibility`, `repurpose.platformVariantsDistinct`, `repurpose.charLimitsRespected`, `repurpose.createsAiDraftLinked`. **No migration** (existing `repurposed_from_id`, `variant_group_id`, `variant_label` columns).
>
> ---
>
> ### ▶ GBP LOCAL AUDIT (V1 module 6, 2026-07-08)
> **Engine:** `src/lib/gbp-audit.ts` — NAP, hours, categories, photos, FAQ checklist vs connected GBP profile; `buildCanonicalGbp()` ground truth; `simulateGbpSnapshot()` when live off; `fetchLiveGbpSnapshot()` when `gbpAuditLive()`. **Gate:** `gbpAuditLive()` requires `PUBLISHING_LIVE=true` + `PUBLISHING_TOKEN_KEY` + `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` (owner Google Cloud still blocked — simulated mode). **UI:** `/companies/[id]/local-seo` + `gbp-audit-panel.tsx`; **Local SEO** nav on company profile. **Self-test:** `gbpAudit.napConsistency`, `gbpAudit.simulatedWhenLiveOff`, `gbpAudit.checklistActionable`. **No migration** (slot 0019 reserved, unused).
>
> ---
>
> ### ▶ AI DISCOVERY / GEO (2026-07-11)
> **Engine:** `src/lib/ai-discovery.ts` — readiness checklist (website, NAP, suburbs, GBP, Bing Places, Yelp, schema, landings, FAQ, reviews), customer prompt pack, manual mention scorecard (ChatGPT / Gemini / Perplexity). Honest disclaimer: improves odds, never guarantees a mention. **Persistence:** `companies.profile.aiDiscovery` jsonb (directories + scorecards). **UI:** `ai-discovery-panel.tsx` on `/companies/[id]/local-seo`; company nav **Local SEO & AI**. **Actions:** `saveAiDiscoveryDirectoriesAction`, `saveAiDiscoveryScorecardAction` + audit. **Self-test:** `aiDiscovery.promptPack`, `aiDiscovery.readinessScore`, `aiDiscovery.mentionRate`. **No migration**.
>
> ---
>
> ### ▶ QUALITY ROUTING (managed service, 2026-07-11)
> **Engine:** `src/lib/managed-service/quality-routing.ts` — after AI draft, critique → PASS/WARN/FAIL/ESCALATE; `fully_managed`/`managed_exceptions` + PASS/WARN auto-submit to client review; FAIL/ESCALATE or `approval` level → agency hold. Never publishes. **Wired:** Studio · submit for approval · **delivery-runner content phase** · **campaign pack** (FAIL/ESCALATE stay held). **UI:** content badges + Needs attention; Dashboard `quality_hold`; Monitor = Clients + AI next steps (Signals demoted to link). **Self-test:** `qualityRouting.gateMapping`, `qualityRouting.decisions`. **No migration** (`content.qualityRouting` jsonb).
>
> ---
>
> ### ▶ CLIENT PROMO CATALOG (2026-07-11)
> **Engine:** `src/lib/promo-catalog.ts` + `promo-requests.ts` — industry templates (retail, restaurant, fast food, hotel, professional, general); client sets dates/budget/channels; default **15% markup** (`managedService.promoMarkupPercent`); spawns draft campaign + items. **UI:** client Home + `/client/promos` + calendar “not on calendar yet”; agency company overview markup + Mark on calendar. **Self-test:** `promoCatalog.byIndustry`, `promoCatalog.markupMath`. **No migration** (`profile.promoSelections` jsonb).
>
> ---
>
> ### ▶ AI CAMPAIGN BUILDER (V1 module 7, 2026-07-08)
> **Engine:** `src/lib/ai/campaign-builder.ts` — plain-language goal → strategy + channel plan + KPIs; `buildCampaignFromGoal()` (Claude JSON when keyed, deterministic otherwise); `spawnGovernedDraftForItem()` → `ai_draft` only (never scheduled). KPIs/strategy packed in `campaigns.key_message` via `<!--m07:…-->` marker. **Action:** `createCampaignFromGoalAction` — `assertCompanyAccess` + AI budget. **UI:** `/campaigns/new` **Build from goal** panel (`campaign-builder-panel.tsx`); `/campaigns/[id]` unpacks strategy/KPIs. **Self-test:** `campaignBuilder.goalProducesPlan`, `campaignBuilder.spawnsDraftContentNotScheduled`, `campaignBuilder.kpisPresent`. **No migration** (slot 0020 reserved, unused).
>
> ---
>
> ### ▶ BRAND BRAIN RAG (V1 module 8, 2026-07-08)
> **Engine:** `src/lib/brand-brain-rag.ts` — upload menus/price lists/brand PDFs (text extract or metadata stub); `draft` → `approved` → `archived` lifecycle on `knowledge_documents`; deterministic keyword retrieval (`retrieveApprovedSnippets`); `applyCitationsToBody` wired in `ai/draft.ts` + `ai/campaign-builder.ts` (critique gate untouched). **UI:** `/companies/[id]/brand-brain` — file upload, approve/archive, cite preview on approved docs. **Actions:** `uploadRagDocumentAction` + lifecycle via `assertAdminCompanyAccess`. **Self-test:** `brandBrainRag.uploadCreatesDraftVersion`, `brandBrainRag.approvedCited`. **No migration** (slot 0021 reserved, unused).
>
> ---
>
> ### ▶ RECOMMENDATIONS V1 (V1 module 9, 2026-07-08)
> **Engine:** `src/lib/recommendations.ts` + extended `src/lib/ai/recommend.ts` — ranked 3–5 actions from analytics, calendar gaps, publishing cadence, Brand Brain; score in `action._score` jsonb; dismiss reason via `withDismissReason()`. **Calendar signals:** `detectCalendarGap()` + `detectPublishingCadence()` in `calendar-intelligence.ts` (extend-only; critique gate untouched). **UI:** `/recommendations` rank/score/dismiss; `recommendation-cards.tsx`; company profile `RecommendationStrip`. **Self-test:** `recommendations.rankedTopFive`, `recommendations.calendarGapSignal`, `recommendations.dismissPersistsReason`. **No migration** (slot 0022 reserved, unused).
>
> ---
>
> ### ▶ HEALTH SCORES V1 (V1 module 10, 2026-07-08)
> **Engine:** `src/lib/health-scores.ts` — single marketing-health score per company (0–100); factors: publishing cadence, approval backlog, paid/simulated ROAS, lead volume; explainable drill-down; `companiesNeedingAttention()` for agency portfolio. **UI:** `health-score-card.tsx` — `HealthScoreCard` on `/companies/[id]` sidebar; `HealthAttentionList` on `/dashboard` (admin, top 6 below threshold). **Self-test:** `healthScores.scoreInRange`, `healthScores.factorsExplainable`, `healthScores.agencyNeedsAttentionSort`. **No migration** (slot 0023 reserved, unused).
>
> ---
>
> ### ▶ AI-MOS SUGGEST-ONLY (V1 module 11, 2026-07-08)
> **Engine:** `src/lib/ai-mos.ts` — monitors health, calendar gaps, cadence, recommendations; `surfaceTenantOpportunities()` + `convertOpportunityToDraft()` (campaign → governed `ai_draft` only; content → prefilled request); `dismissOpportunity()` with audit. **Persistence:** `companies.profile.aiMos.opportunities` jsonb (no migration; slot 0024 reserved). **UI:** `/ai-mos` + `ai-mos-opportunity-cards.tsx`; dashboard strip; nav **AI-MOS** (admin). **Self-test:** `aiMos.signalsProduceOpportunity`, `aiMos.convertCreatesDraftOnly`, `aiMos.dismissAudited`. **Critique gate untouched.**
>
> ---
>
> ### ▶ AGENCY OPS (V1 module 12, 2026-07-08)
> **Engine:** `src/lib/agency-ops.ts` — overdue approval alerts, workload summary, health attention merge, tenant-wide reusable content templates (`prompt_templates`); `buildAgencyOpsBundle()`. **UI:** `agency-ops-panel.tsx` on `/dashboard` (admin); template create/apply → `/requests/new` prefill. **Self-test:** `agencyOps.overdueApprovalDetected`, `agencyOps.workloadSummaryTotals`, `agencyOps.templateApplyPrefill`. **No migration** (slot 0025 reserved, unused).
>
> ---
>
> ### ▶ AUTO-ONBOARDING (V1 module 13, 2026-07-08)
> **Engine:** `src/lib/auto-onboarding.ts` — consent-required website + social scrape → field preview; `simulatePageContent()` when live off; `applyExtractedFields()` merges into `CompanyProfile`; audit in `profile.autoOnboarding` jsonb. **Gate:** `autoOnboardingLive()` — `AUTO_ONBOARDING_LIVE` + `AUTO_ONBOARDING_FETCH_KEY`. **UI:** `auto-onboarding-panel.tsx` on `/companies/[id]` (consent checkbox, preview, selective apply). **Actions:** `previewAutoOnboardingAction` + `applyAutoOnboardingAction` via `assertAdminCompanyAccess`. **Self-test:** `autoOnboarding.consentRequired`, `autoOnboarding.simulatedWhenLiveOff`, `autoOnboarding.applyPrefillsProfile`. **No migration** (slot 0026 reserved, unused).
>
> ---
>
> ### ▶ SECURITY SLICE (V1 module 15, 2026-07-08)
> **Engine:** `src/lib/security-slice.ts` — `sanitizeAiUserInput()`, `tenantScopedSystemPrompt()`, `guardedClaudeCall()` (does not bypass metering/critique), `recordProviderFailure()`, `buildIntegrationHealthBundle()`. **AI hooks:** `draft.ts`, `campaign-builder.ts`, `ai-mos.ts`. **UI:** `security-health-panel.tsx` on `/admin` + `/ai-control`. **Self-test:** `securitySlice.injectionPatternsStripped`, `securitySlice.tenantContextFence`, `securitySlice.providerFailureRecorded`. **Critique gate untouched.** **No migration** (slot 0028 reserved, unused).
>
> ---
>
> ### ▶ PHOTOGRAPHER MARKETPLACE (V1 module 14, 2026-07-08)
> **Engine:** `src/lib/photo-marketplace.ts` — browse platform + tenant photographers, `bookMarketplaceShoot()` → linked `PhotoShoot` (`requested`); simulated billing when `PHOTO_MARKETPLACE_LIVE` off; `tryReleasePhotographerPayout()` on shoot completion. **Stripe:** `photo-marketplace-stripe.ts` (Connect destination + platform fee). **UI:** `/photographers` browse/book + agency bookings; nav link; `/visuals` cross-link. **Actions:** `assertCompanyAccess` + `assertCompanyAddon(photo)`. **Self-test:** `photoMarketplace.bookingCreatesShoot`, `photoMarketplace.simulatedBillingWhenLiveOff`, `photoMarketplace.tenantIsolation`. **✅ Migration `0027_photo_marketplace.sql` = APPLIED** (owner, 2026-07-08 — tables empty until use).
>
> ---
>
> ### ▶ PUBLISH IDEMPOTENCY (V1 module 1 remainder / M01b, 2026-07-08)
> **Engine:** `src/lib/publish-queue.ts` — `publishIdempotencyKey`, `resolvePriorPublish`, `[idem:…]` in `publish_logs.detail`; `publishPostNow` short-circuits when already published; stale-claim recovery verifies prior publish before counting a failure. **Publishing:** `publishing.ts` simulated connector returns deterministic “Already published” on key hit. **Self-test:** `publishIdempotency.retrySkipsWhenAlreadyPublished`, `staleClaimSafeRecovery`, `logRecordsDedupeKey`. **Queue-test:** `queue.idempotentRetrySkipsResend`, `queue.staleClaimRecoversPublished` (suite **20/20**). **No migration.**
>
> ---
>
> ### ▶ BULK CLIENT CONNECT — one-time onboarding links (Module 1 / scale, 2026-07-08)
> **Model:** `ConnectInvite` (pending → completed | expired | revoked) per (tenant, company, v1 platform). **Engine:** `src/lib/connect-invites.ts` (`bulkCreateConnectInvites`, skips already-connected + pending duplicates; 7-day default expiry). **Public:** `/connect/[token]` — client OAuth (no login) or manual token (TikTok/demo); `src/lib/connect-public.ts` loader via service context. **OAuth:** `OAuthState` gains `inviteId` + `publishPlatform`; `/api/oauth/callback` completes invite under `runInServiceContext`. **Admin UI:** `/publishing` bulk checkbox matrix (companies × Facebook/Instagram/GBP/TikTok) + pending-invite list with copyable URLs + revoke; optional email to `approvalContact`. **Repo:** `listConnectInvites`/`createConnectInvite`/… tenant-pinned; token lookup via `svc()`.
> **⚠️ Migration `0014_connect_invites.sql` = PENDING (owner paste).** **Verified:** tsc + clean build (55 routes); fixtures **self-test 23/23 + queue-test 18/18** (+3 connect-invite isolation checks).
>
> ---
>
> ### ▶ AI VISUALS + PHOTO SHOOTS (Module 2 / Phase 4, 2026-07-08)
> **Model:** `PhotoShoot` (requested → scheduled → in_progress → delivered → completed | cancelled) + existing `Asset` DAM rows with `source: "ai_generated"`. **Engine:** `src/lib/ai/imagegen.ts` + `videogen.ts` (Brand-Brain-grounded prompts; deterministic PNG/MP4 via `visuals-placeholders.ts` when `VISUALS_LIVE` off); `src/lib/visuals-connectors.ts` (`VISUALS_LIVE` + provider keys); `src/lib/visuals.ts` (`persistGeneratedAsset` → pending_approval asset + optional `attach:<contentId>` tag; `tryAutoAttachApprovedAsset` on approval). **Photo shoots:** `src/lib/photo-shoot.ts` transitions; repo `listPhotoShoots`/`createPhotoShoot`/`updatePhotoShoot`. **Gates:** `assertCompanyAddon(companyId,"video")` on AI image+video actions; `assertCompanyAddon(companyId,"photo")` on shoot actions — tenant-pinned via `assertCompanyAccess` first.
> **UI:** `/visuals` hub (company picker, add-on status, AI image form, AI vertical video form, photo-shoot request + workflow cards); nav **AI Visuals** (admin). Café seed: `photo` add-on + sample scheduled shoot.
> **⚠️ Migration `0009_photo_shoots.sql` = ✅ APPLIED + LIVE-VERIFIED (2026-07-08)** (`scripts/verify-visuals-supabase.mjs`). **Verified:** tsc + clean build (51 routes); in-memory fixtures **self-test 18/18 + queue-test 15/15**; demo with `CC_MEDIA_DIR` stores real placeholder bytes.
>
> ---
>
> ### ▶ ORDER NOW — direct ordering (Module 5 / Phase 6, 2026-07-08)
> **Model:** `OrderMenuItem` (catalog) + `OrderingSettings` (per company: pickup/delivery, min order, Stripe Connect) + `RestaurantOrder` (lines jsonb, lifecycle). **Engine:** `src/lib/ordering.ts` (state machine, totals); `src/lib/ordering-connectors.ts` (`ORDERING_LIVE`); `src/lib/ordering-stripe.ts` (Connect onboarding + guest Checkout with `transfer_data.destination`); `src/lib/ordering-public.ts` (guest storefront loader via service context under Supabase). **Repo:** `listOrderMenuItems`/`createOrderMenuItem`/… + `upsertOrderingSettings` + `listRestaurantOrders`/….
> **Gates:** `assertCompanyAddon(companyId,"order_button")` on all `/ordering` actions; public `/order/[companyId]` checks addon + availability (no login).
> **UI:** `/ordering` hub (Connect, settings, menu CRUD, kitchen queue, embed snippet); public `/order/[companyId]` (guest cart + checkout); nav **Order Now** (admin). Demo: simulated Connect + instant paid orders; live: `ORDERING_LIVE=true` + Stripe keys.
> **Webhook:** `checkout.session.completed` with `metadata.kind=order` → `paid` (service context, tenantId in metadata).
> **⚠️ Migration `0011_ordering.sql` = ✅ APPLIED + LIVE-VERIFIED (2026-07-08)** (`scripts/verify-ordering-supabase.mjs`). **Verified:** tsc + clean build (53 routes); fixtures **18/18 + 15/15**.
>
> ---
>
> ### ▶ RESTAURANT MENUS (Module 4 / Phase 5, 2026-07-08)
> **Model:** `MenuDesign` (requested → in_design → client_review → delivered → completed | cancelled) with **`billingClass`** (`included` | `billable`) + **`quotaYear`** set at request time. **Engine:** `src/lib/menu-design.ts` — `MENUS_INCLUDED_PER_YEAR` (2), `menuQuotaSummary`, `resolveMenuBillingClass`, state transitions. **Repo:** `listMenuDesigns(tenantId, companyId?)` / `createMenuDesign` / `updateMenuDesign`. **Gate:** `assertCompanyAddon(companyId,"menus")` on all `/menus` actions — tenant-pinned via `assertCompanyAccess` first.
> **UI:** `/menus` hub (company picker, quota badge, request form with included/billable preview, workflow cards + deliverable asset linking); nav **Menus** (admin). Café seed: `menus` add-on + sample **in_design** winter menu (included, quotaYear 2026).
> **⚠️ Migration `0010_menu_designs.sql` = ✅ APPLIED + LIVE-VERIFIED (2026-07-08)** (`scripts/verify-menus-supabase.mjs`). **Verified:** tsc + clean build (52 routes); in-memory fixtures **self-test 18/18 + queue-test 15/15**.
>
> ---
>
> ### ▶ PAYMENT-TIER MATRIX — per-company ADD-ONS (Module 3, 2026-07-07)
> **Model:** the tenant base **PLAN** (starter/agency/scale — `plans.ts`) is unchanged and still gates company count + AI + automation + white-label. NEW on top of it: per-**client-company** **add-ons** = `AddonId` (`video` 🎬 A$79 · `photo` 📸 A$59 · `menus` 📋 A$39 *restaurant* · `order_button` 🛒 A$99 *restaurant*) as a **`CompanyEntitlement`** (≤1 row per (companyId,addonId); enable→`active`, disable→`cancelled`, kept for history). Catalogue = `src/lib/addons.ts` (PURE DATA like plans.ts). Engine = `src/lib/entitlements.ts`: **`companyHasAddon`** / **`assertCompanyAddon`** (the gate the deliverable modules call — FAIL-CLOSED) / `companyAddonMap(tenantId,companyId)` / `activeAddonsForCompany` / `tenantAddonSummary(tenantId)` (roll-up: active count + est A$/mo add-on revenue).
> **Repo:** `listCompanyEntitlements(tenantId, companyId?)` (REQUIRED tenantId), `getCompanyEntitlement(companyId, addonId)` (company-scoped single lookup for gates), `upsertCompanyEntitlement` (keyed on (companyId,addonId); active restamps enabledAt+clears cancelledAt, cancel stamps cancelledAt). In `db/index.ts` + `supabase-adapter.ts` (onConflict `company_id,addon_id`) + `store.ts` collection + café seed (menus+order+video active) + export/purge + mapper `enabled_by` alias.
> **Stripe (env-gated):** `stripeAddonPriceId` (STRIPE_PRICE_ADDON_*), `createAddonCheckoutSession` (subscription, metadata.kind=addon on BOTH session+subscription), `cancelStripeSubscription` (`stripeDelete`). Webhook: add-on checkout → enable entitlement; add-on `subscription.deleted` → cancel entitlement; **add-on subs are ignored by the PLAN handlers** (`metadata.kind==='addon'`) so an add-on never touches the tenant plan. Demo mode (no keys) → toggling applies directly, owner-only, audited.
> **UI:** `/billing` gets a **Client add-ons** section — catalogue legend + a per-company toggle matrix (owner-only `enableAddonAction`/`disableAddonAction`, company **pinned to the session tenant** via `canAccessCompany`, never a form id) + a tenant summary. Company detail page = a read-only **Add-ons** card (active list / empty-state) linking to Billing.
> **✅ Migration `0008_company_addons.sql` APPLIED + LIVE-VERIFIED (2026-07-07)** (company_entitlements, company-scoped RLS `has_company_access`, `unique(company_id,addon_id)`, `enabled_by` text). Two live checks green + DB pristine: `scripts/verify-entitlements-supabase.mjs` (service-role: enable→disable→re-enable one stable row, timestamp semantics, unique enforced) **and `scripts/verify-entitlements-rls-supabase.mjs` (RLS 9/9: signed-in owner reads/writes OWN entitlements, cross-tenant read→0 rows, cross-tenant insert/update→42501/0-rows, symmetric).** (App also degrades gracefully if ever run pre-migration — reads → [], every add-on shows OFF.)
> **Verified:** tsc + floating-promise sweep + clean build; in-memory browser (matrix reflects café's 3 seeded add-ons = A$217/mo; enable photo → 4/A$276; disable → back to 3; company card active+empty states); **self-test 18/18** (2 new: `entitlements.listScopedToTenant` + `entitlements.gateReflectsState`) + queue-test 15/15 on both fixtures; **Supabase live: service-role round-trip + RLS leak-test 9/9 (both scripts green), DB pristine.** **Adversarial review (5 dims → 2-vote refute, 44 agents): 13 raised, 5 confirmed (3 distinct) ALL fixed** — (1, HIGH) `disableAddonAction` flipped the entitlement to cancelled even when the Stripe cancel FAILED → billing/access divergence + no retry → now it only revokes access after a successful cancel, else throws so the owner retries; (2, MED, pre-existing) `onSubscriptionDeleted` downgraded the tenant to Starter on deletion of ANY plan sub carrying its metadata → now guarded to the tenant's CURRENT `stripeSubscriptionId`; (3, LOW) a redelivered add-on checkout re-activated a since-disabled entitlement → idempotency guard now skips any checkout for a subscription already recorded (active OR cancelled), only a NEW sub id enables. The proactively-fixed session-less-RLS webhook (wrapped in `runInServiceContext`) was independently REFUTED (fix confirmed in place). **A second focused Workflow (19 agents) then adversarially verified the 3 fixes themselves: all `fully_closed`, 0 new findings confirmed (5 raised, all refuted 3‑0 — the fixes are correct + regression-free).** **LESSONS: (a) a best-effort external cancel whose result is discarded will silently diverge billing from access — gate the local state change on the cancel actually succeeding; (b) a `subscription.deleted` handler must confirm the deleted sub IS the current one before downgrading (superseded subs get deleted later); (c) an idempotency guard that only matches the ACTIVE state lets a replayed create resurrect a user's deliberate cancel — key it on the subscription id, not the status.**
>
> ---
>
> ### ▶ STAGING/LIVE ENVIRONMENTS shipped (2026-07-07, item 4)
> `src/lib/env.ts` — `appEnv()` resolves **CC_ENV → VERCEL_ENV → NODE_ENV** ("production" | "staging" | "development"). **The trap it fixes:** a Vercel PREVIEW (staging) build runs with `NODE_ENV=production`, so gating dev-tools on NODE_ENV would wrongly lock them on staging — everything now keys on `appEnv()`/`devToolsOpen()`. Contract: **staging = all dev-tools open** (`/api/dev/self-test` + `/api/dev/queue-test` open) **+ a fuchsia "STAGING — test environment" ribbon** in the app shell; **production = dev-tools locked** (403 unless `CC_SELFTEST_SECRET`) **+ no ribbon**. `docs/DEPLOYMENT.md` is the full runbook (2 Supabase projects; Vercel Production-vs-Preview env-var scoping; migrations 0001→0007 to both; keep `*_LIVE` off on staging). `.env.example` documents `CC_ENV`. **Verified:** appEnv/devToolsOpen truth table (7 cases incl. the NODE_ENV=production-on-preview trap); dev ribbon renders; devtools 200 in dev; tsc+sweep+clean build. LESSON: never branch env behaviour on `NODE_ENV` on Vercel — use `appEnv()` (VERCEL_ENV-aware).
>
> ---
>
> ### ▶ PAID ADVERTISING module (2026-07-07)
>
> **State:** the **paid-advertising module (roadmap Module 6 / Phase 7) — the "buildable now" env-gated half — is BUILT + reviewed + verified** on top of everything below. DELEGATED model (locked): the client connects their OWN Google Ads / Meta ad account (scoped token, never a card); the platform bills the CLIENT for ad spend; we manage campaigns and charge a management fee via Stripe. Shipped: delegated ad-account connect (tenant-pinned, encrypted token; live OAuth is the drop-in), per-company **budget + management-fee terms**, **AI budget-allocation guidance** (`src/lib/ai/allocation.ts` — deterministic ROAS/CPL split, 20–80% guardrails so no channel is starved, exploratory slice for untested channels; an admin must Apply it — we never let a model move money), **simulated paid performance** (`src/lib/paid.ts` — CPL/ROAS/CTR seeded by id), managed campaigns w/ status toggles, manual lead capture (attribution), **management-fee Stripe invoicing** (`createManagementFeeInvoice`, env-gated), and a **unified `/ads` dashboard** (client's managed spend + leads + CPL + ROAS + OUR fee). Live campaign execution + lead-webhooks are gated on the Google Ads API + Meta Marketing API approvals (heaviest external gate — file FIRST). **`ADS_LIVE` env gate; new nav item "Paid Advertising" (adminOnly).**
>
> **▶ CLIENT ONBOARDING + versioned TERMS & CONDITIONS shipped (2026-07-07).** A new customer (tenant) must complete an onboarding wizard — **details → tier → Stripe card → accept T&C** — before using the app; EVERY user must accept the CURRENT terms version, and publishing a new version FORCES re-acceptance. Both onboarding models: **self-serve** (public signup → `/onboarding` wizard) and **agency-assisted** (platform admin provisions a client at `/platform-admin`; the client finishes card + T&C themselves). Model: `TermsVersion` (monotonic, active flag) + `TermsAcceptance` (per user/version, ip) + `Tenant.onboarding`/`onboardingCompletedAt`; terms are platform-level (svc). **THE GATE lives in `requireUser()`** (auth funnel) — not just the layout — so it covers server actions + API routes, with `requireUserRaw`/`requireTenantOwnerRaw` for the two gate routes to avoid a loop. `/platform-admin` (platformAdmin-gated nav) publishes terms + provisions clients. Card capture = Stripe Checkout (env-gated; success returns into the wizard). Migration **0007** (tenants.onboarding jsonb + terms_versions/terms_acceptances). **Verified in-memory:** signup→wizard→app; publish v2→forced re-acceptance→accept→app; onboarded users skip the wizard; no redirect loops; fixtures 16/16 + 15/15 no-regression; tsc+sweep+clean build (50 routes). **Adversarial review (21 agents, 2-vote refute): 4 confirmed (2 critical) + 1 split, ALL fixed** — (1/2, CRITICAL/HIGH) the gate was layout-only so server actions/API bypassed it → moved into `requireUser()`; (3, HIGH) the plan/card step was skippable → `completeOnboardingAction` now requires a Stripe subscription in Stripe mode; (4, CRITICAL) `publishedById` wrote a non-existent column so publishing terms threw under Supabase → mapper alias added; (5, split) publish deactivate-then-insert could strand zero active → now inserts-active-first then deactivates others. **⚠️ Migration `0007_terms_and_onboarding.sql` = required owner paste** (`scripts/verify-terms-supabase.mjs` round-trips it once applied; app degrades gracefully pre-migration — currentTerms→undefined = gate no-op, updateTenant swallows the missing-column error).
>
> **▶ T&C-UPDATE BROADCAST EMAIL shipped (2026-07-07, item 3).** Publishing a new terms version now automatically **emails every active client** (all active users across active tenants, deduped) that the terms changed — a courtesy heads-up before the force-re-acceptance gate hits them. `src/lib/terms.ts` `broadcastTermsUpdate` (wholly best-effort — never throws out of publish) + `src/lib/email.ts` `sendBulkEmail` (per-recipient, no shared To/CC; Resend batch ≤100 when available; env-gated no-op without `RESEND_API_KEY`) + `listActiveRecipients` (paginated under Supabase). Platform Admin shows per-version "emailed N client(s)" + a **Send/Resend** button + a warning when email isn't configured; the version stamps `notifiedAt`/`notifiedCount`. Migration **0007 extended** with `notified_at`/`notified_count` (idempotent — fold into the same paste). **Verified in-memory:** publish → 8 recipients gathered, env-gated so 0 sent, audit "8 recipient(s) — email NOT sent", resend works; fixtures 16/16+15/15; tsc+sweep+clean build. **Review (8 agents): 0 confirmed + 2 split, both fixed** — broadcast wrapped fully best-effort; Supabase recipient query paginated (was silently capping at PostgREST's ~1000 default). **At true fleet scale the broadcast should move to the job queue** (currently a chunked synchronous fan-out).
>
> **▶ AD AUDIENCE TARGETING shipped (2026-07-07) — the owner pulled this forward from v2.** Reusable per-company **AudienceSegments** (geo: country/region/city/postcode/**radius**, include/exclude · age 13–65 · gender · languages · interests · **custom/lookalike audiences** by name — never customer PII · exclusions · devices · placements) attached to campaigns via `AdCampaign.audienceSegmentId`. `src/lib/targeting.ts` = normalise (never throws) + one-line summary + **deterministic simulated reach** + **✨AI suggest** (builds a local-catchment audience from the Brand Brain — service areas + LocalAreaProfile suburbs/search-terms/services). Client form `ads/audience-form.tsx` (dynamic geo rows → `locationsJson`). `/ads` gets an **Audiences card** + a campaign **Audience column** (per-row picker) + create-form picker. Migration **0006** (audience_segments company-scoped RLS + `ad_campaigns.audience_segment_id` ON DELETE SET NULL). **Verified:** tsc + sweep + clean build (47 routes); in-memory browser (seeded segment renders; ✨Suggest built a real catchment; custom create 18–34/female/mobile persisted w/ correct narrowed reach; campaign picker set+clear persist); fixtures 16/16 + 15/15 no-regression. **Review (14 agents, 2-vote refute): 2 confirmed + 1 split, ALL fixed** — (1) blank age fields collapsed the band to 13–13 → now fall back to 13–65 (`numOrUndef`); (2) editing a segment's platform to be incompatible left a referencing campaign silently detachable → now the update **detaches now-incompatible campaigns** (invariant) + the row select always shows the current audience (flags mismatch); (3) reach seed was jsonb-key-order-dependent (differed in-memory vs Supabase) → now seeds on a **stableStringify** (order-independent). **⚠️ Migration `0006_ad_audience_targeting.sql` = the one required owner paste** (app degrades gracefully — audience reads → [] — pre-migration; `scripts/verify-paid-supabase.mjs` round-trips it once applied).
>
> **✅ Migration `0005_paid_advertising.sql` APPLIED + LIVE-VERIFIED (2026-07-07).** The 4 company-scoped tables (ad_accounts / ad_budgets / ad_campaigns / leads, RLS via `has_company_access`) exist on the live DB (`hrwkshspqeulgrmpqtpx`); `node scripts/verify-paid-supabase.mjs` did a real round-trip — inserts succeeded, numeric-column coercion + `allocation` JSONB correct, throwaway tenant purged by cascade (DB left pristine). In-memory demo also fully verified.
>
> **Verified:** tsc + floating-promise sweep + clean build (47 routes); in-memory browser round-trip (connect Google Ads → allocation split Meta 65% / Google 35% within the 20–80% bounds → **Apply persisted** → band totals correct); no regression (self-test 16/16 + queue-test 15/15, green in-memory AND live Supabase, purge-clean). **Adversarial review (4 dims → 2-vote refute, 26 agents): 2 confirmed (same root cause) + 1 split, ALL fixed** — paused/ended campaigns were still accruing simulated spend so the % -of-spend management fee was levied on phantom spend; `activeDaysInWindow` now freezes accrual at the stop moment (`updatedAt`/`endDate`) so a stopped campaign stops billing (proven: paused-10d-ago = 20 days vs active's 30, paused-before-window = 0, ended = clipped, draft = 0). Split + reviewer-endorsed hardenings applied: connect now **creates the new account BEFORE disconnecting the prior** (a failed create never drops a working connection); `recordLeadAction` validates the lead's campaign belongs to the company (closes an in-memory/Supabase divergence); the new-campaign form only offers CONNECTED platforms; boundedShares N≥3 limitation documented.
>
> **NEXT buildable (no keys):** finish Module 6's remaining env-gated pieces if wanted (a lead-ingestion webhook route behind `ADS_LIVE` + per-platform signature verification is the natural next slice, but it's genuinely gated on the ad-API approvals), then down the roadmap: **payment-tier matrix redesign** (Module 3/Phase 3 — per-client base + add-ons for video/photo/menus/order-button + Stripe products + entitlements), **AI visuals / video-first** (Module 2/Phase 4), **restaurant menus** (Module 4/Phase 5), **"Order Now" ordering** (Module 5/Phase 6, Stripe Connect), plus the world-class layer. Also per-tenant timezones (replaces `CC_TZ_OFFSET_MINUTES`).
>
> ---
>
> ## ▶ PRIOR SESSION (2026-07-06b — publish JOB QUEUE + platform ceilings shipped)
>
> **State:** T0–T7 COMPLETE + Supabase live-verified + cron service-context DONE **+ the scale pass's first two items are BUILT & LIVE-VERIFIED: a real PUBLISH JOB QUEUE (atomic claim / retries+exponential backoff / dead-letter+requeue / stale-claim recovery) and PER-PLATFORM RATE CEILINGS (IG ~25/24h, TikTok 15, FB 90, GBP 20 — over-ceiling posts defer silently and flow out as capacity frees).** Zero new required migrations — queue state = new status values on `scheduled_posts` (text col) + state DERIVED from the append-only `publish_logs`; **0004 is OPTIONAL performance indexes only** (paste whenever convenient). Verified by a **permanent queue fixture `/api/dev/queue-test` (15 checks)** + the isolation self-test (16 checks) — **both green in-memory AND against live Supabase, and the isolation fixture now RUNS under Supabase at all** (pre-existing gap: it 500'd on RLS; now wrapped in the cron's service context). DB left pristine (`scripts/verify-db-pristine.mjs`). Adversarially reviewed (49 agents, 2-vote refute): **8 confirmed findings ALL fixed** (see *Publish queue* section below) incl. the settle-restore zombie-post race, in-flight-vs-demotion convergence, dead-letter UX, and the UTC-vs-local `scheduledTime` gate (interim `CC_TZ_OFFSET_MINUTES`, e.g. 600 for AEST — set it in prod!). tsc + sweep + clean build.
>
> **Next buildable (no keys):** (B) **paid-ads budget model + AI allocation guidance** (module 6's env-gated half: budget model, connect UI, management-fee billing, unified dashboard — leans on UTM/CPL/lead-value analytics + the recommendation-engine pattern), then per-tenant **timezones** (replaces `CC_TZ_OFFSET_MINUTES`), bulk one-time-connect onboarding, AI-cost budgeting. Down the roadmap after that: payment-tier matrix redesign → visuals/video-first → menus → Order-Now → world-class layer ("five things": closed-loop ROI/portal · video-first · reviews+inbox/WhatsApp · agentic autopilot · ~~job queue~~ ✅ + network intelligence).
>
> **NEW BUSINESS DIRECTION — read `docs/BUSINESS-ROADMAP.md` FIRST.** Owner is scaling to **~1600 client accounts** (mixed industries; restaurant wedge; we are developer + first user). It defines **7 modules** (organic publishing ✅ · paid ads w/ delegated budgets + AI allocation · visuals · payment tiers · restaurant menus · "Order Now" ordering · + a **world-class vision layer**) and the **LOCKED decisions**: automated posting is OAuth-only (NEVER manage client passwords/2FA); paid ads are **delegated ad accounts + management fee** (client's own card pays platforms, we never front spend).
>
> **RUN IT — Supabase mode (real DB). TWO REQUIREMENTS (both environment, not code):**
> ```bash
> cd F:/MarketingHub/command-centre
> rm -rf .next && npm run build
> #  (1) TLS: this machine has a corporate TLS proxy, so Node must use the OS trust store,
> #      else UNABLE_TO_VERIFY_LEAF_SIGNATURE / "fetch failed":
> #      npm run start:supabase   # http://localhost:3000 (or -p PORT via next start -p)
> #      or use the preview launch config  command-centre-supabase  (port 5593).
> #  (2) Login needs SMTP: magic-link sign-in won't DELIVER until RESEND_API_KEY is set +
> #      Resend is configured as Supabase's SMTP (Auth → SMTP). generateLink (implicit flow) is
> #      NOT compatible with the app's PKCE /auth/callback, so there is no no-SMTP browser login.
> ```
> **RUN IT — demo mode (in-memory, zero external accounts, no TLS/SMTP needed):** rename/remove `.env.local` so `isSupabaseConfigured()` is false → `npm run dev` (or the `command-centre` / `command-centre-verify` preview configs). The in-memory demo (seeded Wattle + BrightSpark tenants) still works and is the safe fallback.
>
> **Paid advertising (2026-07-07) — what shipped (Module 6, env-gated half):**
> - Model (`src/lib/types.ts`): `AdAccount` (delegated, encrypted token), `AdBudget` (per-company singleton: monthlyBudget, per-platform `allocation`, `feeModel` percent_of_spend|flat_monthly, feePercent/feeFlat), `AdCampaign` (objective/status enums), `Lead` (attribution). `AdPlatform` = google_ads | meta_ads (v1). Repo methods in `db/index.ts` + `supabase-adapter.ts` + mapper numeric cols; `exportTenantData`/`purgeTenant` extended (ad token redacted). Migration **0005** (company-scoped RLS via `has_company_access`).
> - Engine: `src/lib/paid.ts` — deterministic SIMULATED metrics (`campaignMetrics` seeded by id; **`activeDaysInWindow` only accrues spend while a campaign is ACTUALLY running** — active → to now, paused/ended → frozen at the stop moment via `updatedAt`/`endDate`, draft → 0, so the % -of-spend fee is never levied on phantom spend), `managementFeeUsd` (the ONLY money we charge), `companyPaidSummary`. `src/lib/ai/allocation.ts` — `recommendAllocation` (ROAS/CPL-driven split, `boundedShares` clamps to 20–80% + redistributes, exploratory weight for no-data channels; **money math is deterministic — an admin must Apply it**). `src/lib/ad-connectors.ts` — `adsLive()` gate + documents the live drop-in. `billing.ts` — `createManagementFeeInvoice` (env-gated Stripe invoice against the tenant's own customer).
> - Actions (`src/app/(app)/ads/actions.ts`, all tenant-pinned): connect (create-new-before-disconnect-prior), disconnect, saveBudget, applyAllocation, createCampaign (requires a connected account), updateCampaignStatus, recordLead (validates the campaign belongs to the company), invoiceManagementFee (owner-only, sums fees across the tenant). Page `/ads`: unified band (managed spend / leads / CPL / revenue / ROAS / **our fee**), company selector, AI allocation table + Apply, budget+fee form, delegated accounts + connect, campaigns + status toggles, leads + record. Nav item + status-badge tones (active/paused/ended/new/qualified/won/lost).
> - **Locked model in code:** we NEVER front/hold ad spend — `spendUsd` is the CLIENT's spend; the only charge is the management fee via Stripe. Live campaign execution + lead-webhooks are gated on the Google Ads + Meta Marketing API approvals (`ADS_LIVE`).
> - **Review (26 agents, 2-vote refute): 2 confirmed (same root cause) + 1 split, all fixed** (paused/ended phantom-spend fee → frozen accrual; non-atomic connect → reordered; + lead-campaign ownership validation, connected-only campaign form, N≥3 allocation note). Verified in-memory (connect→allocate 65/35→apply→band correct) + fixtures 16/16 & 15/15 no-regression on both backends; the money-fix proven with past-dated stops. **Supabase live round-trip for the ad tables PENDING the 0005 paste (reads degrade to [] until then).**
>
> **Publish queue + platform ceilings (2026-07-06b) — what shipped:**
> - `src/lib/platform-limits.ts` (per-platform 24h ceilings, lowercase-substring matched like the connectors) + `src/lib/publish-queue.ts` (the engine: `processPublishQueue`/`publishPostNow`/`publishDuePosts`; policy MAX 5 attempts, backoff 5/15/45/120m, stale claims recovered after 15m as a counted failed attempt — the platform MAY have received it, so the log says to check before requeueing).
> - **One atomic primitive** powers everything: `transitionScheduledPost(tenantId, postId, {from[], to, updatedBefore?})` — conditional UPDATE, tenant-pinned, null = guard didn't match (lost claim), THROWS on backend error (never conflate outage with lost claim). Claim = scheduled/failed→publishing; recovery = publishing→failed (guarded by `updatedBefore`); dead-letter = failed→dead; requeue = dead→scheduled + a `"requeued"` log marker that RESETS the derived attempt count (attempts = failed logs since newest requeued/published marker — `attemptsSinceRequeue`).
> - **Release semantics (review-hardened):** every exit from an attempt is a GUARDED transition from "publishing" — an operator cancel mid-flight always wins. Transient skips (freeze/legal-hold/rights) restore the prior status without burning an attempt; **content-no-longer-publishable CANCELS the post at settle time** (so demotion/campaign-cancel converge even for in-flight posts — demotion sweeps use guarded transitions and deliberately skip in-flight rows). After a SUCCESSFUL platform send, bookkeeping can never surface as a retryable failure (would double-post) — worst case logs `published` with a bookkeeping-error note.
> - Scheduler/cron counts extended (`deferred`, `dead`); Publishing Centre: queue+ceilings panel (per-account trailing-24h usage), failure monitor with honest attempt budget + next-retry time, **dead-letter panel (requeue/cancel)**, button = `Run publish queue now (N due · M retryable)` using the ENGINE's own `isDue` (date + time gate, `queueNowParts()`), disabled + explained when automated publishing is off; freeze picker = v1 platforms ∪ connected legacy platforms (LinkedIn stays freezable where it exists). Calendar: publishing/dead chips, controls only where actions accept them ("Publishing now — can't be moved/cancelled mid-send"). `PLATFORMS` picker = FB/IG/GBP/TikTok/Email (v1 locked; LinkedIn dropped from NEW connections only).
> - **Review fixes worth knowing:** stale-claim recovery runs even when automated publishing is DISABLED (bookkeeping, not publishing — else a crashed post is frozen "publishing" forever); failed-post retries respect `scheduledDate/Time` (a failed early manual publish of a future post must NOT auto-publish early); per-candidate try/catch (one broken row never aborts a tenant tick); queue-critical adapter reads/writes THROW instead of silently returning `[]` (a transient `[]` would zero attempt counts and blow ceilings); in-memory publish-log sorts are tie-broken by insertion order (same-ms `requeued`+`failed` logs were ambiguous). **Both fixtures now report `purgeFailed` and set ok:false if teardown fails; queue-test tenants are created SUSPENDED so the real cron can never process fixture/zombie tenants.**
> - **`CC_TZ_OFFSET_MINUTES`** (env, e.g. `600` = AEST): schedule dates/times are local intent; the queue's due-gate shifts its wall-clock by this offset (unset → UTC = pre-queue behaviour). Interim until per-tenant timezones. Backoff/ceiling windows stay on raw UTC instants.
> - Accepted-with-comment tradeoffs: ceiling check-then-act may overshoot only under overlapping ticks (platform enforcement is the backstop; atomic Supabase RPC is the documented drop-in); stale-claim auto-retry can double-post if a worker died AFTER the platform accepted (rare; verify-before-retry belongs to the live-connector phase). Known scale note: the adapter's `.in("company_id", …)` pattern (pre-existing, everywhere) should be chunked when tenants reach hundreds of companies.
>
> **Previous session shipped (all tsc + floating-promise sweep + build clean; each adversarially reviewed; live-verified against Supabase):**
> - **T7 hardening:** per-tenant/plan rate limiting (`src/lib/ratelimit.ts`, env-gated, `CC_RATE_LIMIT=off` hatch) + permanent cross-tenant self-test fixture (`/api/dev/self-test`, 16 checks, dev-open / prod needs `CC_SELFTEST_SECRET`). Review found+fixed 6 (incl. sweep key-collision, studio 3× undercount).
> - **Supabase end-wiring:** generic mapper `src/lib/db/mapper.ts` + full ~100-method adapter `src/lib/db/supabase-adapter.ts` (RLS `usr()` vs service `svc()`) + **135 delegation guards** in `db/index.ts` + `audit.ts`. Review found+fixed 1 HIGH (mapper null→undefined broke platform-library `=== null` sentinels; now preserves null on `tenant_id`/`company_id`).
> - **Cron service-context fix:** `src/lib/db/service-context.ts` (AsyncLocalStorage) + adapter `usr()` service-fallback + scheduler wraps each tenant tick; migration **0003** (actor/creator/approver cols `uuid`→`text` so synthetic actors `system:cron`/`client:<email>`/`anon` work — also fixes the shipped client-approval + audit paths under Supabase). Verified: cron published a due post under Supabase (`published:1`) with clean publish-log + audit.
>
> **BATCHED OWNER INPUTS to gather (see `docs/BUSINESS-ROADMAP.md` → "external critical path"; nothing publishes to prod without the API approvals):**
> - **DB MIGRATIONS:** 0004→0008 ALL APPLIED + live-verified. **`0008_company_addons.sql` APPLIED (2026-07-07)** — service-role round-trip (`scripts/verify-entitlements-supabase.mjs`) + a 9/9 RLS leak-test (`scripts/verify-entitlements-rls-supabase.mjs`: own read/write OK, cross-tenant read→0 rows, cross-tenant write→42501) both green; DB left pristine. **No migration pending.**
> - **File FIRST (longest lead, heaviest):** paid-ads APIs — **Google Ads API** (dev token + access) + **Meta Marketing API** (`ads_management` + **Business Verification**). These unblock `ADS_LIVE` (live campaign execution + lead-webhooks).
> - Organic publishing: **Meta App Review** (FB+IG), **Google Business Profile API**, **TikTok Content Posting API**.
> - Keys: **`RESEND_API_KEY`** (+ Resend as Supabase SMTP → login), **`ANTHROPIC_API_KEY`** (live AI + AI budget guidance), `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_*` (also invoices the ad-management fee), shared OAuth (`META_APP_ID`/`GOOGLE_OAUTH_CLIENT_ID` + secrets) + `PUBLISHING_LIVE` + `PUBLISHING_TOKEN_KEY` + `APP_ORIGIN` + `CRON_SECRET` + `CC_TZ_OFFSET_MINUTES` (e.g. 600 AEST) + `ADS_LIVE`, `SUPABASE_MEDIA_BUCKET`.
>
> **NEXT BUILDABLE (no keys, fully verifiable now):** ~~scale pass (rate limits + job queue)~~ DONE 2026-07-06b · ~~paid-ads budget model + AI allocation~~ **DONE 2026-07-07 — see the *Paid advertising* section below.** Next: the **payment-tier matrix redesign** (Module 3 — per-client base + video/photo/menu/order add-ons + Stripe products + entitlements), then visuals/video-first → restaurant menus → Order-Now. Then work down the roadmap phases, env-gating + simulating external calls until approvals/keys land — the discipline that's worked all along.
>
> **Per-phase discipline (apply every phase):** extend model → engine libs (deterministic + env-gated fallback) → actions+pages → `npx tsc --noEmit` → floating-promise sweep (`node <scratchpad>/sweep-floating.js`) → clean build → live/browser verify → `Workflow` adversarial review (3–5 dims → 2-vote refute) → fix confirmed → rebuild → update HANDOVER + `docs/BUSINESS-ROADMAP.md` + `docs/SAAS-CONVERSION.md` + memory. **Isolation rule unchanged.** Under Supabase, always LIVE-verify (RLS + a real DB round-trip) — the code review can't catch uuid/FK/runtime issues (that's how the `0003` actor-id bug surfaced).

In-house AI marketing operating system for a group of related companies.
**Phases 1–12 are built and verified end-to-end** (MVP · Brand Brain · Approval & Compliance Engine · Campaign Planner · Content Studio · Social Calendar · Automated Publishing · Analytics & Reporting · AI Recommendation Engine · Advanced Admin & Security · Creative Asset System · Enterprise Automation). The **production-wiring path** (Supabase persistence + Auth, real platform connectors, live analytics, Resend email) is **code-complete behind env checks** — the in-memory demo still runs with zero external accounts; live verification awaits the owner's credentials.

Core rule enforced everywhere: **AI drafts → users review → admins approve → export. Nothing unapproved is published.**

---

## Run it

**Three environments:** local coding · staging preview · live production — see **`docs/ENVIRONMENTS.md`**.

```powershell
cd F:/MarketingHub/command-centre
npm install       # first time only

# Preferred local demo (port 3002):
powershell -ExecutionPolicy Bypass -File scripts\dev-3002.ps1
# → http://127.0.0.1:3002/login

# Or foreground:
# $env:CC_LOCAL_DEMO='true'; $env:NEXT_PUBLIC_CC_LOCAL_DEMO='true'; npm run dev -- -p 3002
```

- **Runs with zero external accounts.** Data is a seeded in-memory store; AI drafting uses a deterministic template when no API key is set.
- Node 24+, npm 11+. No database, Docker, or cloud project required for the demo.
- Staging / live deploy: `docs/DEPLOYMENT.md` · cutover: `docs/OWNER-LIVE-CUTOVER.md` (`https://mangotickle.com.au`).
- Preview/verify config: server name `command-centre`, port **5590** (in `C:/Claude/.claude/launch.json`).

### Demo accounts (passwordless — enter the email, no password)
Seed data models a fictional family group ("Wattle Group"): two IGA supermarkets, a motel and a cafe.

| Email | Role | Sees |
|---|---|---|
| `admin@wattlegroup.dev` | Super Admin | All companies |
| `priya@millbrookiga.dev` | Admin | Whole group (company admin for Millbrook IGA) |
| `tom@millbrookiga.dev` | User | Millbrook IGA only |
| `marco@westgateiga.dev` | User | Westgate IGA Xpress only |
| `deb@goldenwattlemotel.dev` | User | Golden Wattle Motel only |

Seed companies: **Millbrook IGA** (AI-ready, 100% onboarded), **Golden Wattle Motel** (AI-ready, 100%), **Westgate IGA Xpress** (approved, 90% — no source doc yet), **Wattle & Bean Cafe** (draft onboarding, 30%). Two open requests: an IGA winter-specials social post and a motel school-holidays campaign.

---

## What's built (Phase 1 go-live criteria — all met & verified)

- ✅ **Passwordless auth** — email-based sign-in, no password ever issued; individual accounts; sessions revocable.
- ✅ **Admin & User roles** with per-company scoping (RLS-equivalent). Verified: a scoped user sees only their nav + companies; cross-company URLs return 404.
- ✅ **Companies** — add, guided onboarding editor, **onboarding completeness score**, status lifecycle (`draft → pending → approved → ai_ready`), Brand Brain profile, document uploads.
- ✅ **Marketing support requests** — structured tickets with type, objective, schedule, consent flags, uploads, status history.
- ✅ **AI content drafting** — grounded in the company Brand Brain; records model, prompt, and sources (provenance). Claude API when `ANTHROPIC_API_KEY` is set, template otherwise.
- ✅ **Basic campaign idea generator** (in `src/lib/ai/draft.ts`).
- ✅ **Compliance checker** — flags absolute/guarantee/superlative claims, unverified stats, competitor comparisons, regulated-health claims, and company-specific prohibited claims; returns risk level + can-proceed.
- ✅ **Approval workflow** — submit → approve/reject/request-changes; approved content locks; editing approved content returns it to pending.
- ✅ **Manual AI social responses** — paste a comment → sentiment/intent/risk classification, auto-escalation of legal/safety/complaint items, drafted reply, human approval required.
- ✅ **Export** — approved content to **CSV** and individual items to **Word (.docx)**.
- ✅ **Audit log** — append-only, records every material action (login, draft, submit, approve, export, user/company changes).

**Verified flow:** request → AI draft (Brand-Brain-grounded) → compliance (clean) → submit → approve → CSV + Word export → audit trail all present.

### Deliberately excluded from Phase 1 (per master prompt)
Direct social publishing, live social inbox ingestion, advanced analytics, autonomous agents, CRM integration, paid-ad automation.

---

## Phase 2 — Brand Brain (built & verified)

- ✅ **Company knowledge base** — per-company knowledge documents (paste-in text: website copy, brochures, FAQs, past posts), with **versioning** (edits keep prior versions) and **archive/restore**. UI: `/companies/[id]/brand-brain`.
- ✅ **Source-grounded drafting with references** — drafts retrieve relevant knowledge-base snippets (keyword retrieval in `src/lib/ai/retrieval.ts`; swap for pgvector in production) and record structured `sourceRefs` shown on the content page as [S1]/[S2] quotes.
- ✅ **Grounding labels** (master prompt §21) — every draft is labelled **Grounded / Suggested by AI / Requires Evidence**, recomputed on every edit.
- ✅ **Local Area Intelligence Profile** (§22) — suburbs, demographics, competitors, events, seasonal patterns, search terms, buying triggers; fed into every draft. Editor on the Brand Brain page.
- ✅ **Service Catalogue** (§23) — structured service records with price-approval flags (unapproved prices are never given to the AI), margin priority, seasonality, disclaimers, restrictions. UI: `/companies/[id]/services`.
- ✅ **Knowledge gap detector + Ask-the-Local-Manager** (§51) — before drafting, the system checks for missing consent records, unsourced pricing, unevidenced performance claims, and missing offers. **Blocking gaps pause the request** (`needs_more_information`) and pose structured questions on the request page; answers feed the next draft as an authoritative source.

## Phase 3 — Approval & Compliance Engine (built & verified)

- ✅ **Approval routing** (§26, `src/lib/routing.ts`) — content routes by type/risk/evidence/consent: standard → any admin; website copy → company manager; **paid ads → senior**; high-risk / unsupported claims / consent-involved → **compliance review**. Senior + compliance queues require the **super admin** — enforced in the action, not just the UI.
- ✅ **Split approval inbox** — Compliance & senior queue vs Standard queue, with routing badges and per-role disabled controls.
- ✅ **Consent Register** (§28) — person shown, document, permitted channels, expiry, withdrawal. Named/shown customers without a valid record → **critical compliance flag**.
- ✅ **Evidence Locker + Claims Library** (§29) — claims found in content are cross-checked: approved-claim matches are positive signals; guarantee/superlative/price/stat/comparison claims match against evidence types; anything else is **Unsupported** (high risk + compliance routing). UI: `/companies/[id]/governance`.
- ✅ **Approved Response Library** (§39) — group-wide + company-specific reply templates; social drafting uses the closest match (verbatim in template mode, as grounding for Claude).
- ✅ **AI Risk Control Centre foundation** (§52) — `/ai-control`: every AI run logged (kind, model, prompt summary, sources, est. cost) + standing guardrails checklist.
- ✅ **Compliance report** — `/api/export/compliance/[id]` generates a per-item report: risk assessment, issues, claims audit, source references, full audit trail.

**Verified flows:** IGA draft grounded in 2 knowledge docs with [S1] citations · Westgate pricing request blocked by gap detector → local-manager answer → unblocked → drafted with answer as source · "guaranteed" edit → unsupported claim → High risk → routed to Compliance review → admin (Priya) sees disabled approve + super-admin notice · compliance report generated with `[UNSUPPORTED] "Guaranteed"` line · motel booking enquiry answered verbatim from Approved Response Library.

### Adversarial review (P2/P3)
A 61-agent multi-agent review (4 dimension finders → 3-vote adversarial verification per finding) confirmed 14 findings; all were fixed and re-verified:
approval action now requires `pending_approval` status and **re-runs governance at approval time** (kills the stale/undefined-route hole and stale compliance snapshots after consent withdrawal or claim deactivation); escalated social replies are approvable by the super admin (previously a dead-end); social replies now pass through the compliance engine at draft AND approval time; `#1` / `$`-pattern regex bugs; expired evidence no longer counts as claim backing; approved Claims Library wording is exempt from risk rules; claims audit scans **all** matches, not just the first; stale approval provenance cleared on edit/reject; grounding label persisted on submit; consent checks also honour the request's own `consentObtained` flag.

**Known limitation (by design of the P1-3 data model):** consent checking is company-level — it verifies a valid Consent Register record exists but cannot match the specific person named/shown (requests don't capture WHO). Add a person field to requests in a later phase for per-person matching.

---

## Phase 4 — Campaign Planner (built & verified)

- ✅ **Campaign builder** (`/campaigns/new`) — objective, audience, service focus, channels, 30/90-day duration, start date, live offer, optional local event. AI generates the full plan (Claude JSON when key set, validated with deterministic fallback); 90-day plans phase as Awareness → Engagement → Conversion.
- ✅ **Campaign approval + individually tracked items** — draft → pending → approved; item drafting is **blocked until the campaign is approved**; each item runs through the full governed content pipeline (grounding, claims audit, routing), and approving an item's content flips the item to Approved.
- ✅ **Request-to-campaign conversion** — one click on a campaign-type support request (blocked while local-manager questions are open); ticket completes with a link to the campaign.
- ✅ **Offer & Promotion Manager** (§30, `/companies/[id]/offers`) — structured offers with approved wording, terms, dates, disclaimer; draft → approved → archived; **the AI only promotes live approved offers** (drafting + gap detector updated); campaign items scheduled after the offer's end date are flagged **"After offer expiry"**.
- ✅ **Local event campaigns** (§48) — announcement → reminder → last-chance → day-of → thank-you sequence positioned around the event date.
- ✅ **Campaign pack export** — full Word document: plan, briefs, calendar and any drafted content (`/api/export/campaign/[id]`).
- ✅ Campaign plan generation logged in the AI Risk Control Centre (`campaign_plan` runs).

**Verified flows:** motel request r_1002 converted → 4-week/10-item plan with "Family rooms" service focus → submitted → approved → item drafted (grounded, source refs) → content approved → item flipped to Approved · 90-day campaign with the stay-2-save-15 offer → day-85 item flagged past the 2026-09-30 offer expiry · pack exported as .docx · offers page CRUD live.

### P4 adversarial review
A 45-agent review confirmed 7 distinct defects, all fixed: offers are validated as **live** at both campaign creation and item-draft time (server-side, with per-channel scoping per §30); the deterministic planner no longer wraps its role sequence (no duplicate "Kick-off" mid-plan; wrap-up always last); event dates must fall inside the campaign window and out-of-window sequence items are dropped, not clamped; closed requests can't be converted; only planned items can be drafted/skipped; campaigns auto-complete when every item is approved/skipped.

---

## Phase 5 — Content Studio Expansion (built & verified)

- ✅ **Content Studio** (`/studio`) — direct generation of 12 content types: social, blog, email, website copy, landing pages, **structured local landing-page briefs** (§47: 12 headed sections incl. SEO keywords from the Local Area Profile), FAQs, ad copy, video scripts, brochure copy, proposals, SEO meta sets. All studio output flows through the same grounding → compliance → claims-audit → routing pipeline.
- ✅ **AI draft comparison** (§24) — one click generates 3 tone/length variants (brand voice / professional / short & punchy); variant chips link the set; **approving one variant archives its siblings**.
- ✅ **Prompt templates** — save any studio brief as a reusable template (company or group-wide); templates prefill the studio. Seeded example: "Weekly specials post (Wed catalogue drop)".
- ✅ **Content Reuse Library** (§45, `/library`) — approved content with reuse permission, allowed channels, review + expiry dates. **Repurposing** creates a new draft in another format with full lineage ("Repurposed from …") — blocked for expired or reuse-not-permitted content.
- ✅ **Version history + restore** — every edit keeps the prior body; restoring re-runs governance and demotes approved content to re-approval.
- ✅ **Duplicate-content warning** (§47) — new drafts are shingle-compared against existing company content; near-duplicates get a warning banner.
- ✅ Routing extended: website copy / FAQ / SEO meta → company-manager approval.

**Verified flows:** template-prefilled 3-variant comparison → approve Friendly → siblings archived · repurpose approved post → email newsletter with lineage · expiry set → Library shows Expired, repurpose blocked · landing-page brief 12/12 sections → routed to Company manager approval · version edit → restore.
(Also fixed via verification: the brief template no longer quotes prohibited-claim wording verbatim, which had been self-triggering the compliance checker.)

**Known limitation:** stale-page detection and blog↔service-page link suggestions (§47) need a live website integration — deferred to the publishing phases (P7+).

### P5 adversarial review
A 25-agent review confirmed 7 distinct defects, all fixed: the repurpose gate now **defaults closed** (reuse must be explicitly permitted, not merely "not forbidden"); offer **channel scoping is enforced inside the grounding layer** too, not just the campaign action; comparison variants no longer false-flag each other as duplicates; comparison always yields 3 variants regardless of chosen tone; archived/rejected content can't be edited or resubmitted (protects sibling archival); demoting approved content **reverts its campaign item and re-opens a completed campaign**; sibling archival and campaign auto-completion now write audit entries.

---

## Phase 6 — Social Calendar & Scheduling (built & verified)

- ✅ **Central month calendar** (`/calendar`) — every scheduled post and planned campaign item in one view; month navigation; **filters per §34**: company, platform, status, campaign, request ID. Admins see the whole group; users see only their companies.
- ✅ **Scheduling** — approved content gets a Schedule card (platform/date/time, multiple schedules per item); **unapproved content can never be scheduled — enforced server-side**. Content flips to `scheduled`; cancelling the last schedule returns it (and its campaign item) to approved.
- ✅ **Drag-and-drop rescheduling** — drag a post chip to another day; the popover also has an accessible Move form + Cancel (same server action).
- ✅ **Post previews** — every chip opens a popover with body excerpt, status, links, and schedule controls.
- ✅ **Bulk scheduling** — "Schedule all approved items" on an approved campaign schedules each item at its plan date on its plan channel.
- ✅ **Conflict warnings** (§34) — >3 posts/company/day, duplicate platform posts (verified live: two Facebook posts same day flagged, cleared after moving one), content scheduled after its expiry date, after the campaign offer's end date, after the campaign's event, and on AU public holidays (2026–27 table in `src/lib/calendar-utils.ts`).
- ✅ **Governance ripple** — editing or version-restoring scheduled content cancels its schedules and sends it back through approval.

**Verified flows:** draft → approve → schedule ×2 same day (duplicate conflict shown) → move one (conflict cleared) · unapproved draft shows no scheduling UI and the action throws · motel campaign converted → approved → item drafted/approved → **bulk-scheduled** → item Scheduled + post on calendar · planned items render as faded chips · company/campaign filters scope correctly.

**Deferred:** publishing statuses (published/failed) activate in Phase 7; location-level filtering needs per-location content (arrives with the granular role model, P10).

---

## Phase 7 — Automated Publishing (built & verified)

- ✅ **Publishing integrations** (`/publishing`, admin-only per §31) — connect a company + platform + account + token; **tokens encrypted at rest (AES-256-GCM**, key from `PUBLISHING_TOKEN_KEY`, documented demo fallback); only the last four characters are ever displayed. Seeded: Millbrook IGA + Golden Wattle Motel Facebook pages.
- ✅ **Publishing engine** (`src/lib/publishing.ts`) — eligibility chain: kill-switch controls → connected integration → **content re-checked as approved+scheduled at publish time** → connector. The connector is **simulated** (deterministic failure via `[simulate-failure]` in the body); the production drop-in is one function (`simulateConnector` → platform SDK using `decryptToken`).
- ✅ **"Publish due posts now"** — simulates the production cron; publishes everything scheduled for today or earlier. Successful publishes cascade: post → content → campaign item → request all become `published`.
- ✅ **Failure monitor + retry** (§32) — failed posts flagged with the platform error, retries increment the attempt counter in the log.
- ✅ **Publishing freeze & kill switch** (§32) — FREEZE ALL, disable automated publishing, disable social replies, and per-company / per-platform / per-campaign pauses. Frozen attempts log as *skipped* with the reason; every control change is audited.
- ✅ **Publishing log** — append-only record of every attempt (published/failed/skipped, attempt #, detail).
- ✅ **Approved social-reply publishing** (§35) — Publish reply on approved responses, through the same engine (integration + kill-switch checks).
- ✅ **Published is terminal** — no edit/restore/reschedule of published content; repurposing is the path forward.

**Verified flows:** two posts scheduled for today → publish run → 1 published (cascade to content/calendar/audit) + 1 failed into the monitor → retry logged as attempt 2 → FREEZE ALL → retry skipped with the freeze reason → freeze lifted · compliment reply drafted → approved → **published to the Millbrook Facebook integration** with log entry · token last-4 display only.

**To go live with real platforms:** create Meta/LinkedIn/Google OAuth apps, set `PUBLISHING_TOKEN_KEY`, and replace `simulateConnector` with per-platform SDK calls using `decryptToken(integration.encryptedToken)` — the rest of the chain (eligibility, logs, retries, kill switch) is production logic already.

### P7 adversarial review
A 19-agent review confirmed 5 distinct defects, all fixed: demoting edited content now cancels its **failed** posts too (a stale failed post could otherwise be retried after re-approval and double-publish); cancelling a leftover schedule no longer demotes a **published** campaign item; reply publishing derives honest attempt numbers from the log; reply approval is guarded to pending/escalated status (published replies can't be re-approved and published twice); closing replies is guarded (published/closed are final; escalated/approved need an approver). A sixth finding — published items blocking campaign completion — was fixed proactively before the reviewers finished.

---

## Phase 8 — Analytics & Reporting (built & verified)

- ✅ **Analytics dashboard** (`/analytics`, admin) — content funnel (requests → drafts → pending → approved → scheduled → published → rejected), reach/engagement/clicks/leads/est-revenue/AI-spend, tables by **platform / company / campaign**, best & worst content, social-engagement analytics (interactions, published replies, escalations, sentiment, top enquiry types), and governance/timeliness (AI draft acceptance, human edit rate, avg approval time, avg request turnaround).
- ✅ **Deterministic metrics simulator** (`src/lib/analytics.ts`) — per published post, seeded by post id so dashboards are stable across reloads. **Production drop-in:** replace `metricsForPost()` with a pull from each platform's Insights API / the CRM; every aggregation downstream is real reporting logic.
- ✅ **UTM builder + ROI/attribution** (`/analytics/utm`, §42) — build trackable links (source/medium/campaign/content/request-id → `utm_*` params, copy-to-clipboard); leads & revenue attributed by campaign and platform; conversion rate, cost-per-lead, estimated revenue (per-industry lead value).
- ✅ **AI management summary** (§41) — one click generates a plain-English performance summary + recommendations from the live numbers (Claude when keyed, deterministic template otherwise); logged as a `management_summary` run in the AI Control Centre.
- ✅ **Local Manager Dashboard** (§43) — on `/dashboard` for scoped users: requests submitted/approved, avg turnaround, posts published, engagement, leads, upcoming scheduled posts, common enquiry types, and missing-onboarding prompts — all scoped to their own companies.

**Verified flows:** published a Millbrook post → Analytics showed Reach 4,746 / 277 engagements / 98 clicks / 7 leads / $224 est. revenue (7 × $32 IGA lead value) with Facebook in the by-platform table · AI summary wove the real figures into its narrative · UTM builder produced `…?utm_source=instagram&utm_campaign=spring-school-holidays` · Tom's Local Manager Dashboard showed his 1 published post and leads, with Analytics/Publishing nav correctly hidden · both analytics pages render safely with zero data.

**Known limitation:** engagement/lead figures are simulated (no live platform data yet) and the per-lead value is an industry placeholder; social response-time metrics aren't tracked (only volume + acceptance). All become real once platform Insights + CRM are connected.

### P8 adversarial review
A 21-agent review confirmed 3 distinct defects, all fixed: best/worst content could overlap when fewer than 10 posts were published (bottom now drawn from items not in the top set — empty with ≤5 posts); request-turnaround measured time-to-approval instead of time-to-publish (now uses `findLast` for the terminal event); email opens were conflated with social engagement in cross-channel rankings (ranking now uses active engagements — email clicks — with opens tracked separately).

---

## Phase 9 — AI Recommendation Engine (built & verified)

- ✅ **Company-specific recommendations** (`/recommendations`, §44) generated from the live analytics + Brand Brain signals — rule-based and grounded (not generic AI text): best platform, repurpose top performer, underperformer alert, content gap (services never posted about), timing (local buying triggers), offer refresh (expiring/none), complaint insight, FAQ insight, next campaign, stale content.
- ✅ **Actionable** (§44 "become tasks, campaign drafts or content requests") — every recommendation can be turned into a **content request** or **campaign** (redirects to the builder **prefilled** — verified: "Drive demand around Winter: soup vegetables" landed in the campaign builder with the company preselected), a **task**, or opened for **repurpose/review**; or dismissed. Turning a rec into work only prefills the governed builder — it never bypasses drafting/compliance/approval.
- ✅ **Generation dedupes** against existing open recommendations (no pile-up on regenerate) and is only offered for AI-ready companies.
- ✅ **Tasks** (`/tasks`, §44/§50) — recommendation-sourced and ad-hoc tasks, scoped to the user's companies, with complete/reopen. Recommendation → task links back via `sourceRecommendationId`.
- ✅ Recommendations + tasks respect company scoping (users see only their companies; every action asserts access) and log to the audit trail. History shows actioned/dismissed outcomes.

**Verified flows:** generated Content Gap / Timing / Next Campaign for Millbrook → turned Next Campaign into a prefilled campaign (rec marked Actioned) → added a rec as a task ("From recommendation") → completed the task → request-builder prefill confirmed (topic + type=faq + company).

### Environment note
`next build` (prod) and `next dev` share the `.next/` directory; running one after the other in the same dir can 404 nested routes until `.next` is cleared. The prod build always compiles all routes correctly — clear `.next` when switching modes.

---

## Phase 10 — Advanced Admin & Security (built & verified)

- ✅ **Admin & Security console** (`/admin`, admin-only) — one panel for crisis mode, sandbox mode, data-retention + AI-cost-cap settings, system health (Support Console §55: publishing failures, integrations, AI runs, active legal holds), login/session activity (incl. failed logins), and the privacy & consent review queue (§53).
- ✅ **Crisis Communications Mode** (§33) — one toggle freezes ALL publishing and forces EVERY social reply to escalate for senior review; a red banner shows across the app. Verified: banner appears, publish button disabled, a benign compliment came back *Escalated* while crisis was on.
- ✅ **Sandbox / training mode** (§56) — blocks publishing so teams can train safely; amber banner.
- ✅ **Legal Hold registry** (`/admin/legal-hold`, §54) — apply/release holds at content / social / company scope; **held records cannot be edited or restored** (guarded in every content mutation path). Verified: applied a content hold → the edit was rejected and did not persist.
- ✅ **AI cost cap** — month-to-date AI spend vs a configurable cap; `assertAiBudget()` guards every generation entry point (requests, campaigns, studio, social, summary, repurpose). Template mode is $0 so it only bites with a live key.
- ✅ **Granular roles** (§9) — the full 10-role structure (Super/Group/Company Admin, Local Business Manager, Content Operator, Approver, Compliance Reviewer, Publisher, Analyst, Viewer) assignable on `/users`; each title syncs the enforcement tier via `ROLE_TITLE_TIER`.
- ✅ **Failed-login monitoring** + **audit CSV export** (`/api/export/audit.csv`, admin-only, §57).

**Production path (documented, not implemented — external-account dependent):** real SSO / mandatory admin 2FA / passkeys map to Supabase Auth; backup / restore / disaster recovery map to Supabase PITR + storage backups. These were represented as settings/status rather than built, consistent with the passwordless-demo approach.

### P10 adversarial review
A 25-agent review confirmed 8 defects — a coherent cluster: the legal-hold guard was only wired into content save/restore, so held records could still be mutated via **content approve/reject/submit/recheck, scheduling, the publishing engine (critical — held content published live), and the entire social pipeline** (social-scope holds enforced nowhere). All fixed: every content mutation action now calls `assertNotOnHold`; scheduling throws on held content; the publishing engine skips held content/replies (logged); and social approve/publish/close guard on `isUnderLegalHold("social", …)` (covering company scope too). Also hardened (rejected findings, applied anyway): `setRoleTitleAction` validates the title (no undefined enforcement tier) and `applyLegalHoldAction` validates the scope.

---

## Phase 11 — Creative Asset System (built & verified)

- ✅ **Asset library** (`/assets`, §46) — logos/images/videos/graphics/documents grouped into per-company folders, filterable by company/type/status. Metadata only, never bytes (mirrors the request-upload pattern); Canva/Figma/stock sources keep an external edit reference.
- ✅ **Usage-rights tracking** — every asset records owner, licence type, licence ref, consent (linked to the Consent Register), **allowed channels**, expiry and restrictions. The core rule (`src/lib/assets.ts`): **an asset may not be used in a channel unless its rights allow it** — enforced server-side at **schedule time** (`scheduleOne → assertAssetsAllowChannel`) and **re-checked at publish time** (`publishScheduledPost → assetsBlockingChannel`). Expiry, a withdrawn/expired/**missing** linked consent (fail-closed), and channel scope all block use.
- ✅ **Creative approval workflow** — draft → pending → approved/rejected/changes; only **approved** assets can be referenced by content. Editing an approved asset returns it for re-approval. Approval validates the linked consent record exists and is valid.
- ✅ **Content ↔ asset references** — attach approved assets to a content item; scheduling/publishing is **blocked** on any channel a referenced asset doesn't permit. The content page shows attached assets, live warnings, and a per-channel eligibility panel on the asset page.
- ✅ **Brand templates** (`/assets/templates`, §46) — reusable Canva/Figma layouts, group-wide or per-company (group-wide is super-admin only); fed into image briefs.
- ✅ **AI image-brief generator** (`src/lib/ai/imagebrief.ts`) — structured, Brand-Brain-grounded creative brief (Concept / Shot list / Composition / Style / Must include / Must avoid / **Usage rights** / Suggested template). Runs as a governed `creative_request` content item; deterministic fallback with no API key. (Video scripts already live in Studio.)

**Verified flows:** UGC asset cleared for **Website only** → content referencing it **blocked from Facebook** server-side, **allowed on Website** · expired stock licence and missing/withdrawn consent block every channel · asset detail channel-eligibility panel (✗ FB/IG/LinkedIn/GBP/Email, ✓ Website) · AI image brief generated with all sections · creative approval + tagging.

### P11 adversarial review
A 13-agent review (3 dimensions → 2-vote refute) confirmed 4 distinct defects, all fixed: the usage-rights gate now follows `consentRef` into the Consent Register and blocks a **withdrawn/expired/missing** linked consent (fail-closed); asset approve/reject are company-scoped (`assertCompanyAccess`) like create/edit; group-wide brand templates are restricted to the super admin; asset approval validates the linked consent record. Seed corrected so the UGC demo links a valid Website-only consent.

## Phase 12 — Enterprise Automation (built & verified)

- ✅ **Automation engine** (`src/lib/automation.ts`, §61 Phase 12) — the cron drop-in `runAutomations()`. Admin-only, **OFF by default** (`AutomationSettings.enabled`). It **NEVER publishes** and never bypasses a human-approval gate — every artifact is a draft/pending/recommendation a person still signs off.
- ✅ **Jobs:** automated **draft-campaign suggestions** (created as `draft`, need approval), **monthly content generation** (grounded `ai_draft` items, need review), **analytics summaries** (group performance summary each run), **content alerts** (repurpose / stale-content / performance / offer-refresh recommendations).
- ✅ **Low-risk auto-responses** (§40) — **OFF by default**, Admin-enabled. Auto-**approves** (never publishes) low-risk `compliment` / `general_enquiry` replies, and only while crisis mode / sandbox / `socialRepliesDisabled` are all off. Auto-approve is the admin's pre-authorised approval; publishing stays a separate gated step.
- ✅ **"Run automations now"** (`/automations`, admin) — the cron tick as a button. Spawns drafts/recs/summaries; nothing is published.
- ✅ **Automation-limit controls** — `maxCampaignsPerRun` (per run) and `maxDraftsPerCompany` (bounds **created** drafts, deduped before spending an AI call); AI cost cap respected; dedup prevents pile-up across runs.

**Verified flows:** Run now → 2 draft campaigns (capped) + 4 content drafts (2/company) + 1 analytics summary, **all awaiting approval, nothing published** · second run deduped to 2 outcomes (Westgate campaign + summary) · low-risk compliment reply **auto-approved but not published** (Publish-reply button still required).

### P12 adversarial review
A 9-agent review confirmed 3 defects, all fixed: the monthly-content cap now bounds drafts **created** (deduped before the AI call, no wasted budget); a **missing** linked consent record now blocks an asset (fail-closed, `assetUsableReason`); asset approval rejects a dangling/withdrawn `consentRef`.

---

## Production wiring — Supabase + OAuth (code-complete behind env checks)

Everything below is **env-gated**: with no env set the in-memory demo runs unchanged (simulated publisher/metrics, template AI, passwordless demo auth). Provide the owner credentials to flip each block on.

- **Schema + RLS** — `supabase/migrations/0001_phase1_init.sql` now covers **every** entity (Phases 2–12) with Row-Level Security mirroring `src/lib/auth/rbac.ts`: admins group-wide (`is_admin()`), users scoped (`has_company_access()`), group-wide rows (null company) readable by all signed-in, publishing integrations admin-only, singletons (controls/security/automation) admin-writable.
- **Data layer** — `src/lib/db/supabase.ts` (env-gated client factory: request-scoped RLS client + service-role client) and `src/lib/db/supabase-adapter.ts` (row↔domain mappers + async CRUD across the app's main read+write surface — users, companies, requests, content, assets, campaigns, offers, scheduled posts, integrations, publish logs/controls, recommendations, tasks, social, knowledge/services, AI runs, security/automation singletons, audit; the remaining governance sub-entities follow the same pattern). **One documented remaining step (`docs/PRODUCTION.md` §2):** the in-memory repo (`src/lib/db/index.ts`) is synchronous; adopting the adapter means making those functions `async` and awaiting at the (already-async) call sites — a tsc-guarded mechanical change, selected by `isSupabaseConfigured()`, best done with the project connected so RLS is verified live.
- **Auth** — `src/lib/auth/session.ts` resolves a Supabase Auth session → `app_users` (role/roleTitle) when configured, else the demo cookie session; `getCurrentUser/requireUser/requireAdmin` contracts unchanged. `src/proxy.ts` refreshes the session cookie each request (pass-through in the demo). Magic link + OAuth SSO (`signInWithOAuth('google'|'azure')`) + `/auth/callback` code exchange; passkeys + mandatory admin 2FA are Supabase-dashboard config.
- **Publishing** — `src/lib/publishing-connectors.ts` (`dispatchPublish`) makes real Meta / LinkedIn / Google Business Profile / email calls with `decryptToken(...)` when `PUBLISHING_LIVE=true`; otherwise the deterministic simulator. The full eligibility chain (kill switch, crisis/sandbox, legal hold, asset-rights, retries, logging) is **unchanged** — only the send step swaps. Engine converted to async (call sites awaited).
- **Analytics** — `src/lib/analytics-connectors.ts` (`fetchLiveMetrics`) pulls platform Insights + CRM leads when `ANALYTICS_LIVE=true`, else the deterministic simulator. Wiring live metrics is the one documented async step in `analytics.ts`.
- **Email** — `src/lib/email.ts` sends via Resend when `RESEND_API_KEY` is set (safe no-op otherwise); configure Resend as Supabase's SMTP for magic-link delivery.
- **Env** — see `.env.example` (all blocks documented).

### Backup / restore / disaster recovery (production)
- **Database:** Supabase **Point-in-Time Recovery** (PITR) + automated daily backups (Pro plan). Target RPO ≤ 5 min via WAL; document RTO with the DR runbook. Test a restore into a staging project quarterly.
- **Assets:** metadata lives in Postgres (covered by PITR); the actual creative bytes live in the owner's Canva/Figma/stock/Supabase Storage — enable **Supabase Storage backups** (or the provider's) for those buckets.
- **Secrets:** `PUBLISHING_TOKEN_KEY` must be backed up in the deployment secret store — losing it makes every stored publishing token undecryptable. Rotating it re-encrypts tokens via a migration.
- **Audit:** `audit_logs` is append-only (RLS: insert-only, no update/delete) and included in PITR — the compliance record survives a restore.

### What still needs the owner (batched)
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` (+ run the migration); `ANTHROPIC_API_KEY` (+ optional `CC_AI_MODEL`); `PUBLISHING_TOKEN_KEY` (32+ chars); `RESEND_API_KEY`; Meta/LinkedIn/Google OAuth apps (client id+secret) with `PUBLISHING_LIVE=true`; `ANALYTICS_LIVE=true` (+ optional CRM feed). Then complete the sync→async adapter adoption and verify RLS + connectors live.

---

## ⏭️ NEXT WINDOW — start here

**State:** **All 12 phases complete**, each built → browser-verified → adversarially reviewed (multi-agent) → fixed → shipped. ~270 agents across 11 review fleets; 70+ confirmed defects caught and fixed. Everything runs with **zero external accounts** (in-memory store, simulated publisher/metrics, template AI fallback). The production-wiring path (Supabase + Auth + real connectors + Resend) is **code-complete behind env checks**; live verification awaits the owner's credentials (batched list in *Production wiring* above).

**Run the demo:**
```bash
cd F:/MarketingHub/command-centre
npm run build && npm run start   # prod, http://localhost:5591
# or: npm run dev                # http://localhost:5590
```
Sign in (passwordless) as `admin@wattlegroup.dev` (super admin) — demo accounts listed on the login screen. In-memory store resets to seed on restart.

**⚠️ Environment gotcha:** `next build` and `next dev` share `.next/`. After running one, **`rm -rf .next` before running the other**, or nested routes 404. The prod build always compiles all ~40 routes correctly.

**Verify workflow (per phase):** build the feature → `npx tsc --noEmit` → browser-verify via preview tools (note: server actions that `redirect()` kill an in-progress `preview_eval`; drive one navigating action per eval, read the result in the next) → run a `Workflow` adversarial review (3 finder dimensions → 2-vote refute) → fix confirmed findings → rebuild → relaunch → update HANDOVER/README/memory.

**Architecture recap:** all data access via `src/lib/db/index.ts` (in-memory `store.ts`; Supabase adapter `supabase-adapter.ts` is the documented swap, schema in `supabase/migrations/0001_phase1_init.sql`). AI via `src/lib/ai/*` (Claude when `ANTHROPIC_API_KEY` set, deterministic fallback otherwise). Roles enforced in `src/lib/auth/rbac.ts`. Every mutation flows through `logAction` (append-only audit). Creative usage-rights gate in `src/lib/assets.ts`; automation engine in `src/lib/automation.ts`; real connectors in `src/lib/publishing-connectors.ts` / `analytics-connectors.ts`, all env-gated.

**What's left is operational, not feature work:** provide the owner credentials (see *Production wiring → What still needs the owner*), run the migration, complete the mechanical sync→async adapter adoption, and verify RLS + connectors against the live project. The feature set for Phases 1–12 is done.

---

## Architecture & key decisions

- **Next.js 16 (App Router) + TypeScript + Tailwind v4.** Server Components + Server Actions; no client state library.
- **Data layer is swappable.** All reads/writes go through `src/lib/db/index.ts`. Phase 1 backs it with an in-memory store (`store.ts`) so the app runs anywhere. The production path (Supabase Postgres) is written in `supabase/migrations/0001_phase1_init.sql`, including **Row-Level Security** that mirrors `src/lib/auth/rbac.ts`.
- **AI layer** (`src/lib/ai/`) — `claude.ts` wraps the Anthropic SDK with a null-safe fallback; `draft.ts` / `compliance.ts` / `social.ts` implement drafting, checking, and classification.
- **Auth** (`src/lib/auth/`) — cookie session + RBAC. Production maps 1:1 to Supabase Auth (magic link / OAuth SSO / passkey) — the app contract (a session resolving to an individual `User`) is unchanged.

Why in-memory for Phase 1: this machine's Docker is unreliable and no Supabase project exists yet. This keeps the MVP runnable and fully demoable now, with a clean, documented path to production persistence.

---

## To go to production (batched owner inputs)

**Full step-by-step runbook: [`docs/PRODUCTION.md`](./docs/PRODUCTION.md)** — collects the owner inputs (§0), runs the migration + verifies RLS (§1), the sync→async adapter adoption (§2), auth/SSO/2FA (§3), live publishing (§4), live analytics (§5), email (§6), the backup/DR plan, and a post-deploy verification checklist. In short: the code is written and env-gated; provide the Supabase project + keys + OAuth apps, run the migration, complete the mechanical sync→async adapter adoption, and verify live. Nothing here blocks the demo.

---

## Status: Phases 1–12 complete
Feature build finished (master prompt §1–61). Full roadmap: `F:/MarketingHub/complete_ai_marketing_platform_master_prompt.docx`. Production go-live is credential/verification work, not feature work — see *Production wiring* above.

## ⏭️ NEXT WINDOW — SaaS conversion (T0–T3 DONE, T4–T7 remain)

Owner is converting the finished 12-phase product into a **multi-tenant SaaS** (marketing agencies with client companies / owners of multiple businesses). Full plan + **all 5 owner decisions LOCKED** in **[`docs/SAAS-CONVERSION.md`](./docs/SAAS-CONVERSION.md)** — read it first. Decisions: templates = tenant-wide **+ curated platform library**; **shared** platform OAuth apps (file Meta App Review early); AI **platform-billed + metered per tenant**; pricing **per-client-company** (plan gates `companies.count`); v1 includes **white-label AND client approval links**.

### Run it (verify before claiming anything works)
```bash
cd F:/MarketingHub/command-centre
npm run build && npm run start   # prod → http://localhost:5591
# dev → npm run dev              # http://localhost:5590
rm -rf .next                     # ALWAYS between build↔dev, or nested routes 404
```
This session used a preview server **`command-centre-verify` on port 5592** (added to `C:/Claude/.claude/launch.json`) because another chat holds 5591. In-memory store **resets to seed on restart**.

### Demo accounts (two isolated tenants + a dual-tenant user)
| Email | Tenant / role | Proves |
|---|---|---|
| `admin@wattlegroup.dev` | Wattle Group — **owner** + platform admin | business-group tenant |
| `sasha@brightspark.dev` | BrightSpark — **agency owner** (2 client cos) | agency tenant |
| `liam@brightspark.dev` | BrightSpark — member (Dental only) | scoped member |
| `jordan@freelance.dev` | **member of BOTH** (admin in BrightSpark) | **tenant switcher** |
| `/signup` | self-serve new workspace | provisioning |

### Progress
- **T0 — async repo: DONE.** Whole data layer async (`db/index.ts` + audit/scope/rbac-helpers/compliance/similarity/retrieval/gaps/budget/recommend/assets-gate/analytics/publishing/automation), ~1,550 call sites. Behaviour-identical, verified.
- **T1–T2 — tenancy core: DONE.** `Tenant`+`TenantMember`(owner/admin/member); `ActingUser`=User+{tenantId,tenantRole} from the session resolver; `tenantId` on companies + all tenant-owned records; the 3 settings singletons are now **per-tenant arrays**; templates/responses gained a **platform-library tier** (`tenantId:null`). Repo list-fns take a **required `tenantId`** (unscoped read = compile error). RBAC: `canAccessCompany` checks tenant **first**; `super_admin` tier ≙ tenant owner; `platformAdmin` flag (no tenant-data access). Migration RLS rewritten (`is_tenant_member`/`is_tenant_admin`/`is_platform_admin`; `has_company_access` kept its name). Adversarial isolation review (14 agents) found+fixed **2 CRITICAL cross-tenant write holes** + non-deterministic session resolution.
- **T3 — SaaS shell: DONE.** `/signup`, sidebar tenant switcher (`cc_tenant` cookie via `setActiveTenant`, membership-verified), team invites (tenant-scoped createUser+addMembership, global-identity dedup), de-hardcoded "Wattle Group". Verified: Jordan switches workspaces with isolated access; new empty tenant renders 22/22 pages.
- **T4 — Billing & metering: DONE (2026-07-05).** `src/lib/plans.ts` (starter/agency/scale → per-plan **client-company limit**, monthly AI allowance, `automations`/`whiteLabel` feature flags); `src/lib/billing.ts` (`tenantUsage`, `assertCompanyQuota`, `assertPlanIncludesAutomations`, Stripe Checkout/Portal + `verifyStripeSignature`, all via direct Stripe REST — **zero new deps**). Meter **reuses existing machinery**: `effectiveAiCapUsd = min(adminCap, planCap)` feeds the unchanged `aiBudgetExceeded`/`aiSpendThisMonth` off `ai_runs.estCostUsd`. Owner-only **`/billing`** page (plan + usage meters + plan cards + portal) behind `requireTenantOwner`; `ownerOnly` nav item. Gates: `createCompanyAction` → `assertCompanyQuota`; automation **engine entry** (`runAutomations`) + `saveAutomationSettingsAction` enable → `assertPlanIncludesAutomations`. Stripe **env-gated**: no keys → demo applies plan changes immediately (owner-only, audited); the **signed webhook** (`/api/billing/webhook`, resolves tenant from server-trusted payload ids only, idempotent, try/catch) is the only billing writer when live. Verified: tsc + sweep clean, clean build, **browser isolation matrix all green** (quota blocks BrightSpark's 3rd company at 2/2; demo upgrade→Agency unlocks automations + 2/10; automations "Not in plan" + disabled on starter; cross-tenant URLs 404; webhook 503 unconfigured; `/billing` owner-only, member redirected + nav hidden). **Adversarial review** (5 dimensions → 2-vote refute, 17 agents): 6 findings raised, **0 confirmed** — all refuted against real code (tenant resolved only from signed ids; `str() ?? existing` preserves linkage; engine re-gates; the effective-cap "divergence" was dead adapter code). Applied 4 reviewer-endorsed zero-risk hardenings anyway: webhook per-event try/catch, checkout idempotency guard, aligned the Supabase-adapter/migration default AI cap to 50 (matches in-memory), UNIQUE `stripe_customer_id` index.
- **T5 — Shared platform OAuth connect: DONE (2026-07-05).** `src/lib/oauth.ts` (provider registry Facebook/LinkedIn/Google over the SHARED platform apps; HMAC-signed `state` binding tenant/company/user + `issuedAt`; `authorizeUrl`; `exchangeCodeForToken`; all **env-gated** via `oauthConfigured` = `PUBLISHING_LIVE` + app creds + `PUBLISHING_TOKEN_KEY`). Tenant admin flow on `/publishing`: `startOAuthConnectAction` (tenant-pinned `assertAdminCompanyAccess`, signed state, CSRF nonce cookie, redirect to consent) → **`/api/oauth/callback`** (HMAC verify → state expiry → nonce → **live-session re-verify**: `isAdmin` ∧ `user.id===state.userId` ∧ `user.tenantId===state.tenantId` ∧ `canAccessCompany` → `exchangeCodeForToken` → encrypted, tenant-scoped `PublishingIntegration`). Demo path unchanged: no creds → OAuth UI hidden, manual token-paste + simulator stay. **Verified** (tsc + sweep clean, clean build, browser + curl, BOTH env states): demo hides OAuth/keeps manual paste; env-ON shows Facebook/LinkedIn (Google absent) with tenant-scoped companies + issues a 303 to consent; callback rejects missing-code / declined / tampered-state (HMAC) / stale-state (expiry) / missing-issuedAt (full-shape) / no-nonce / valid-state+nonce-but-no-session; co-gate hides OAuth when `PUBLISHING_TOKEN_KEY` unset. **Adversarial review** (3 dimensions: oauth-isolation / state-csrf / env-gating-secrets → 2-vote refute, 13 agents): **5 findings, 0 confirmed** (isolation gates hold; open-redirect needs a proxy trusting client `X-Forwarded-Host`; "replay" needs a `code` absent during consent). Applied 4 reviewer-endorsed hardenings: **`APP_ORIGIN`** anchor (`src/lib/origin.ts`, wired into OAuth + billing redirect targets — kills Host-header spoofing), signed-state **expiry** (`STATE_MAX_AGE_MS`), **`PUBLISHING_TOKEN_KEY` co-gate**, and **full-shape `verifyState`** validation.
- **T6 — White-label + tokenised client approval: DONE (2026-07-05).** **White-label:** `Tenant.branding` (accentColor overrides the `--primary` theme app-wide + on client pages, logoUrl, emailFromName, approvalMessage); owner-only plan-gated `/branding` editor (`planIncludesWhiteLabel`); accent applied in `app-shell.tsx`, sender name in `email.ts`. **No-login client approval:** `src/lib/token.ts` (generic HMAC `signPayload`/`verifyPayload` with expiry + shape validator) → `shareForClientApprovalAction` (admin-only, tenant-pinned, mints a 7-day token bound to tenant+company+content, stores the link + emails the client) → PUBLIC **`/approve/[token]`** route (outside `(app)`, no auth) rendering the item branded + read-only with a "Compliance-checked" badge and NO internal nav. The client's decision runs the **same governed pipeline** (`src/lib/content-governance.ts` `governContent`, extracted so it's shared): `canClientApproveRoute` blocks senior/compliance-routed items, `compliance.canProceed` required — never a bypass. The client's approval is a first-class audit record (`content.client_approved` attributed to the client email) — the "exceed parity" evidence trail. **Verified** (tsc + sweep clean, clean build, browser + curl): branding accent applies app-wide + on the public page; agency plan enables it, starter shows "Not in plan"; create→submit→share→client-approve flips content to approved; tampered/garbage/expired tokens rejected. **Adversarial review** (3 dimensions → 2-vote refute, 13 agents): **1 CRITICAL confirmed + fixed** — a stale token could re-approve after an internal edit re-opened the item (status-only guard); fixed with `assertShareIsLive` (token bound to an un-consumed pending share for that client) + clearing `clientReview` on edit/restore/re-submit, **verified end-to-end** (post-edit the old token is non-actionable). Plus 4 hardenings from dismissed findings: `verifyPayload` shape validator, `logoUrl` http(s)-scheme validation, and the public page no longer leaks the internal route label to the client.
- **Gap-closing batch — DONE (2026-07-05).** After the competitive review, closed every buildable gap (env-gated; demo runs with zero accounts):
  - **Dev persistence** (`src/lib/db/store.ts`): `CC_STORE_FILE=<path>` hydrates the store on boot + atomic snapshots every 2s + on exit, so the demo **survives restarts** (verified: a workspace created pre-restart survived a bounce). Dev/single-node only; Supabase remains the serverless production path. Corrupt/schema-drift snapshots coerce every collection to an array or fall back to seed.
  - **Scheduler** (`src/lib/scheduler.ts` + `/api/cron/tick` + `src/instrumentation.ts` + `vercel.json`): headless `runScheduledTick()` iterates active tenants (per-tenant system actor) → `publishDuePosts` + gated `runAutomations`; one tenant's error never aborts others. Cron route `CRON_SECRET`-authenticated (timing-safe): 503 unconfigured / 401 bad key / 200 runs (verified). Vercel Cron in prod, `CC_SCHEDULER=1` local heartbeat.
  - **Unified social inbox** (`/inbox`): `SocialMention` model + tenant-scoped repo + seeded demo mentions; `fetchNewMentions` env-gated live pull (`src/lib/social-connectors.ts`); "Draft reply" runs the SAME governed social pipeline and links the mention (verified: reply created Pending-Approval, mention marked drafted, count updated). Page scoped to `accessibleCompanyIds`.
  - **Collaborative comments** (`ContentComment`): thread on the content page (team) AND on the public `/approve/[token]` page (client, via a live-share token) — verified team comment attributed correctly.
  - **GDPR data export + delete** (T7 compliance subset): owner-only `/api/tenant/export` (`exportTenantData` — 38 collections, tenant-scoped, tokens redacted; verified no cross-tenant leak) and `deleteTenantAction` (`purgeTenant` — name-confirmed, erases all tenant data, keeps shared multi-tenant users, platform-library rows survive; verified: deleted workspace's owner can't sign in). Both on `/billing`.
  - **Adversarial review** (3 dimensions → 2-vote refute, 17 agents): **0 confirmed** — `purgeTenant`/export got a positive isolation verification. Hardened 2 low findings anyway: hydrate coerces present-but-non-array collections to `[]`; `listContentComments` contract documented.
- **Real-media DAM — DONE (2026-07-05).** Store/serve the actual asset bytes (closes the last agency table-stakes gap). `src/lib/storage.ts` = env-gated object-storage adapter (**Supabase Storage** in prod, local-disk `CC_MEDIA_DIR` dev backend, OFF otherwise → uploads refused, app runs metadata-only). Bytes never enter the JSON store — `Asset.storedFile` (StoredFileRef: key/size/mime/checksum) only; keys `<tenantId>/<companyId>/<assetId>`, charset-validated against traversal. `uploadAssetMediaAction` (tenant-pinned, MIME-vs-type + size cap, blocked on approved/held). **Authorised serving** `src/app/api/media/[assetId]/route.ts`: internal (session + `canAccessCompany`) OR public via a client-approval token that must reference THAT asset (company+tenant cross-checked); the token path enforces `assetUsableReason` so **withdrawn/expired consent stops the file loading**. Only an INLINE allowlist (image/video/pdf) renders in-origin — SVG/HTML/docs download as attachments (no in-origin script). Media shown on the asset page + token-scoped on the client-approval page; `deleteTenantMedia` wired into GDPR tenant erasure. **Verified** (dev-disk backend, tsc/sweep/build clean): unauthenticated/nonexistent/**cross-tenant → 404**, authorised internal → **200 image/png**, asset page renders the image. **Adversarial review** (3 dims → 2-vote refute, 13 agents): **1 HIGH confirmed + fixed** — `deleteTenantMedia` under-deleted past 1000 objects on Supabase (GDPR-erasure completeness); now paginates list + chunks remove. Also hardened 3 dismissed findings: safe inline-serving allowlist (SVG/HTML→attachment), memoised `getServiceSupabase`, try/catch around the Supabase get/put. **Batched to end-wiring:** the real Supabase Storage bucket + signed URLs + AV/content-moderation.
- **Onboarding & legal polish — DONE (2026-07-05).** (1) **Terms of Service** — public `/terms` page (outside `(app)`, no auth), linked from `/signup` and `/billing`; §6 is the **payments / third-party-processor disclosure** ("we do not own/operate card infrastructure; Stripe processes payments; we never store your full card number"), plus recurring-billing/failed-payment/refund/tax/price-change clauses. Marked a **draft template for legal review**; 3 owner placeholders to fill (refund policy §6.5, support email §11, jurisdiction warranty §8 — AU Consumer Law). (2) **Social profile links at onboarding** — `CompanyProfile.socialLinks` (`SOCIAL_PLATFORMS` in types.ts: FB/IG/LinkedIn/X/TikTok/YouTube/Google Business), http(s)-validated, **reference only** (NO logins/passwords — connection is the T5 OAuth flow storing an encrypted, revocable token). The onboarding section links to `/publishing` for one-click connect. (3) **"Getting started" checklist** on the company page — 5 real-state steps (profile 100% · social links · account connected · first content approved · AI-ready) with a next-step CTA; verified 3/5 with correct next-step surfacing. All tsc + build clean, browser-verified.
  **KEY DESIGN POINT (recurring owner question):** the platform never captures social logins/passwords. Unattended/scheduled posting works because the OAuth **access token** (+ refresh token) stored at connect time authorises API calls on the client's behalf **with no interactive login**, until the client revokes it — that is how the scheduler/cron publishes while no one is logged in.
- **T7 hardening — rate limiting + permanent isolation test fixture — DONE (2026-07-05).** The last two buildable-now T7 items (tenant data export/delete — the compliance subset — shipped earlier in the gap-closing batch):
  - **Per-tenant/plan rate limiting** (`src/lib/ratelimit.ts`): env-gated fixed-window limiter — in-memory counter on `globalThis` (HMR-safe), with a **documented Supabase-RPC drop-in** for a serverless fleet (the `assert*` API is already async so the swap is call-site-free). `CC_RATE_LIMIT=off` escape hatch. Per-plan `limits.aiPerMinute` in `plans.ts` (starter 8 / agency 20 / scale 40). Plan-scaled **`assertAiRateLimit(tenantId, generations=1)`** wired at all **9 AI entry points** next to the existing `assertAiBudget` — the **burst complement** to the monthly cost cap; keyed on `tenantId` → strict isolation; counts every generation regardless of AI cost so it bites in template mode with zero accounts. **Studio compare mode charges all 3 variants atomically** (`cost>1`, all-or-nothing before any generation). Fixed **public caps** on the two truly-open surfaces: self-serve **signup** (5/IP/hr) and the no-login **client-approval** actions (20/IP/min, applied BEFORE token resolution to throttle brute-force). `clientIp()` is sanitised to an IP charset (can't inject the counter-key delimiter). `checkRate` consumes **only when granted** (count never exceeds limit); `sweep()` reads `windowSeconds` off the counter (never parses the key) and hard-evicts oldest under a fresh-key flood (bounded memory + amortised O(1) per request).
  - **Permanent cross-tenant test fixture** (`src/lib/selftest/isolation.ts` + **`/api/dev/self-test`**): provisions two throwaway tenants, runs a **16-check** adversarial isolation battery (list-scoping for companies/content/audit/security/aiCap/aiSpend/templates + `canAccessCompany`/`accessibleCompanyIds` both directions + `exportTenantData` no-leak + rate-limit enforcement/plan-scaling/per-tenant-isolation/atomic-cost), then **purges both tenants AND its rate counters** so the store is left exactly as found — safe against a live demo (idempotent; verified 4× consecutive 16/16). Route is **dev-open; prod requires `CC_SELFTEST_SECRET`** (else 403; Bearer or `?key=`, timing-safe); returns HTTP 200 when green / 500 when any check regressed, so CI/ops can gate on the status code. This **codifies the isolation rule so it can't silently regress**.
  - **Verified:** tsc + floating-promise sweep clean, clean prod build; self-test **16/16 with limiting ON and OFF** (off-mode correctly *skips* the 4 rate checks — no phantom 500); auth gate 401/403/200; **browser isolation matrix green** (own co → 200, cross-tenant company/brand-brain/governance → 404); AI happy path unaffected. **Two adversarial reviews** (4-dim then 3-dim re-review, 2-vote refute, 21 agents): the first confirmed **6 findings** (sweep key-collision evicting a live public counter; fresh-key-flood DoS; Studio 3×-undercount; phantom-500 under `CC_RATE_LIMIT=off`; self-test counter residue; 60s-window-boundary flake) — **ALL FIXED**; the re-review of the fixes returned **0 findings**.

### THE ISOLATION RULE (do not regress — this is how the SaaS is safe)
1. Every repo list-fn takes a **required `tenantId`** — pass `user.tenantId`. Never reintroduce a "[]=all companies" sentinel.
2. `canAccessCompany(user, companyId)` checks `company.tenantId === user.tenantId` FIRST. Company-scoped actions use `assertCompanyAccess(companyId)`.
3. **Admin actions on a company/record: use `assertAdminCompanyAccess(companyId)`** (or `requireAdmin`+`canAccessCompany` pin). `requireAdmin` ALONE is a cross-tenant hole — the review caught two (`approveCampaignAction`, `requestMoreInfoAction`). ANY new admin action that touches a record by id MUST tenant-pin it.
4. Every mutation `await logAction(...)` (stamps actor tenant). Rebuild the RLS-mirror only in `src/lib/auth/rbac.ts` + the migration.

### Per-phase discipline (unchanged, applied every phase)
extend model → engine libs (deterministic fallback, env-gated for external) → actions+pages → `npx tsc --noEmit` → **floating-promise sweep** (`node C:/Users/dellb/AppData/Local/Temp/claude/.../scratchpad/sweep-floating.js` — catches `if(promise)` truthy conditions + fire-and-forget guards tsc can't) → clean build → **browser isolation matrix** (sign in as Sasha AND Alex; cross-tenant company/brand-brain/governance URLs MUST 404; one tenant's crisis mode invisible to the other) → **`Workflow` adversarial review** (for tenancy: the 4-dimension reads/writes/settings/RLS+session finder, 2-vote refute) → fix confirmed → rebuild → update HANDOVER + `docs/SAAS-CONVERSION.md` + memory.

### Supabase end-wiring — DONE (2026-07-06). The app now runs on the real database.
The owner supplied Supabase credentials and the full persistence path is wired, delegated and **verified against the live project** — it is no longer an in-memory-only demo.
- **Creds:** project `hrwkshspqeulgrmpqtpx` (Pro org). `.env.local` holds `NEXT_PUBLIC_SUPABASE_URL` + legacy `anon` + `service_role`. Both migrations applied: `0001_phase1_init.sql` then **`0002_catchup_t4_t6_dam_gapclosers.sql`** (the catch-up: `tenants.branding`, `content_items.client_review`, `companies.documents`, `assets.stored_file`, + `content_comments`/`social_mentions` tables & RLS — the schema had drifted behind T4/T6/DAM/gap-closers).
- **`src/lib/db/mapper.ts`** — generic **shallow** snake↔camel row/domain mapper: person-ref `*_by` aliases (created_by/approved_by/…), numeric coercion (est_cost_usd/ai_monthly_cap_usd/size_bytes), jsonb values pass through verbatim, DB null→undefined **except `tenant_id`/`company_id`** whose null is a meaningful platform-library / tenant-wide sentinel (preserved).
- **`src/lib/db/supabase-adapter.ts`** — `supabaseRepo`, **~100 methods** across all 30 tables. `usr()` = request-scoped **RLS** client for company-scoped data (Postgres RLS enforces isolation as the signed-in user); `svc()` = service-role client (bypasses RLS) ONLY for identity/tenancy, append-only audit, the AI-spend meter, **legal holds** (a member's RLS scope would under-read them — a security bug), per-tenant settings singletons, the no-login client-comment path, and export/purge. Creates OMIT `id` (uuid `gen_random_uuid()`).
- **Delegation:** every leaf in `db/index.ts` starts with `if (isSupabaseConfigured()) return supabaseRepo.NAME(args)` (**135 guards**, inserted by a paren-depth-aware codemod, backup-protected); composed helpers ride the leaves (unguarded); demo-only session fns are NOT delegated. `audit.ts` delegates `logAction`→`appendAudit` and `listAudit`→adapter.
- **Verified against LIVE Supabase:** live 2-tenant **RLS leak test** (cross-tenant read blocked even by exact id); **mapper round-trip 9/9** (branding/aliases/nested jsonb/clientReview/numeric); **usr-path RLS 5/5** (own read+write ok; cross-tenant read AND write blocked, Postgres `42501`); **null-preserve 4/4**; the app **boots in Supabase mode and reaches Supabase at runtime**. tsc + sweep + build clean.
- **Adversarial review** (4 dims → 2-vote refute, 6 agents): **1 HIGH confirmed & fixed** — the mapper coerced `null`→`undefined`, breaking the platform-library/tenant-wide `=== null` sentinel checks (would silently drop group-wide templates + throw "Forbidden" on platform toggles). Fixed by preserving null on `tenant_id`/`company_id`; verified 4/4 live.
- **⚠️ RUN REQUIREMENTS in Supabase mode** (both are environment, not code): (1) **Corporate TLS proxy** — use `npm run start:supabase` or `npm run dev:supabase` locally (wraps `node --use-system-ca`; else `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / "fetch failed"). Cloud hosts (Vercel) trust certs natively — plain `npm run start` is fine there. (2) magic-link **login needs SMTP** — set `RESEND_API_KEY` and configure Resend as Supabase's SMTP (Auth → SMTP) so the sign-in link is delivered.
- **Known limitation (follow-up):** the background **scheduler/automation cron runs with no auth session**, so RLS-scoped (`usr`) reads/writes return nothing for it — driving the cron under Supabase needs a service-context pass. The in-memory demo (unset the Supabase env) still runs the cron fine.

### ⏭️ NEXT: turn on the remaining per-feature keys (all optional / batched)
Core persistence + auth is live. What's left is lighting up individual external features by adding keys (each is independently env-gated; the app already works on Supabase without them):
1. **`RESEND_API_KEY`** + configure Resend as Supabase SMTP → magic-link login delivery (needed for the interactive logged-in demo) + app notifications.
2. **`ANTHROPIC_API_KEY`** (+ optional `CC_AI_MODEL`) → real Claude drafting (template fallback until then).
3. **`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_*`** (webhook → `/api/billing/webhook`) → live billing.
4. Shared OAuth apps (`META_APP_ID`/`LINKEDIN_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_ID` + secrets) + `PUBLISHING_LIVE=true` + `PUBLISHING_TOKEN_KEY` + `APP_ORIGIN` (redirect `<APP_ORIGIN>/api/oauth/callback`) → live publishing. **File Meta App Review + LinkedIn Marketing API now** (2–6 wk external gate).
5. **`CRON_SECRET`** (Vercel Cron → `/api/cron/tick`) → scheduler (after the cron service-context follow-up above).
6. **`SUPABASE_MEDIA_BUCKET`** (private bucket) → real-media DAM byte storage.
7. Production limiter: replace `src/lib/ratelimit.ts`'s in-memory counter with the documented atomic Supabase RPC so per-tenant limits hold across a serverless fleet.

**T4 + T5 done — see Progress above and `docs/SAAS-CONVERSION.md`.** Owner actions batched: Stripe (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_PRICE_*`, webhook → `/api/billing/webhook`); shared OAuth apps (`META_APP_ID`/`LINKEDIN_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_ID` + secrets, `PUBLISHING_LIVE=true`, `PUBLISHING_TOKEN_KEY`, `APP_ORIGIN`, redirect URI `<APP_ORIGIN>/api/oauth/callback`) — **file Meta App Review + LinkedIn Marketing API access now** (2–6 wk external gate).

### ⚠️ Coordinate: a background cleanup task is running
`task_61f5442d` ("Remove dead code/comments from single-tenant era") was spawned to another local session and is running independently — it edits **comments/naming only** in `store.ts`/`types.ts` (stale "group"/"Wattle Group" wording, dead `setUserRoleTitle`). Reconcile before large edits to those files; it should not touch logic.

---

## Earlier: production wiring (single-tenant, still valid under the adapter)
