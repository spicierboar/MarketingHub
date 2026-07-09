# Business roadmap — scale to ~1600 accounts + new requirements (2026-07-06)

**Context.** The owner may onboard **~1600 client companies** (mixed industries; restaurants are one segment). We are now the **product developer AND the first/primary user** (dogfooding at scale). This turns reliability, scale, cost, and platform-policy compliance into first-class concerns — it is no longer a demo.

**v1 publishing platforms** (owner decision, 2026-07-06): **Facebook Pages · Instagram Business · Google Business Profile · TikTok.** NOT X or LinkedIn in v1.

---

## The compliance line — LOCKED, do not revisit

A client asked us to **manage their social login IDs, passwords, and 2FA/3FA** and fully automate posting. **We refuse credential management.** Reasons (use as client talking points):
- Storing/using client passwords + 2FA to log in as them **violates Meta & Google platform terms** and is a catastrophic security/liability exposure (one breach = 1600 hijacked accounts).
- Platforms **detect and ban** password-login automation as bot behaviour (device challenges, CAPTCHAs, lockouts). At 1600 accounts this bans accounts en masse.

**The compliant automation path (already built — T5 OAuth):** each client **connects once** via OAuth, granting a **scoped, revocable access token** (never a password). We publish via the **official platform APIs** with no login/2FA — the scheduler posts while nobody is signed in, until the client revokes. This is how every compliant tool (Hootsuite/Sprout/Buffer) works. **"Fully automated posting" = YES, via OAuth; managing passwords = NO."**

---

## Platform realities to plan around (honest constraints)

| Platform | API / gate | Key limits for scale |
|---|---|---|
| **Facebook Pages** | Meta Graph API; **App Review** (`pages_manage_posts`, `pages_read_engagement`) | Well-supported. Business Pages only. |
| **Instagram Business** | Instagram Graph API (`instagram_content_publish`); same Meta App Review | IG **Business/Creator** linked to a FB Page only (no personal). Image/carousel/reel/video; stories mostly not via API. **~25 API posts / 24h / account** — fine for normal cadence, but the scheduler must respect it. |
| **Google Business Profile** | Business Profile API; **access request/approval** | Strong for local (offers, hours, photos, posts). Verify current post-type support — Google has deprecated some post features; confirm before promising. |
| **TikTok** | Content Posting API (**Direct Post**); **app audit/approval** | Video only. Sandbox/reviewed-content limits until approved. More onboarding friction. |

**External critical path — start NOW (2–6+ weeks, runs in parallel with all build work):**
- Organic publishing: **Meta App Review** (FB+IG), **Google Business Profile API** access, **TikTok Content Posting API** audit.
- Paid ads (heavier, file even earlier): **Google Ads API** (developer token + access) and **Meta Marketing API** (`ads_management` + **Business Verification**).
These are the long poles; nothing about automated publishing or paid campaigns ships to production without them.

---

## The five requirements

### 1. Automated posting for 1600 accounts — *compliant via OAuth (see above)*
- **Built:** OAuth connect + publishing engine + scheduler/kill-switch (T5/T7), currently simulated pending creds + App Review. **DONE (2026-07-06b):** ~~service-context pass~~ ✅; ~~per-platform rate-limit awareness~~ ✅ (`src/lib/platform-limits.ts` — IG ~25/24h, TikTok 15, FB 90, GBP 20; over-ceiling posts DEFER and flow out as capacity frees) **and the real publish JOB QUEUE** ✅ (`src/lib/publish-queue.ts`: atomic claim, retries + exponential backoff 5/15/45/120m, dead-letter + operator requeue, stale-claim recovery; permanent fixture `/api/dev/queue-test` 15 checks, green in-memory AND on live Supabase; no new required migrations — 0004 is optional indexes).
- **Net-new for scale (remaining):** ~~**per-tenant timezones**~~ **DONE (2026-07-08)** — `tenants.timezone` (IANA), `src/lib/tenant-timezone.ts`, publish-queue + Publishing Centre due-gate per tenant; `CC_TZ_OFFSET_MINUTES` remains platform fallback when unset; migration **0013**; queue-test +3 checks (18/18). ~~**frictionless bulk one-time-connect onboarding**~~ **DONE (2026-07-08)** — `ConnectInvite` model, `/connect/[token]` public page, bulk generator on `/publishing`, OAuth callback invite path, migration **0014**; self-test +3 checks (23/23). ~~**Publish idempotency on stale-claim retry**~~ **DONE (2026-07-08, M01b)** — `publishIdempotencyKey` + verify-before-retry in `publish-queue.ts`; queue-test 20/20. Remaining: scale/cost testing at 1600×cadence; chunk adapter `.in("company_id", …)` at hundreds of companies; Resend + live keys (owner).
- **Effort:** S–M remaining + external App Review gate (L, calendar).

### 2. Automated visuals — AI images/video + managed photo shoots
- **AI visuals → automatable.** Have the AI *brief* generator + the **real-media DAM** (byte storage, rights/consent gating). **DONE (2026-07-08):** image-gen + video-gen engines (`imagegen.ts`/`videogen.ts`, `VISUALS_LIVE` gate, deterministic placeholders), `/visuals` hub, entitlement gates, auto-attach on approval (`attach:<contentId>` tag). Live provider wiring = batched owner keys (`REPLICATE_API_TOKEN`/`RUNWAY_API_KEY`). **Effort remaining:** live provider drop-in only.
- **Physical shoots → the shoot is human; the workflow automates** (photographer booking → upload to DAM → tag → approve → auto-schedule). **DONE (2026-07-08):** `PhotoShoot` workflow + `/visuals` UI + migration 0009. Marketplace/billing twist still deferred. **Effort:** S remaining for photographer marketplace only.

### 3. Payment tiers — **DONE (2026-07-07)**
- **Built:** plans + Stripe (T4). **DONE:** the tier/add-on matrix redesign — per-client-company base plan (unchanged) + reusable per-**company** **add-ons** (`video`/`photo`/`menus`/`order_button`) as `CompanyEntitlement`s, a Stripe Price per add-on (env-gated subscription; webhook enables/cancels; add-on subs never touch the plan), a per-company toggle **matrix on `/billing`**, a read-only company-page card, and the **entitlement checks** (`src/lib/entitlements.ts` — `assertCompanyAddon`, fail-closed) the deliverable modules (visuals/menus/Order-Now) will gate on. Migration **0008** (company_entitlements, company-scoped RLS). Reviewed (44 agents) — 3 distinct confirmed issues fixed (failed-cancel billing/access divergence; stale-sub plan downgrade; replayed-checkout resurrection). `ADDON`s are pure data in `src/lib/addons.ts`. **Effort was:** S–M (as estimated).

### 4. Restaurants: 2 free menus / year
- A designed-menu deliverable + an **entitlement counter** (2/yr/restaurant, tracked + enforced). Restaurant-segment add-on. **DONE (2026-07-08)** — `MenuDesign` workflow, `menuQuotaSummary`/`resolveMenuBillingClass`, `/menus` hub gated on `assertCompanyAddon(companyId,"menus")`, migration 0010.

### 5. Restaurants: "Order Now" — direct ordering, bypass Uber's ~35%
- A **direct online-ordering mini-product**: menu → cart → checkout → **Stripe Connect** payout to the restaurant (skips the 35% commission) + an embeddable "Order Now" button for their site/posts + order notifications/management. **DONE (2026-07-08)** — `/ordering` hub + public `/order/[companyId]`, `ORDERING_LIVE` gate, Connect onboarding, webhook order handler, migration 0011.

### 6. Paid advertising & budget management — LOCKED decisions (2026-07-06)
Clients set paid budgets (Google Ads / Google Leads, Meta Ads / Meta Lead Ads), **AI recommends the allocation from performance data**, and it runs on the same channels we manage organically. **Locked model: DELEGATED + management fee** — the client connects **their own** Google Ads + Meta ad accounts via OAuth; **their** card is charged by the platforms directly for ad spend; **we manage campaigns/budgets and charge a separate management fee** (flat or % of spend) via Stripe. We do **NOT** front spend or store cards (no payment-facilitator/reseller risk) — a unified dashboard shows our fee + their platform spend without us handling the ad money. **Lead ingestion: YES (all)** — capture Meta Lead Ads + Google lead-form submissions via webhooks into the CRM/attribution, closing the loop and powering the AI guidance.
- **Reusable:** UTM attribution + cost-per-lead + per-industry lead value (analytics) → the data spine for AI budget guidance; the recommendation-engine pattern; T5 OAuth (new ad providers/scopes); paid-ad copy already routes to senior/compliance approval (T3); Stripe (T4) for the management fee.
- **Net-new:** the budget/allocation model; ad-account OAuth (Google Ads + Meta Business); **campaign execution** via Google Ads API + Meta Marketing API (**large**, env-gated + simulated until approval); lead-ingestion webhooks; paid-performance metrics (spend/CPC/CPL/ROAS) merged into analytics.
- **Buildable now (env-gated):** budget model + AI allocation guidance + connect UI + management-fee billing + the unified dashboard. **DONE (2026-07-07):** ✅ all of it — `src/lib/paid.ts` (simulated CPL/ROAS, fee compute), `src/lib/ai/allocation.ts` (deterministic ROAS/CPL split, 20–80% guardrails, admin-applies), delegated ad-account connect (tenant-pinned, encrypted; live OAuth is the drop-in), per-company budget + fee terms, `createManagementFeeInvoice` (env-gated Stripe), `/ads` unified dashboard (client spend + leads + CPL + ROAS + OUR fee). Migration **0005** (company-scoped RLS). `ADS_LIVE` gate. Reviewed (26 agents) — the one real bug (paused/ended campaigns accruing phantom spend → fee on it) fixed. **Lead webhook DONE (2026-07-08):** `src/lib/ad-leads.ts` + `/api/ads/leads/webhook` (signature verification + idempotent ingest, migration 0012). **Gated on approvals:** live campaign execution (`ADS_LIVE`).
- **New external gates (heavier — file early):** **Google Ads API** (developer token + access approval + OAuth) and **Meta Marketing API** (`ads_management` — App Review + **Business Verification**). **Effort:** L (a major module, ~= the Order-Now build).

---

## Recommended sequence

**Phase 0 — start immediately (external, parallel):** file Meta App Review + Google Business + TikTok API applications, **and the paid-ads APIs (Google Ads + Meta Marketing API + Business Verification) — file these first, they take longest.**

**Phase 1 — make it real at scale (foundation the 1600 sit on):** ~~**cron service-context fix**~~ **DONE (2026-07-06)** … **Scale pass core DONE (2026-07-06b):** ~~per-platform rate limits~~ ✅ + ~~the real publish job queue~~ ✅. ~~**Per-tenant timezones**~~ **DONE (2026-07-08)** — migration 0013. ~~**Bulk one-time-connect onboarding**~~ **DONE (2026-07-08)** — migration 0014. Remaining Phase 1 (owner): Resend (magic-link login + notifications) · live AI (`ANTHROPIC_API_KEY`) when unparked · live `PUBLISHING_LIVE` / `ADS_LIVE`. ~~Publish idempotency~~ ✅ M01b · ~~AI-cost budgeting~~ ✅ M03.

**Phase 2 — compliant automated publishing at scale** (once App Review lands): finish/verify OAuth connect + publishing per platform (FB/IG/GBP/TikTok).

**Phase 3 — payment tiers** (#3, unblocks revenue). **DONE (2026-07-07)** — per-company add-on matrix + Stripe products + entitlement checks (`src/lib/entitlements.ts`); migration 0008. Next phases 4/5/6 wire `assertCompanyAddon(companyId, "video"|"photo"|"menus"|"order_button")` at their feature entry points.

**Phase 4 — AI visuals + photo-shoot workflow** (#2). **DONE (2026-07-08)** — image+video gen, `/visuals`, photo shoots, auto-attach, migration 0009.

**Phase 5 — restaurant menus** (#4). **DONE (2026-07-08)** — designed-menu deliverable + 2-free-menus/year counter, `/menus`, migration 0010.

**Phase 6 — "Order Now" ordering platform** (#5). **DONE (2026-07-08)** — menu catalog, guest checkout, kitchen queue, Stripe Connect, migration 0011.

**Phase 7 — Paid advertising & budget management** (#6, delegated model + management fee + full lead ingestion). **The env-gated half is DONE (2026-07-07)** — budget model + AI allocation guidance + delegated connect + management-fee invoicing + unified `/ads` dashboard, all simulated behind `ADS_LIVE` (see requirement #6 above). **Lead-capture webhook DONE (2026-07-08):** `POST /api/ads/leads/webhook` + `src/lib/ad-leads.ts` (Meta + Google signature verification, idempotent ingest, migration 0012). **Remaining (gated on the Google Ads / Meta Marketing API approvals filed FIRST in Phase 0):** live campaign execution.

---

## World-class vision layer (2026-07-06) — what it takes beyond the 7 modules

**Definition.** Not "a social scheduler with AI captions." It's a **compliant, autonomous marketing operating system**: a client sets goals + budget, and it plans, creates, publishes, advertises, captures leads, and **proves revenue** across every channel — with humans touching only the exceptions. Three pillars: **truly automated · genuinely rich · provably valuable.**

### Biggest gaps to close (table-stakes not yet scoped)
- **Owned channels beyond social — Email + SMS + WhatsApp Business.** Social alone doesn't convert; the money is in owned audiences. WhatsApp (broadcast + ordering) is huge for SMB/restaurants and AU/global local.
- **Short-form VIDEO generation** (Reels/TikTok/Shorts) — *the* format now. The "visuals" module must be **video-first** (photos+templates+script → auto vertical video), not image-only. The single biggest content gap.
- **Reviews & reputation management** — monitor Google/Meta/Yelp reviews, AI-draft responses, and *generate* reviews (nudge happy customers). Often the #1 local/SMB value driver.
- **Unified conversations inbox** — DMs + comments + reviews + WhatsApp in one AI-assisted queue (comment inbox exists; this is the full thing).
- **Client-facing branded reporting + portal** — scheduled white-labeled ROI reports + a portal where clients see the calendar, approve, and view results. Clients churn when they can't *see* value. The analytics exist; this packages it.
- **Booking / reservations** (restaurants + service businesses) alongside "Order Now."
- ~~**A real job queue at 1600×N scale**~~ **DONE (2026-07-06b)** … ~~**Per-tenant timezones for the due-gate**~~ **DONE (2026-07-08)**. Remaining queue niceties: verify-before-retry idempotency once live connectors exist.

### Differentiators — the moat (world-class, not parity)
- **Compliance-native automation (existing moat).** Extend: **ad-policy pre-checks** (catch Meta/Google disapprovals before spend), **industry compliance packs** (health/therapeutic goods, alcohol, financial, gambling), auto-disclaimer injection, AU Consumer Law/ABN, accessibility (alt-text/contrast), **music licensing for video** (ties into the consent/rights DAM). Nobody automates AND keeps SMBs compliant at this depth.
- **Closed-loop ROI in one view** — organic + paid + leads + revenue, attributed. Most tools silo these; unifying them (UTM/CPL/lead-value already modelled) is the "we prove dollars" story.
- **Network intelligence** — privacy-safe cross-client/industry/locale benchmarks + playbooks ("posts like this perform best for cafés in Sydney; shift 15% of budget to Meta leads on weekends"). A compounding data moat at 1600 accounts.
- **True autopilot with exception-only human review** — "set goals + budget, we run it; you approve only what needs a human." The governance loop already routes exceptions — this turns it into the product's *wow*.
- **Vertical depth (restaurants)** — menus + Order-Now + reservations + review-gen as an owned wedge. Win one vertical deeply, then expand.

### Intelligence layer (making "automated" real)
- **Agentic "marketing manager in a box":** plan the month → draft → schedule → monitor → reallocate budget → escalate only exceptions. The frontier and the biggest leap from what exists.
- **Self-optimization:** A/B at scale (creatives/captions/send times) with auto-winner; learned per-account optimal times; predictive forecasting (reach/leads/revenue); AI budget optimization (feeds the paid module).
- **Real-time signals:** trending topics/audio, Google Trends, local events + weather + seasonality triggers ("35°C tomorrow → auto-draft a cold-drinks promo").

### Scale & ops (the 1600 reality)
Bulk everything (onboarding/connect/approve/schedule) · **auto-onboarding** (scrape a client's site+socials *with consent* to pre-fill the Brand Brain) · **client health scores** (flag underspend/low-engagement/approval backlog) · team workload/SLAs · observability + alerting · **AI cost routing** (cheap model for drafts, premium for hero content) + caching · public **API/webhooks** for partners (ecosystem).

### Monetization richness
Usage + add-ons (AI credits, video credits) · **% of ad spend** (paid module) · **two-sided marketplace** (photographers/videographers/ad specialists — the "charge the photographer" idea generalized) · Order-Now transaction fee · **reseller/affiliate** (agencies-of-agencies) · in-product upsell ("boost this top post for $30").

### If you do only five things to reach world-class
1. **Closed-loop ROI + branded client reporting/portal** — proves value, kills churn, differentiates (highest leverage; data already exists).
2. **Video-first creative** (short-form auto-generation) — the format that decides relevance.
3. **Reviews/reputation + unified inbox incl. WhatsApp** — the SMB/local money layer.
4. **Agentic autopilot with exception-only review** — realizes the "automated" promise; the demo that closes deals.
5. **~~Job-queue~~ ✅ (2026-07-06b) /scale infra + the network-intelligence data moat** — reliability at 1600 *and* a compounding advantage.

...all on the **compliance moat** already built — the headline: *the only platform that fully automates marketing **and** keeps 1600 small businesses compliant.*

**Note:** the previously "parked" items (Resend, cron fix, live AI) are **Phase 1** — they're the critical foundation, not optional extras.

---

## Version 2 backlog — DEFERRED (owner decision, 2026-07-07)

A gap analysis against an 18-module agency-platform spec (6-auditor pass over the real code, 2026-07-07) found the platform is strong on **content → governance → publish → paid**, and empty on the **owned-audience + web side**. The owner elected to **defer all of the following to Version 2** — do NOT build these now; they're captured here so they aren't lost.

**Not built at all (whole modules → v2):**
1. **Website Management** — page/landing-page CMS, update-requests, page approval, SEO-metadata records, website performance, conversion-form management, page version history. (Today only *content-generation types* `landing_page`/`website_copy`/`seo_meta` exist.)
2. **Digital Journey & Conversion-Funnel Optimisation** — customer journey mapping, funnel stages + drop-off, landing-page analytics, CTA/form conversion, booking/enquiry funnels, **A/B testing engine**.
3. **CRM Program Management** — Customer/Contact/Segment entities, profiles, segmentation, lead-capture forms, interaction history, dedup/data-hygiene, subscription/consent-to-market. (The `Lead` entity is ad-attribution only.) *(Was on the original MVP list.)*
4. **Email Marketing & Automation** — campaign builder, brand templates, automated journeys/sequences, segmented lists, open/click/unsubscribe tracking. (`email.ts` is transactional Resend only.) *(Was on the original MVP list.)*
5. **Competitor & Industry Analysis** — competitor profiles, monitoring, benchmarking, inspiration board. (Only a free-text `competitors[]` in the Brand Brain today.)
6. **Testing, Learning & Optimisation** — A/B/experiment records, test logs, hypothesis docs, lessons-learned register. (The 3-variant content compare is authoring-time only.)

**Partial-module gaps → v2 (core exists, these pieces deferred):**
- Analytics: **GA / GTM / Meta Pixel integrations**, conversion-tracking records, **custom report builder**, **scheduled reporting**.
- Reporting: automated/scheduled reports, PDF export, dedicated CRM/email/website dashboards.
- Sentiment: sentiment **dashboard**, **review monitoring**, response-time tracking, brand-sentiment **trends**.
- Task/Project: task **boards**, assignee/owner, priority, **due dates**, recurring, dependencies, workload view.
- Multi-brand: a genuinely **shared cross-brand asset pool** (assets are per-company today); per-brand campaign dashboards.
- Strategy: a **strategy layer/entity** above campaigns; reusable audience/persona definitions; strategy version history.
- Roles: a distinct **Agency Paid-Media role**; a hard read-only **Executive** gate; a comment-only **Internal Stakeholder** role.

**Being built NOW (the exception the owner pulled forward, 2026-07-07):** ad **audience targeting customisations** inside the paid module (geography, demographics, interests, custom/lookalike audiences, exclusions, devices, placements) as reusable **AudienceSegments** attached to campaigns — this closes Module 6 "audience-targeting records" + Module 7 "audience segmentation" and lays a segmentation foundation the v2 CRM can build on.

**From master prompt (2026-07-07 doc, crosswalk 2026-07-08) — additional v2 modules not listed above:**
7. **Review Management & Reputation** (master prompt Phase 6) — connect Google/Facebook/TripAdvisor/Yelp; import ratings + text; AI sentiment + topic extraction + urgency scoring; response drafts with escalation; review-request campaigns (email/SMS/QR/receipt/post-stay); reputation score + response-time + recurring-issue reports; competitor benchmarking where lawful. *(Overlaps world-class “reviews” gap — captured here as a full module.)*
8. **Marketing Automation Workflows** (Phase 8) — trigger/condition/delay/action automations (welcome, birthday, abandoned cart/booking, win-back, review request, post-stay, replenishment, occupancy/table targets); quiet hours, frequency caps, opt-out enforcement; agency reusable templates deployed per client.
9. **SMS Marketing** (Phase 13) — consent-based promotional + transactional SMS; quiet hours, country rules, sender identity, cost preview, short links + UTM; agency per-client limits + approvals. *(Distinct from transactional Resend email — full campaign module.)*
10. **Loyalty, Offers & Referrals** (Phase 11) — points/tiers/digital cards, coupons, referral + birthday/anniversary rewards, segment-targeted offers with redemption tracking; restaurant/retail/hotel offer templates; abuse controls where platform handles redemption.
11. **Local SEO & AI Search Readiness** (Phase 10, beyond content-generation types) — GBP NAP/hours/category/photo audit; local/suburb landing pages; schema markup recommendations (local business, restaurant, product, hotel, event, FAQ); AI-search-optimised factual Q&A; ranking/visibility tracking via approved integrations; multi-location local content without duplicate effort.
12. **AI Campaign Builder** (Phase 14, full) — plain-language goal → strategy + audience + offer + channel plan + assets + schedule + KPIs + reporting plan; industry templates; risk warnings (claims, discounts, audience size, budget); one-click spawn of calendar items, segments, automations, landing copy where supported.
13. **AI Knowledge Base / RAG** (Phase 16, full) — document/menu/product/brand-guide upload + import; versioned approved/draft/outdated/prohibited sources; retrieval-augmented generation with source citation in UI; block unapproved knowledge in governed workflows.
14. **AI Recommendations** (Phase 17, full) — ranked opportunities (campaigns, SEO, social, reviews, loyalty, retention, pricing); accept/dismiss/snooze/delegate → campaign/task/calendar; learn from dismissals; agency portfolio recommendations (clients needing attention, reusable kits).
15. **Executive Dashboard & Health Scores** (Phase 18) — marketing/reputation/local-SEO/engagement/retention scorecards by business type; explainable methodology; “next best action” not charts-only; agency portfolio “who needs attention now.”
16. **AI Marketing Operating System (AI-MOS)** (Phase 19, full autopilot) — continuous signal monitoring → opportunity/risk detection → diagnosis + recommended campaign + forecast + approval requirements; configurable execution modes (suggest-only through approved auto-publish within limits); full audit trail + feedback loops. *(v1 may ship suggest-only slice first — see crosswalk below.)*
17. **Bookings & Reservations** (Phase 2 restaurant/hotel profiles) — table/reservation booking, capacity, service periods; hotel direct-booking + occupancy hooks; complements Order Now (pickup/delivery) without duplicating it.
18. **Business-type depth beyond restaurant wedge** — **retail:** products, inventory, promotions, coupons, Google Shopping readiness, click-and-collect; **hotel:** rooms, rates, packages, amenities, F&B outlets, conference/wedding/event spaces, spa offers, occupancy data; **franchise/multi-location:** central oversight with local execution.
19. **Additional social channels** (Phase 5 — explicitly **not** v1 per owner lock) — LinkedIn, X, Pinterest, YouTube Shorts when commercially/API-feasible; engagement monitoring (likes, comments, reach) across connected channels.
20. **Advanced agency delivery** (Phase 15 remainder) — granular roles (strategist, analyst, client approver, viewer); custom-domain white label; reusable campaign kits + bulk ops; client billing/usage reporting beyond current plan + add-ons.
21. **Security & ops hardening** (Phase 20 remainder) — MFA, admin impersonation controls, API rate limiting + versioning, prompt-injection resistance, integration health checks + alerting, backup/DR runbooks.

---

## Master AI Prompt crosswalk (SMB_Marketing_SaaS_Master_AI_Prompt.docx, 2026-07-07)

Reviewed 2026-07-08 against the 21 implementation phases in the owner’s master prompt. **Owner locks still apply:** v1 publishing = FB/IG/GBP/TikTok only; no credential management; v2 backlog = owner-DEFERRED until v1 ships.

| Master prompt phase | Status in command-centre | Version |
|---|---|---|
| 1 Platform audit | Process built into HANDOVER verify discipline | — (ongoing) |
| 2 Business type profiles | Brand Brain + restaurant wedge (menus, Order Now, visuals); café seed | **v1** retail/hotel profile fields + templates; **v2** full vertical data models |
| 3 AI Marketing Assistant | Content gen + governance + Brand Brain context | **v1 DONE (2026-07-08)** — cost/token limits, critique, duplicate warnings, asset metadata (migration 0015) |
| 4 Content calendar | Calendar + approval + publish queue + rate limits | **v1** seasonal prompts, optimal-time hints, agency cross-client view |
| 5 Social media management | OAuth + scheduler + v1 platforms; simulated until App Review | **v1** content repurposing, engagement metrics post-approval; **v2** extra channels |
| 6 Review management | Not built | **v2** (module 7 above) |
| 7 CRM & first-party data | `Lead` = ad attribution only; targeting segments exist | **v2** (module 3 above) |
| 8 Marketing automation | Not built | **v2** (module 8 above) |
| 9 AI analytics & narratives | UTM/CPL/ROAS + `/ads` + analytics spine | **v1** plain-language insight narratives + anomaly flags; **v2** full dashboards |
| 10 Local SEO & AI search | Content types `landing_page`/`seo_meta`/`website_copy` only | **v1** GBP audit checklist; **v2** full local SEO module (module 11) |
| 11 Loyalty, offers, referrals | Not built | **v2** (module 10 above) |
| 12 Email marketing | Transactional Resend only | **v2** (module 4 above) |
| 13 SMS marketing | Not built | **v2** (module 9 above) |
| 14 AI campaign builder | Governance loop + paid allocation pattern | **v1** goal → draft plan → calendar items (suggest + approve); **v2** full multi-channel spawn |
| 15 Agency features | Multi-tenant, onboarding, T&C, billing, partial white-label | **v1** portfolio calendar, client health scores, approval backlog; **v2** granular roles + kits |
| 16 AI knowledge base / RAG | Brand Brain (structured) | **v1** document upload + versioning + citations; **v2** full RAG pipeline (module 13) |
| 17 AI recommendations | Paid budget allocation AI | **v1** lightweight recommendation cards; **v2** full engine (module 14) |
| 18 Executive dashboard & health scores | Not built | **v1** explainable scorecards + next-best-action; **v2** full portfolio views (module 15) |
| 19 AI-MOS | World-class vision (“agentic autopilot”) | **v1** suggest-only + audit trail; **v2** approved auto-execution within limits (module 16) |
| 20 Security & compliance | Tenant isolation, audit, governance, env gates | **v1** AI guardrails + integration health; **v2** MFA/impersonation/API versioning |
| 21 Deliverables & testing | self-test/queue-test + verify scripts + HANDOVER | — (ongoing) |

### Version 1 — net-new items from master prompt (fit current scope; no v2-module build)

These extend what is already in flight without opening deferred whole modules:

- **Scale foundation (Phase 1 remainder):** ~~per-tenant timezones~~ ✅ · ~~bulk one-time-connect onboarding~~ ✅ · ~~AI cost budgeting per plan~~ ✅ M03 · ~~publish idempotency on stale-claim retry~~ ✅ M01b · owner: live `PUBLISHING_LIVE` / `ADS_LIVE` / `VISUALS_LIVE` · Resend magic-link · live `ANTHROPIC_API_KEY` (parked with Meta+Google + `mangotickle.com.au`).
- **Business profiles — retail + hotel context (Phase 2 slice):** ~~industry selector drives templates, recommended campaign goals, and AI context fields~~ **DONE (2026-07-08)** — `src/lib/business-profiles.ts`, `/companies/[id]` vertical sections, AI context in draft/campaign; jsonb only, no migration.
- **AI assistant hardening (Phase 3):** ~~per-plan token/cost limits + usage logging~~ **DONE (2026-07-08)** — `src/lib/ai/metering.ts`, `plans.limits.aiTokensPerMonth`, `recordAiUsage`, migration **0015** · ~~pre-publish AI critique~~ **DONE** — `src/lib/ai/critique.ts` at schedule time · ~~duplicate/similarity warnings~~ **DONE** — campaigns + repurpose + critique re-check · ~~store prompt/model/context/cost metadata on generated assets~~ **DONE** — `Asset` + `ContentItem` provenance fields.
- **Calendar intelligence (Phase 4):** ~~seasonal/holiday/local-event planning prompts · analytics-informed optimal post windows · agency portfolio calendar~~ **DONE (2026-07-08)** — `src/lib/calendar-intelligence.ts`, `/calendar` intelligence panel + portfolio view; compute-only, no migration.
- **Social workflow (Phase 5, v1 platforms only):** ~~one-to-many **content repurposing** (single brief → FB/IG/GBP/TikTok variants)~~ **DONE (2026-07-08)** — `src/lib/content-repurposing.ts`, `/studio` repurpose panel, `ai_draft` variants with lineage; engagement import where APIs allow after App Review remains pending.
- **GBP local slice (Phase 10):** ~~NAP/hours/categories/photos/FAQ audit checklist against connected profile — actionable fixes~~ **DONE (2026-07-08)** — `src/lib/gbp-audit.ts`, `/companies/[id]/local-seo`; simulated when `PUBLISHING_LIVE` off; no migration.
- **AI campaign builder — v1 slice (Phase 14):** ~~“I want more weekday customers / direct bookings / reviews” → draft strategy + channel plan + KPIs → spawn governed content~~ **DONE (2026-07-08)** — `src/lib/ai/campaign-builder.ts`, `/campaigns/new` Build from goal; `ai_draft` only until approval; no migration.
- **Brand Brain RAG — v1 slice (Phase 16):** ~~upload menus/price lists/brand PDFs · approved/draft/archived versions · cite sources on AI outputs in governed flows~~ **DONE (2026-07-08)** — `src/lib/brand-brain-rag.ts`, `/companies/[id]/brand-brain` upload + approve + cite preview; wired in draft + campaign-builder; no migration.
- **Recommendations — v1 slice (Phase 17):** ~~surface 3–5 ranked actions from analytics + reviews + calendar gaps; accept → pre-filled campaign or content draft; dismiss with reason~~ **DONE (2026-07-08)** — `src/lib/recommendations.ts`, `/recommendations` rank/score/dismiss + company strip; no migration.
- **Health scores — v1 slice (Phase 18):** ~~single marketing-health score per company (publishing cadence, approval backlog, paid/simulated ROAS, lead volume) with drill-down factors — feeds agency “clients needing attention.”~~ **DONE (2026-07-08)** — `src/lib/health-scores.ts`, company card + dashboard attention list; no migration.
- **AI-MOS — v1 slice (Phase 19):** ~~**suggest-only** mode — monitor signals → opportunity card → convert to draft campaign; full audit log; no external send/spend without existing approval gates~~ **DONE (2026-07-08)** — `src/lib/ai-mos.ts`, `/ai-mos` + dashboard strip; draft-only convert; no migration.
- **Agency ops (Phase 15 slice):** ~~client health scores + overdue-approval alerts on agency dashboard; reusable content templates~~ **DONE (2026-07-08)** — `src/lib/agency-ops.ts`, dashboard panel + templates; no migration.
- **Auto-onboarding (scale & ops):** ~~with consent, scrape client site + public socials to pre-fill Brand Brain~~ **DONE (2026-07-08)** — `src/lib/auto-onboarding.ts`, consent panel on `/companies/[id]`; profile jsonb only; no migration.
- **Photographer marketplace (requirement #2):** ~~two-sided booking/billing for photo shoots~~ **DONE (2026-07-08)** — `src/lib/photo-marketplace.ts`, `/photographers`, linked `PhotoShoot` lifecycle; migration **0027** pending owner.
- **Security (Phase 20 slice):** ~~prompt-injection resistance on AI inputs · tenant context isolation in prompts · integration/AI provider failure handling + admin health surface~~ **DONE (2026-07-08)** — `src/lib/security-slice.ts`, AI sanitization hooks + `/admin`/`/ai-control` health; no migration.

### Version 1 — already built (master prompt alignment)

For audit traceability — do not rebuild: OAuth publishing + job queue + rate limits · governance/approval loop · Brand Brain · content calendar · payment tiers + company add-ons · AI visuals + photo shoots · restaurant menus + Order Now · paid ads dashboard + AI allocation + lead webhooks · ad audience targeting · client onboarding + versioned T&C · staging/live `appEnv()` · comment inbox (partial unified inbox).

### Master prompt MVP order vs our sequence

The doc’s suggested MVP order (profiles → AI assistant → calendar → reviews → CRM → email/SMS → campaign builder → analytics → RAG → recommendations → AI-MOS) **aligns with our phased build** after adjusting for owner locks: we completed calendar/governance/paid/restaurant vertical **before** owned-audience modules (email/SMS/CRM/reviews), which correctly sit in **v2**. Next v1 work should prioritise **scale foundation + live gates + calendar/AI hardening + suggest-only AI-MOS**, not v2 modules.
