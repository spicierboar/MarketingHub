# Agent M19-P0-FieldSales

**Chat title:** `M19-P0-FieldSales` · **Branch:** `p0/m19-field-sales`  
**Spawned by:** M16 (automatic) · **Do not start until `m16_merged=yes` on main**

```
AGENT: M19-P0-FieldSales
Path: F:/MarketingHub/command-centre
Branch: p0/m19-field-sales

READ FIRST:
1. docs/parallel/P0-ORCHESTRATION.md (exit sequence + fan-in)
2. docs/P0-IMPLEMENTATION-PLAN.md (one tenant → many companies)
3. docs/parallel/P0-MULTI-AGENT-PLAN.md

SETUP:
git fetch && git checkout main && git pull
git checkout -b p0/m19-field-sales

SCOPE (module M9):
NEW src/app/(app)/sales/new-client/page.tsx — tablet stepper (reuse onboarding Stepper)
NEW src/app/(app)/sales/actions.ts

Steps: business → add-ons → Stripe checkout → provision client → done
- createCompany under SESSION tenant (NOT new tenant)
- createAddonCheckoutSession for selected add-ons (sequential OK)
- createUser + addMembership(member) + grantAccess(company)
- Seed company profile for AI context (business-profiles patterns)

Gate: requireAdmin() OR role_title sales_rep
Nav: app-shell.tsx — "New client"

DO NOT TOUCH: (client)/** · client-approval · approve/[token]/actions.ts

VERIFY: tsc · build

OUTPUT: docs/parallel/M19-handoff.md

═══════════════════════════════════════════════════════════════
AUTO-ORCHESTRATION (mandatory on success)
═══════════════════════════════════════════════════════════════
1. Commit + push p0/m19-field-sales
2. Update PROGRESS.md on branch: m19_handoff=yes
3. Fan-in per P0-ORCHESTRATION.md → may launch M00
4. Do NOT merge to main — M00 integrates
```
