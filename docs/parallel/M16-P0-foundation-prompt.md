# Agent M16-P0-Foundation

**Chat title:** `M16-P0-Foundation`  
**Run:** Before all other P0 builders · **Branch:** `p0/m16-foundation`

```
AGENT: M16-P0-Foundation
Path: F:/MarketingHub/command-centre

READ FIRST:
1. docs/P0-IMPLEMENTATION-PLAN.md
2. docs/parallel/P0-MULTI-AGENT-PLAN.md (file ownership)
3. HANDOVER.md — THE ISOLATION RULE + appEnv() only

BLOCKS: M17, M18, M19 (must merge before they start)

SCOPE — modules M1–M3:
1. Extract scheduleOne → src/lib/scheduling.ts
   - calendar/actions.ts imports and delegates (no behaviour change)
2. src/lib/auth/rbac.ts:
   - isPortalUser(user): member + exactly 1 company_access in tenant
   - portalCompanyId(user): string | null
3. Post-login redirect (auth callback / session):
   - portal user → /client
   - tenant owner incomplete onboarding → /onboarding
   - else → /dashboard
4. Invite-only UX:
   - login/page.tsx — remove signup link; invitation copy
   - signup/page.tsx — invite-only message + link to /login
5. src/lib/client-approval.ts — export types + stub completeClientApproval (M18 fills)

NON-NEGOTIABLES:
- No migration · minimal types.ts touch
- tsc + rm -rf .next && npm run build
- fixtures 67/67 self-test · 20/20 queue-test

DO NOT:
- Build (client)/* or sales/*
- Implement auto-publish logic
- Set PUBLISHING_LIVE or ADS_LIVE

OUTPUT:
- docs/parallel/M16-handoff.md (interface contract for M17/M18)
- Tell owner: M16 merged — launch M17 + M18 + M19 in parallel
```
