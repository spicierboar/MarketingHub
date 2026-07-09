# Agent M17-P0-ClientPortal

**Chat title:** `M17-P0-ClientPortal` · **Branch:** `p0/m17-client-portal`  
**Spawned by:** M16 (automatic) · **Do not start until `m16_merged=yes` on main**

```
AGENT: M17-P0-ClientPortal
Path: F:/MarketingHub/command-centre
Branch: p0/m17-client-portal

READ FIRST:
1. docs/parallel/P0-ORCHESTRATION.md (exit sequence + fan-in)
2. docs/parallel/M16-handoff.md
3. docs/parallel/P0-MULTI-AGENT-PLAN.md (file ownership)
4. HANDOVER.md — THE ISOLATION RULE

SETUP:
git fetch && git checkout main && git pull
git checkout -b p0/m17-client-portal

SCOPE (modules M4–M7):
NEW src/app/(client)/:
  layout.tsx — requirePortalUser(), client-shell (tenant branding)
  /client — dashboard: pending approvals, open requests
  /client/requests — list (visibleRequests)
  /client/requests/new — auto companyId, no AI draft button
  /client/requests/[id] — timeline, answerGap only
  /client/approvals — pending client_review
  /client/approvals/[contentId] — approve/changes via completeClientApproval()

requirePortalUser() in rbac.ts (M16 merged — safe to extend)
Block (app)/* for portal users → redirect /client
src/app/(client)/actions.ts — reuse createRequest patterns

AI AT HEART: show draft status; client never triggers generateDraft

DO NOT TOUCH: approve/[token]/actions.ts · sales/** · scheduling.ts · auto-publish-on-approve.ts

VERIFY: tsc · build (fixtures on M00)

OUTPUT: docs/parallel/M17-handoff.md

═══════════════════════════════════════════════════════════════
AUTO-ORCHESTRATION (mandatory on success)
═══════════════════════════════════════════════════════════════
1. Commit + push p0/m17-client-portal
2. Update docs/parallel/PROGRESS.md on your branch: m17_handoff=yes
3. Follow fan-in in P0-ORCHESTRATION.md:
   - pull main; if m17+m18+m19 handoffs all yes AND m00_launched≠yes
   - claim m00_launched on main + Task(M00) with M00-P0-integrator-prompt.md
4. Do NOT merge to main yourself — M00 integrates
```
