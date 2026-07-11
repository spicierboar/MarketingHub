# AI campaign management layer

Governed AI planning and optimisation on top of existing Campaign / Offer / Content
workflows. Extends — does not replace — the campaign builder, approvals, calendar
critique gate, and publish queue.

## Assessment summary (reuse first)

| Domain | Reuse | Extend | New |
|--------|-------|--------|-----|
| **Campaign** | `campaigns`, items, approve/submit/cancel, builder | Optional layer fields (`campaignType`, budget, `layerMeta`, …) | — |
| **Offer / Promotion** | Offer Manager as promotion root | Promotion columns on `offers` (0035) | — |
| **Content** | `ai_draft` → submit → approve → schedule | Orchestrator may spawn drafts via builder only | — |
| **Calendar / publish** | Critique gate + schedule actions | — | No drag-drop calendar in this slice |
| **Recommendations** | Ranked `/recommendations` engine | Surface AI campaign recs on same page | `ai_campaign_recommendations` |
| **AI-MOS** | Suggest-only opportunities | Parallel surface; not merged into MOS cards | — |
| **Compliance / critique** | `checkCompliance`, critique before schedule | Flags copied into structured payloads | — |
| **Approvals / RBAC** | `assertAdminCompanyAccess`, campaign approve | `approval_policies` + default resolver | Full matrix deferred |
| **Analytics** | Health scores, calendar intel, simulated snapshots | Optimise reads signals | Live connectors deferred |

**Verdict:** Extend existing Campaign/Offer/Content loops with structured AI recommendations and human gates. Do not invent a second campaign product.

## What was extended vs new

### Extended
- `campaigns` / `offers` columns (migration 0035)
- `/campaigns/new` Build from goal panel — structured output legend
- `/campaigns/[id]` — plan review sections, AI recommendations, **Run AI optimisation**
- `/recommendations` — optional AI campaign layer panel
- Self-test isolation runner (+5 checks)

### New
- `src/lib/ai-campaign-orchestrator.ts` — plan / optimise / decide
- `src/lib/ai/recommendation-schema.ts`, `approval-policies.ts`, `prompt-registry.ts`
- Types + in-memory DB accessors for orchestration runs, recommendations, policies, snapshots
- `src/app/(app)/campaigns/ai-layer-actions.ts`
- `src/components/ai-campaign-recommendations-panel.tsx`
- `src/lib/selftest/ai-campaign-layer.ts`
- This doc

## Human approval rules

1. **Plan** creates `draft` campaigns + governed `ai_draft` content only. Never auto-approves, schedules, or publishes.
2. **Optimise** emits recommendations with `approval_required` (except pure `monitor_continue`). Never mutates budget, publish, or promotions.
3. **Accept** creates follow-up **tasks** only. Publish / budget / promotion action types are blocked.
4. **Reject** records the decision and audits; no execution.
5. Existing gates remain: campaign submit → admin approve → per-item draft → content approve → calendar critique → schedule → publish queue.
6. Default approval policy: publish, content, budget, promotion, complaint, crisis, campaign, spend always require a human unless an explicit low-risk allowlist rule applies (never for publish/budget/promotion/crisis).

## Migration 0035 — owner paste path

Owner applies SQL in the Supabase SQL editor (no psql/CLI/PAT):

```powershell
notepad F:\MarketingHub\command-centre\supabase\migrations\0035_ai_campaign_layer.sql
```

Paste the full file contents into the Supabase SQL editor and run. Safe to re-run (`if not exists` / `add column if not exists`).

RLS uses existing helpers from `0001_phase1_init.sql` (`is_tenant_member`, `is_tenant_admin`, `has_company_access`) — **not** `auth_tenant_id()` (that function does not exist in this project).

## Rollback notes

- **App code:** leave live flags OFF; stop using AI layer actions / UI. Existing campaign builder path (`createCampaignFromGoalAction`) is unchanged.
- **Data:** new tables can remain empty; optional columns on `campaigns`/`offers` are nullable or defaulted and do not break old rows.
- **Hard rollback (owner):** drop new tables (`ai_campaign_recommendations`, `ai_orchestration_runs`, `approval_policies`, `ai_prompt_versions`, `campaign_performance_snapshots`) only if no production data depends on them; do **not** drop shared `campaigns`/`offers` columns if any rows use them — prefer leaving columns unused.
- **Never** flip `*_LIVE` flags as part of this layer.

## Completion criteria

| Criterion | Status |
|-----------|--------|
| Migration 0035 schema | Done (owner pasted) |
| Types + store + db accessors | Done |
| Orchestrator plan / optimise / decide | Done |
| Recommendation schema validation | Done |
| Approval policy defaults | Done |
| Prompt registry builtins | Done |
| NL create structured sections UI | Done |
| Recommendations panel + Accept/Reject | Done |
| Optimise entry on campaign detail | Done |
| Server actions (admin, revalidate, no publish) | Done |
| Self-tests wired into isolation | Done |
| Docs | Done |
| Prompt admin screens (`/ai-prompts`) | Done |
| Additive RBAC capabilities (`0036_rbac_capabilities`) | Done |
| Drag-drop calendar reschedule (critique-gated) | Done |
| Campaign experiment winner engine (`0036_campaign_experiments`) | Done |
| Privacy DSR UI (`0037_privacy_dsr`) | Done |
| Connector capability registry (flags OFF) | Done |
| Approval-gated spend apply (not auto-spend) | Done |
| Live platform connectors / W6 cutover | **Waiting on Google** |
| Autonomous auto-spend / auto-publish | **Out of scope** (never without human gate) |

## Owner migrations to paste (after 0035)

```powershell
notepad F:\MarketingHub\command-centre\supabase\migrations\0036_rbac_capabilities.sql
notepad F:\MarketingHub\command-centre\supabase\migrations\0036_campaign_experiments.sql
notepad F:\MarketingHub\command-centre\supabase\migrations\0037_privacy_dsr.sql
```

Parallel `0036_*` files are independent modules (same pattern as W5).

## Demo steps

1. Ensure local demo env and `npx next dev -p 3002`.
2. Sign in as the agency operator (seed `sasha@brightspark.dev`) or client portal (`liam@brightspark.dev`).
3. Open `/campaigns/new` — confirm **Structured plan output** sections under Build from goal.
4. Enter a goal → **Build with AI layer review** (admin) → lands on campaign detail in **draft**.
5. On detail: confirm **AI layer plan review** sections + pending recommendation; **Accept** / **Reject** (reject creates no posts).
6. Click **Run AI optimisation** → new pending recommendation with approval required.
7. Optionally open `/recommendations` to see the AI campaign layer panel.
8. Confirm campaign status stays draft until normal submit/approve; no scheduled/published posts from Accept/Reject alone.
