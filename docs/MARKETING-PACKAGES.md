# Marketing packages (company-level)

> Product SKUs clients choose at signup / onboarding.  
> **Separate from** tenant SaaS plans in `src/lib/plans.ts` (`starter` / `agency` / `scale`).  
> Marketing packages = **what we deliver for one client business**.

Hard locks: critique · OAuth-only · **ad media spend always extra** · AI never unsupervised-publishes · client Approves material work.

---

## Locked commercial rules (owner)

| Rule | Detail |
|------|--------|
| **Basic** | **A$349** / company / month |
| **Pro** | **A$649** / company / month |
| **Blast** | **A$999** / company / month |
| **Custom** | Priced from modules; floor ≥ Basic (A$349) |
| **Ads** | **Any ad cost is extra** on every package — media via client prepaid credit. Package may include *management* of ads (Blast / Custom opt-in) but never media. |
| **Agency config** | Packages are **editable inside the agency app** (prices, channels, cadence, promos, active flag, Custom modules). Tenant overrides platform defaults. |
| **Cultural fit** | Posts, campaigns, and promos are planned around **festivals/holidays relevant to that business** (industry, business type, demographics, service areas). Example: Diwali → hospitality/retail; not a typical tradie. |

---

## Package matrix

### 1. Basic — A$349/mo — “Always on presence”

| Dimension | Entitlement |
|-----------|-------------|
| **Channels** | Instagram + Facebook |
| **Organic cadence** | ~8 posts / month |
| **Campaigns** | 1 always-on organic theme |
| **Ready-made promos** | 1 / quarter included |
| **Extra promos** | Catalog interest → agency packages (billed) |
| **Ads** | Media **always extra**; management not included |
| **Service level** | `managed_exceptions` |
| **Add-ons** | À la carte |

### 2. Pro — A$649/mo — “Multi-channel growth” (default recommend)

| Dimension | Entitlement |
|-----------|-------------|
| **Channels** | IG + FB + Google Business Profile (± email) |
| **Organic cadence** | ~16 posts / month + relevant seasonal |
| **Campaigns** | Always-on + 1 growth campaign / month |
| **Ready-made promos** | 1 / month included |
| **Ads** | Media **always extra**; management not included |
| **Service level** | `managed_exceptions` |

### 3. Blast — A$999/mo — “Full funnel push”

| Dimension | Entitlement |
|-----------|-------------|
| **Channels** | IG + FB + GBP + TikTok + email |
| **Organic cadence** | ~24 posts / month + relevant seasonal / promo flanking |
| **Campaigns** | Always-on + 2 themed / month |
| **Ready-made promos** | 2 / month included |
| **Ads** | **Management included**; **media always extra** (prepaid credit) |
| **Service level** | `fully_managed` |
| **Add-ons** | AI video included; others à la carte |

### 4. Custom — “Build your own”

Modules (agency-editable rate card): channels · cadence · campaign slots · promo allowance · ads management on/off · service level · add-ons.  
Media spend still always extra. Floor ≥ A$349.

---

## Cultural & demographic relevance (non-negotiable)

Every automated plan, calendar assist, campaign, and promo suggestion **must** score relevance using:

1. **Business type / industry** (`profile.businessType`, `industry`, `natureOfBusiness`)  
2. **Demographics** (`targetCustomers` and related Brand Brain fields)  
3. **Service areas / local market**  
4. **Vertical playbooks** (restaurant vs retail vs professional / trade)

| Example festival | Relevant | Not typically |
|------------------|----------|---------------|
| Diwali, Lunar New Year, Eid | Restaurant, retail, beauty, hospitality | Trade / many professional services |
| Mother’s / Father’s Day, Valentine’s | Hospitality, retail, florist | Unless demo says otherwise |
| EOFY / tax time | Professional, trade, B2B | Optional for cafes |
| Long-weekend DIY / storm season | Trade, home services | Fine dining |
| School holidays | Family hospitality, retail | B2B trade |

Universal AU public holidays may still appear as **trading-hours** notes; hard-sell cultural campaigns only when relevance matches.

---

## Agency editability

| Surface | Who | What |
|---------|-----|------|
| **`/marketing-packages`** | Agency admin | Edit catalog: name, price, channels, posts/mo, campaigns/mo, promos, ads management flag, active, blurbs; Custom module rates |
| **Company overview** | Agency | Assign Basic / Pro / Blast / Custom (+ modules) for that client |
| **Signup / onboarding** | Client | Chooses from **active** packages the agency offers |

Changes to a company’s package → bill/credit path + **updated implementation strategy** (email + calendar) when that wave ships.

---

## Shared delivery rules

1. Signup → pick package (Custom → module picker).  
2. **6h–12h** after signup: implementation plan **email** + schedule on **client calendar** + Strategy UI.  
   - `strategyEligibleAt = onboard + 6h` · `strategyDueAt = onboard + 12h`  
   - Runner does not start until eligible; SLA ceiling remains due.  
   - Local demo (`CC_LOCAL_DEMO`): eligible immediately so Strategy can unlock without waiting.  
3. Plan change anytime → payment/credit + refreshed strategy.  
   - **Unlike signup:** `strategyEligibleAt = now` (no 6h delay) · `strategyDueAt = now + 12h` so the update is not held for 6 hours.  
   - Clears `implementationPlanEmailedAt` so the full plan email can send again when the run completes.  
   - Immediate client email: “Your implementation plan is being updated for [Package]” (when email configured).  
   - Billing: audit old→new package + prices; stamp `packageChangePendingBilling` until Stripe package Checkout/proration ships (no invented charges).  
4. Catalog extras = interest/approve only.  
5. Planning always filtered by cultural/demographic relevance.

---

## Code mapping

| Concept | Location |
|---------|----------|
| Defaults + resolve | `src/lib/marketing-packages.ts` |
| Tenant overrides | `Tenant.marketingPackageCatalog` |
| Company assignment | `ManagedServiceSettings.marketingPackageId` (+ `customModules`) |
| Agency assign + refresh | `saveMarketingPackageAction` → `enqueueManagedDeliveryForCompany({ reason: "package_change" })` |
| Strategy UI | Agency `/companies/[id]/strategy` · Client `/client/strategy` |
| Agency UI | `/marketing-packages` + company overview |
| Relevance | `src/lib/calendar-intelligence.ts` (+ callers for campaigns/promos) |

Tenant SaaS `plans.ts` unchanged.
