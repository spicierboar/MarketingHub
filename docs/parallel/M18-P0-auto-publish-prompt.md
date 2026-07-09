# Agent M18-P0-AutoPublish

**Chat title:** `M18-P0-AutoPublish` · **Branch:** `p0/m18-auto-publish`  
**Spawned by:** M16 (automatic) · **Do not start until `m16_merged=yes` on main**

```
AGENT: M18-P0-AutoPublish
Path: F:/MarketingHub/command-centre
Branch: p0/m18-auto-publish

READ FIRST:
1. docs/parallel/P0-ORCHESTRATION.md (exit sequence + fan-in)
2. docs/parallel/M16-handoff.md (lib/scheduling.ts)
3. docs/parallel/P0-MULTI-AGENT-PLAN.md

SETUP:
git fetch && git checkout main && git pull
git checkout -b p0/m18-auto-publish

SCOPE (module M8):
1. src/lib/auto-publish-on-approve.ts
   - platform/date/time from MarketingRequest or campaign item
   - companies.profile.autoPublishOnClientApprove default true
   - scheduleOne → publishPostNow when due
   - critique block → audit auto_publish_blocked, don't throw to client
2. src/lib/client-approval.ts — full completeClientApproval() impl
3. Wire src/app/approve/[token]/actions.ts → completeClientApproval()

AI AT HEART: critique gate via scheduleOne — never bypass

DO NOT TOUCH: (client)/** UI · sales/** · app-shell.tsx

VERIFY: tsc · build

OUTPUT: docs/parallel/M18-handoff.md (API doc for M17)

═══════════════════════════════════════════════════════════════
AUTO-ORCHESTRATION (mandatory on success)
═══════════════════════════════════════════════════════════════
1. Commit + push p0/m18-auto-publish
2. Update PROGRESS.md on branch: m18_handoff=yes
3. Fan-in per P0-ORCHESTRATION.md → may launch M00
4. Do NOT merge to main — M00 integrates
```
