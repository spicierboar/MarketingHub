# M40 — Full RAG knowledge base handoff

m40_handoff=yes

## Branch
`w5/m40-rag` (from `main` @ 2198ba3)

## Files shipped
- `src/lib/rag.ts` — W5 RAG engine (versioned sources, lifecycle, retrieval, citations)
- `src/lib/rag-connectors.ts` — `RAG_LIVE` gate (simulated when OFF)
- `src/lib/brand-brain-rag.ts` — re-export shim
- `src/lib/selftest/rag.ts` — 9 isolation helpers + `runRagSelfTest()`
- `supabase/migrations/0033_rag.sql` — company-scoped RLS tables
- Choke: `types.ts`, `db/store.ts`, `db/index.ts`, `db/supabase-adapter.ts`, `selftest/isolation.ts`, `api/dev/self-test/route.ts`
- UI: `companies/[id]/brand-brain/page.tsx`, `brand-actions.ts`

## Fixture delta
+8 rag checks in isolation (+ runRagSelfTest bundle with 9 checks)

## Hard locks
- `RAG_LIVE` not flipped
- Did not edit `HANDOVER.md`
- Did not touch recommendations*, ai-mos*, campaign-builder*

## Verification
- `npx tsc --noEmit`
- `npx tsx scripts/run-fixtures.mjs`
