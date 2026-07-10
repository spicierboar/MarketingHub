# M43 — W5 AI campaign builder handoff

m43_handoff=yes

**Branch:** `w5/m43-campaign-builder`  
**Baseline:** `main` @ 2198ba3 · self-test **127/127** entering  
**Target:** self-test **134/134** (+7 campaign builder checks)

---

## Shipped

- `src/lib/campaign-builder.ts` — W5 facade + `executeCampaignBuilder()`
- `src/lib/campaign-builder-connectors.ts` — `CAMPAIGN_BUILDER_LIVE` gate
- `src/lib/ai/campaign-builder.ts` — multi-channel upgrade (`MULTI_CHANNEL_OPTIONS`)
- `supabase/migrations/0033_campaign_builder.sql` — plan versions, builder runs, draft schedule
- UI: `/campaigns/new` multi-channel panel + `/campaigns/[id]` builder run + draft schedule unpack
- Self-test: +7 checks wired in `isolation.ts`

## Verification

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit
npx tsx scripts/run-fixtures.mjs
```

M43 fixture delta: **+7** (127 → 134 on this baseline).

## Hard locks preserved

- Draft-only — `spawnGovernedDraftForItem()` never schedules
- `CAMPAIGN_BUILDER_LIVE` default OFF
- Critique gate untouched
- RAG read-only via `brand-brain-rag`
- `HANDOVER.md` not edited

## Blockers

- Parallel W5 agents (M40–M42) can pollute shared choke files and switch branches; M43 owns `campaign-builder*` only.
