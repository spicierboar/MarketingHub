# Content Create taxonomy — design (Engine-connected)

**Status:** Design complete — **V1 implemented locally** (not pushed / not on staging tip yet)  
**Date:** 2026-07-22  
**Companion:** authoritative leaf list in [`CONTENT-CREATE-TAXONOMY-BACKLOG.md`](./CONTENT-CREATE-TAXONOMY-BACKLOG.md)  
**Metaphor:** Taxonomy axes are **ingredients**. A validated combination is a **recipe**. Content Engine is the **kitchen**. Output is the **dish**. Illogical ingredient mixes are rejected — they never reach the stove.

## V1 landed (local)

| Slice | Location |
| --- | --- |
| Recipe core + goldens | `src/lib/content-recipe/` — `npm run test:content-recipe` |
| Hub composer UI | `content-recipe-composer.tsx` + hub AI Content modal |
| Persist | `content_items.recipe` jsonb migration `20260722180000_…`; `hubGenerateContentAction` |
| Engine 1.1 + `short_social` | `content-engine` managed-content recipe/cook — `npm run test:managed-content-recipe` |

**Still needed for staging smoke:** apply migration SQL on staging Supabase; commit/push CC + Engine when user asks; re-alias tip.

---

## 1. Problem

Yesterday’s backlog lists ~27 axes and hundreds of leaf types. Dumping them into independent dropdowns would:

- Let users pick “Instagram Reel caption” + “Email” + “SEO” + “Board members”
- Produce incoherent briefs
- Teach investors the product is a form, not a system
- Force Engine to guess meaning from a free-text `brief`

Today’s split makes this worse:

| Path | What happens |
| --- | --- |
| CC Content hub `/content` | Local `draftContent` — rich-ish UI, **never** calls Engine |
| Desk → CC → Engine managed jobs | Thin contract: `brief` + opaque `strategyContext` + channel strings |

**Design goal:** One **recipe** model. Compose in Command Centre (and Desk as a constrained composer). Cook only in Content Engine when the recipe is legal. Local template/Claude fallback remains a **dev/staging kitchen substitute**, not a second product language.

---

## 2. Principles

1. **Compatibility is the product.** If a combination is irrelevant, it is impossible in UI and invalid at the API.
2. **Progressive disclosure follows the graph**, not a 15-field checklist.
3. **Engine cooks families, not 400 leaves.** Leaf types map to a small set of **cook modules** Engine can implement and test.
4. **CC owns composition & governance; Engine owns generation fidelity.** Desk never invents channels, packages, or optimise-for — same boundary as today (`MANAGED_CONTENT_JOBS.md`).
5. **Still:** AI drafts → user reviews → admin approves → export. Recipes do not publish.
6. **No live-flag flips** in this design; contract versioning is additive.

---

## 3. Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ Command Centre — Composer                                   │
│  Create for → Category → Type → Channel → Objective → …     │
│  Compatibility graph + brand/compliance overlays            │
│  Persists ContentRecipe + ContentItem (draft shell)         │
└───────────────────────────┬─────────────────────────────────┘
                            │ validated recipe + rendered brief
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Content Engine — Kitchen                                    │
│  Accepts schemaVersion 1.1+ with typed `recipe`             │
│  Selects cook module from recipe.family                     │
│  Emits dish: primaryConcept + channelAdaptations + modules  │
└───────────────────────────┬─────────────────────────────────┘
                            │ callback / poll
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Command Centre — Plating & service                          │
│  quality_routing → Approvals → client portal / schedule     │
└─────────────────────────────────────────────────────────────┘
```

**Desk** remains an operator UI that submits **intent** (`companyId`, concept, slot, assets, short brief). CC hydrates the recipe from the planned slot + strategy + package — Desk cannot assemble illegal meals.

### Analogy mapping

| Kitchen | Product |
| --- | --- |
| Ingredient catalogue | Taxonomy backlog (axes 1–27) |
| Recipe book | Compatibility graph + cook-module map |
| Prep station | CC Compose UI + Zod recipe schema |
| Stove | Engine `managed.content.generate` |
| Pass / expeditor | quality routing + approvals |
| Dining room | Client portal / channels / export |

---

## 4. Recipe model (canonical)

A recipe is a **closed, typed object** — not a bag of unrelated strings.

```ts
/** Conceptual contract — implement as Zod in CC + Engine */
type ContentRecipe = {
  schemaVersion: "1.1";
  createFor: CreateForAxis;          // §5.1
  subject: RecipeSubject;            // client | industry | campaign | … refs
  category: ContentCategory;         // A–T families from backlog §2
  contentType: ContentTypeId;        // leaf id under category
  family: CookFamily;                // Engine module key (derived, never free-picked)
  channels: ChannelId[];             // 1..n, subset of allowed(type)
  primaryChannel: ChannelId;         // drives length/format defaults
  objective: ObjectiveId;
  audience: {
    type: AudienceTypeId;
    awareness?: AwarenessId;
    decisionRole?: DecisionRoleId;
  };
  funnelStage: FunnelStageId;
  optimiseFor: OptimiseForId[];      // subset of allowed(type, channels)
  discoveryTargets?: DiscoveryTargetId[]; // only if optimise includes seo|aeo|geo|llmo
  tone: ToneId;
  length: LengthId;                  // constrained by channel + type
  structure?: StructureId;
  requiredComponents: ComponentId[];
  evidence: EvidencePolicyId;
  brandControls: BrandControlFlags;  // mostly derived from Brand Brain
  compliance: ComplianceFlags;       // gates, not flavour text
  restricted: RestrictedFlags;       // hard negatives for the kitchen
  output: OutputOptions;
  // Human intent still allowed, but as seasoning — not the whole meal:
  topic: string;                     // 1..500
  notes?: string;                    // 0..2000
};
```

**Derived fields (never user-editable):** `family`, default `length`/`structure`/`requiredComponents`, shelf vs client routing, package channel allow-list.

**Rendered brief** for Engine prompt = deterministic serialiser from recipe (so Hub and managed jobs speak the same language). Free-text `notes` append last.

---

## 5. Cook families (what Engine actually implements)

Leaf types from the backlog collapse into **cook families**. Engine prompts, validators, and output shapes are per family.

| Cook family | Examples (leaf) | Primary dish shape |
| --- | --- | --- |
| `short_social` | social post, caption, thread, carousel copy, poll | channelAdaptations (short) |
| `long_editorial` | blog, thought leadership, listicle, guide | long body + meta |
| `web_page` | about, services, location, help centre | sections + Hn outline |
| `landing_conversion` | lead gen LP, demo request, squeeze | hero / proof / form / CTA |
| `email` | newsletter, nurture, transactional (copy only) | subject + preview + body |
| `ad` | search/social/display ad variants | headline / description / CTA sets |
| `script_av` | reel/TikTok/YouTube/podcast scripts | script + beat markers |
| `sales_doc` | proposal, one-pager, battlecard | structured sections |
| `pr` | press release, holding statement | inverted pyramid + boilerplate |
| `report` | performance/campaign report narrative | exec summary + findings |
| `proof` | case study, testimonial framing | problem / approach / result |
| `education` | course outline, SOP, checklist | modules / steps |
| `internal` | staff update, memo, town-hall script | internal-only tone + audience |
| `hr` | job ad, careers copy | role + EVP constraints |
| `legal_plain` | policy plain-language, FAQ legal | disclaimer-heavy; human review default |
| `support` | help article, chatbot reply | answer-first + related |
| `meta_seo` | meta title/description, schema stubs | fielded SEO outputs |

**Rule:** Every backlog leaf maps to exactly one `family`. Unmapped leaf = not shippable.

---

## 6. Compatibility graph (no bad meals)

Rules are **hard**. UI filters options; CC Zod rejects; Engine rejects again (defence in depth).

### 6.1 Create for → allowed categories

| Create for | Allowed categories (backlog §2) | Forbidden |
| --- | --- | --- |
| **Client** | A–K, R–T (client-facing marketing & support) | M Internal as primary; N HR for *agency* hiring; O unless client-requested compliance copy |
| **Industry** | A, B, C (evergreen), E newsletter, F ads (industry promo), G scripts, J reports (industry), L education | Client-named proof (K) without anonymised mode; H sales proposals for a specific client; M/N agency-internal |
| **General** | Agency IP: B guides, L education, T messaging templates, meta_seo patterns | Anything requiring a live client Brand Brain as authority; client testimonials |
| **Internal organisation** | **M only** (+ L training for staff) | All external marketing categories as primary |
| **Personal brand** | A (LinkedIn-heavy), B thought leadership, G personal scripts, I founder statements | Client case studies as if personal; H client proposals |
| **Campaign** | Types linked to an active campaign record; channels ⊆ campaign guardrails | Orphan types with no campaignId |
| **Product or service** | C product/service pages, D landing, E promo email, F ads, S product copy | Pure internal memo |
| **Event** | D event/webinar LPs, E invite/reminder email, G webinar scripts, P events | Evergreen blog without event link when event is the subject |
| **Location or market** | C location pages, local SEO meta, GBP/social local | Global thought leadership with no local angle |

**Shelf routing (existing behaviour, keep):** Industry/General resolve to agency library shelf; quality routing **never** auto-submits to a client portal.

### 6.2 Category / type → channels

Channel set is the **intersection** of:

1. Channels allowed for the **content type** (table below)
2. Channels allowed for **Create for / package / strategy** (managed clients)
3. Channels that support the chosen **family** format

| Family | Allowed primary channels (canonical ids) |
| --- | --- |
| `short_social` | facebook, instagram, tiktok, youtube_shorts, linkedin, threads, x, pinterest, google_business_profile |
| `long_editorial` | website_blog_cms, linkedin (article), email (as newsletter adaptation only secondary) |
| `web_page` | website_blog_cms, web |
| `landing_conversion` | website_blog_cms, web, paid_media (companion ads optional) |
| `email` | email |
| `ad` | paid_media, facebook, instagram, linkedin, x, tiktok, youtube_shorts (platform must match ad subtype) |
| `script_av` | tiktok, instagram, youtube_shorts, youtube, podcast |
| `sales_doc` | web, email, linkedin (send), **not** tiktok as primary |
| `pr` | press, web, email, linkedin — **not** tiktok/instagram Reels as primary |
| `report` | email, web, portal |
| `proof` | website_blog_cms, linkedin, email, sales leave-behind |
| `education` | web, email, intranet (internal create-for) |
| `internal` | intranet only |
| `hr` | web careers, linkedin, job boards (as channel tag) |
| `legal_plain` | web, email |
| `support` | web help centre, chatbot, email |
| `meta_seo` | website_blog_cms, web, aeo_geo |

### Examples of rejected mixes

- Instagram Reel caption + channel `email`
- Press release + primary `tiktok`
- Internal staff memo + Create for `Client` + client portal submit
- `meta_seo` + only `tiktok`
- Job advertisement + Create for `Client` restaurant unless product explicitly supports recruitment add-on (v2)

### 6.3 Type / channel → Optimise for

| Optimise for | Requires | Forbidden with |
| --- | --- | --- |
| SEO | Family in {long_editorial, web_page, landing_conversion, support, meta_seo}; channel web/blog | short_social as *sole* family; pure pr holding statements |
| AEO | Answer-shaped types (FAQ, how-to, definition, explainer); discoveryTargets set | Ad family; microcopy-only |
| GEO / LLMO | Authoritative families (editorial, proof, report, legal_plain, web_page); evidence ≠ “no sources” when claims made | Pure promotional short_social without citations policy |
| Conversion | landing_conversion, ad, email (promo/nurture), sales_doc | internal, pr holding, legal_plain as primary goal |
| Trust / authority | proof, editorial, pr, report | flash sale ads as sole optimise |
| Readability / a11y | Always allowed as *secondary*; never sole substitute for a channel mismatch | — |
| Engagement (social) | short_social, script_av | report, legal_plain |

**User rule from backlog preserved:** SEO / AEO / GEO / LLMO / conversion live under **Optimise for**, never as Content type.

### 6.4 Audience × Create for

| Create for | Audience types allowed |
| --- | --- |
| Client | Existing/prospective clients & customers, local public, partners (from Brand Brain segments) |
| Industry | Industry professionals, peers, press (industry) |
| General | Practitioners / generic marketers (agency IP readers) |
| Internal organisation | Employees, managers, leadership only |
| Personal brand | Peers, followers, journalists, investors (personal) |
| Campaign / Product / Event / Location | Audience must match campaign brief / product ICP / event registrant / local market |

**Reject:** Internal-only audience + Client create-for + public Instagram primary.

### 6.5 Funnel × objective (soft lock)

Objective options are filtered by funnel stage. Example: funnel `Purchase` cannot pick objective `Recruit employees`. Funnel `Advocacy` cannot pick `Generate leads` as primary (upsell to referral objective instead).

### 6.6 Length & structure × channel

Defaults are **forced** from `primaryChannel` + family (e.g. Instagram caption → `50 to 100 words` / `Under 50 words`; blog → `1,000 to 1,500 words`). User may move one notch within an allow-band; jumps outside band require explicit “override” capability (admin only) and are flagged to quality routing.

### 6.7 Compliance & restricted (always on)

Not flavour — **kitchen safety**:

- Restricted flags (no invented stats, no medical advice, …) always injected into Engine system constraints.
- High-risk families (`legal_plain`, `hr`, performance-claim ads) default `compliance.humanReviewRequired = true` → quality routing hold.
- Client-named proof requires consent flags (existing `RequestConsent` pattern).

---

## 7. UX: progressive disclosure (composer)

One wizard. Each step only lists **graph-legal** options. No “show all 400”.

```text
1. Create for (+ subject picker: client / industry / campaign / …)
2. Content category (A–T filtered by §6.1)
3. Content type (leaves in category)
4. Channel(s) — primary required; multi-channel only if family supports adaptation
5. Objective + funnel (paired)
6. Audience (type; awareness/role if relevant)
7. Optimise for (multi, filtered by §6.3) → discovery targets if search/AI opts on
8. Tone (short list; Brand Brain default pinned)
9. Length / structure (pre-filled; editable within band)
10. Evidence + compliance summary (mostly read-only checkboxes)
11. Output options (single draft vs variants — package gated)
12. Topic + notes → Generate
```

**Empty states:** If a step has zero options, show why (“Press releases can’t cook for TikTok as primary — change type or channel”) instead of a disabled Generate.

**Investor / staging:** Demo fill must pick a **legal recipe**, never random illegal axes.

---

## 8. Engine contract evolution

### 8.1 Keep 1.0 working

Existing `schemaVersion: "1.0"` jobs unchanged (brief + opaque strategyContext).

### 8.2 Add 1.1 — typed recipe

```ts
// Engine SubmitManagedContentJob — additive
{
  schemaVersion: "1.1",
  // …existing ids, assets, plannedPublishAt, callback…
  brief: string,                    // still required: rendered from recipe
  recipe: ContentRecipe,            // NEW — authoritative
  strategyContext: {                // shrink over time
    commandCentreConceptId?,
    commandCentreStrategyCycleId?,
    packagePeriod?,
    theme?
  },
  channels: string[]                // MUST equal recipe.channels (order preserved)
}
```

Engine behaviour:

1. Validate `recipe` with shared Zod (publish package `@content-stack/recipe` or duplicated schemas kept in sync).
2. Assert `channels` ≡ `recipe.channels`.
3. Select cook module by `recipe.family`.
4. Build prompt from recipe serialiser + Brand Brain slice from strategyContext / CC-provided brand snapshot (future: explicit `brandSnapshot` field).
5. Validate dish against family output schema before `content.ready`.

**Reject 422** with machine codes: `RECIPE_INCOMPATIBLE`, `CHANNEL_MISMATCH`, `FAMILY_UNSUPPORTED`, `COMPLIANCE_BLOCK`.

### 8.3 Unify Hub Create with Engine

Target state:

- Hub Generate builds `ContentRecipe` → persists on `ContentItem.recipe` (jsonb) → if `CONTENT_ENGINE_MANAGED_JOBS_LIVE` and client-scoped managed path, submit 1.1 job; else local cook using **same** cook-module prompts (shared package).
- Studio / calendar assist emit the same recipe shape.
- Desk unchanged at the wire: CC expands slot → recipe.

This kills “two products, one logo”.

---

## 9. Data model (CC)

| Store | Change |
| --- | --- |
| `content_items` | `recipe jsonb` (ContentRecipe); index `recipe->>'family'`, `recipe->>'contentType'` |
| Enums | Prefer **check via Zod at write** over hundreds of PG enums; optional lookup tables for admin-editable labels |
| Compatibility | Code module `src/lib/content-recipe/` — graph tables as const data + unit tests (golden illegal/legal pairs) |
| Audit | `logAction` on generate/submit includes recipe fingerprint |
| Shelf | Unchanged resolution via `content-create-scope.ts`; recipe.createFor must match resolved scope |

Migration sketch: `YYYYMMDD_content_recipe.jsonb.sql` — nullable column first; backfill not required for old rows.

---

## 10. Phasing

### V1 — “Tuesday night specials” (investor-credible)

Ship graph + composer for a **closed menu**:

**Create for:** Client | Industry | General (existing)

**Categories / types:** map only to current `RequestType` + clear labels:

| RequestType today | Category | Family |
| --- | --- | --- |
| social_post | A Social | short_social |
| blog_article | B Editorial | long_editorial |
| email_newsletter | E Email | email |
| website_copy | C Website | web_page |
| landing_page | D Landing | landing_conversion |
| ad_copy | F Advertising | ad |
| video_script | G Video/Audio | script_av |
| brochure_copy | Q/H Sales leave-behind | sales_doc |
| faq | C/R Support | support |
| seo_meta | meta | meta_seo |
| proposal | H Sales | sales_doc |

**Channels:** current `CONTENT_PLATFORM_OPTIONS` / `MANAGED_CHANNELS` intersection with §6.2  
**Optimise for:** Engagement | Conversion | SEO | Trust (AEO/GEO as “AI discovery” single toggle → maps to aeo+geo)  
**Audience / funnel / tone / length:** short enums already close to Studio  
**Engine:** recipe in `strategyContext.recipe` under 1.0 *or* 1.1 if Engine deploy available — same Zod in CC either way  
**Tests:** ≥30 golden recipes (15 legal, 15 illegal)

### V1.5 — Expand leaves inside existing families

Add backlog leaves that map to **already shipped** families (more social subtypes, more LP subtypes) without new cook modules.

### V2 — New kitchens

New families: `pr`, `report`, `legal_plain`, `hr`, `internal`, full AEO/GEO/LLMO input panels, campaign/event/location create-for subjects, multi-channel adaptation packs.

### Explicitly out of V1

- Every backlog leaf as a visible option
- Image/video generation taxonomy (separate visual recipes later)
- Desk sending full recipe (keeps intent boundary)
- Flipping `*_LIVE` flags

---

## 11. Worked examples

### Legal — “Saffron Laneway lunch Instagram”

```text
Create for: Client (Saffron Laneway)
Category: A Social → Instagram caption
Family: short_social
Channel: instagram (primary)
Objective: Encourage bookings
Funnel: Consideration
Audience: Local consumers / Existing customers
Optimise for: Engagement
Tone: brand_default
Length: Under 50 words
```

Engine: `short_social` module, Instagram constraints, Brand Brain for Saffron.

### Legal — “Industry SEO guide”

```text
Create for: Industry (Indian restaurants AU)
Category: B → How-to / Guide
Family: long_editorial
Channel: website_blog_cms
Optimise for: SEO + AI discovery
Evidence: industry sources permitted
→ shelf hold_agency on submit
```

### Illegal — rejected before Generate

```text
Create for: Client
Type: Press release (pr)
Channel: tiktok
Optimise for: SEO
Audience: Employees
```

Reasons: pr ↛ tiktok primary; SEO ↛ pr+tiktok; employees ↛ client external create-for.

---

## 12. Shared module layout (when implementing)

```text
command-centre/src/lib/content-recipe/
  types.ts          # ContentRecipe, ids
  graph.ts          # allow maps (§6)
  derive.ts         # family, defaults
  validate.ts       # Zod + superRefine incompatibilities
  serialise-brief.ts
  golden/           # legal.json / illegal.json fixtures

content-engine/src/managed-content/
  recipe.ts         # same Zod (or imported package)
  cook/             # one file per CookFamily
```

Product rule preserved: material actions `await logAction(...)`; all list/create through `@/lib/db`.

---

## 13. Success criteria

- User cannot submit an illegal combination from the composer.
- Engine returns `RECIPE_INCOMPATIBLE` if somehow called with one.
- Hub and managed-job paths serialise the same brief from the same recipe.
- Investor demo path only ever generates “dishes” that match the plate (channel + type).
- Backlog remains the **catalogue**; this doc is the **recipe book**.

---

## 14. Decision log

| Decision | Choice |
| --- | --- |
| Where does compatibility live? | Shared graph; enforce in CC UI + CC API + Engine |
| Does Engine see all 27 axes? | Yes as typed recipe in 1.1; cooks by `family` |
| Independent dropdowns? | No |
| Desk assembles recipe? | No — CC derives |
| V1 scope | Existing RequestTypes + hard graph + recipe jsonb |
| AEO/GEO/LLMO | Optimise-for axis; V1 bundled “AI discovery”; full panels V2 |
| Client discovery / order | **Separate portal page** (not Ask us, not Approvals) — à la carte menu of orderable dishes; priced **outside** subscription packages |
| Who cooks special orders | Agency staff + AI using the same recipe graph; client never sees the full kitchen |

---

## 15. Client Order menu (separate page) — product decision

**Agreed direction (2026-07-22):** Clients discover and buy special work from a **dedicated portal page** — a restaurant-style **menu**, not the agency recipe composer and not the free-text Ask us form.

### What the page is

| Aspect | Decision |
| --- | --- |
| **Route (proposed)** | `/client/order` or `/client/menu` — own nav item |
| **Not** | `/client/requests` (Ask us), Approvals, Subscription and Strategy, or widgets on those screens |
| **Shows** | Curated, plain-language **dishes** (e.g. “Press release”, “Launch landing page”, “Reel script pack”) mapped under the hood to recipe category/type/family |
| **Hides** | Full taxonomy, cook families, Optimise-for panels, illegal combos, Engine jargon |

### Commercial model

- Menu items are **à la carte** — billed **separately from** the managed subscription package (add-on / one-off / wallet charge — exact Stripe shape TBD).
- Package still covers the recurring cadence (slots, included channels); the menu is for **special jobs** the client chooses and pays for.
- Agency can enable/disable which menu SKUs each client sees (and override price).

### Fulfilment flow

```text
Client opens /client/order (menu page)
  → picks dish + topic/deadline/notes (+ pay or confirm charge)
  → creates SpecialOrder (status: paid/requested)
  → appears in agency queue (CC Client asks / Desk ops)
  → staff (+ AI) complete legal ContentRecipe from the order
  → Engine cooks → Approvals → client reviews as today
```

Same ingredients and graph as Hub Create / automation — different **front door**.

### Ask us stays

Ask us remains plain-language messages (corrections, timing, vague needs). The **menu page** is for known, priced productised deliverables.

---

## 16. Next implementation slices (gated on user yes)

**Done locally (V1 kitchen):** recipe module, hub composer, jsonb, Engine 1.1 `short_social`.

**Next (when asked):**

1. Commit/push V1 recipe + Order menu + apply `recipe` migration on staging  
2. Stripe checkout for menu SKUs (still outside package; no LIVE flip without yes)  
3. Agency fulfilment queue polish: SpecialOrder → recipe assist (staff + AI)  
4. Wire automation/calendar to `validateContentRecipe` (same graph)  
5. Taxonomy V1.5 leaves / more cook families  

### Client Order menu — shipped locally (2026-07-22)

- Route: `/client/order` (+ `/client/order/[skuId]`) — own rail nav **Order menu**
- Catalogue: `src/lib/client-order-menu.ts` (5 dishes matching mockup)
- Place order → `MarketingRequest` with `menu_order:*` marker → **Client asks** (`Menu order` badge)
- Payment: stub only (no `*_LIVE` / Stripe checkout yet)
