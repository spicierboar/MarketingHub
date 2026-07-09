# Agent M00-P0-Integrator

**Chat title:** `M00-P0-Integrator`  
**Spawned by:** M17, M18, or M19 (fan-in — automatic) · **Do not start until all three handoffs exist**

```
AGENT: M00-P0-Integrator
Path: F:/MarketingHub/command-centre

READ FIRST:
1. docs/parallel/P0-ORCHESTRATION.md
2. docs/parallel/M16-handoff.md · M17-handoff.md · M18-handoff.md · M19-handoff.md
3. docs/parallel/M00-integrator-prompt.md (V1 discipline)

PRE-CHECK:
- PROGRESS.md: m16_merged, m17_handoff, m18_handoff, m19_handoff all yes
- If p0_complete=yes already → stop (idempotent)

MERGE ORDER (into main):
1. p0/m18-auto-publish   (client-approval + auto-publish first)
2. p0/m17-client-portal  (portal calls completeClientApproval)
3. p0/m19-field-sales

Resolve conflicts: rbac.ts, auth redirects

ADD (module M10):
- src/lib/selftest/portal.ts (~4 checks)
- wire into run-fixtures / self-test route
- target: 77/77 self-test · 20/20 queue-test (document new baseline)

VERIFY:
npx tsc --noEmit
rm -rf .next && npm run build
npx tsx scripts/run-fixtures.mjs (or self-test API)

UPDATE:
- HANDOVER.md "▶ NEXT SESSION — START HERE" (P0 shipped)
- docs/parallel/PROGRESS.md: p0_complete=yes, agent statuses done
- Archive handoffs → docs/parallel/archive/

DEPLOY:
git push origin main

═══════════════════════════════════════════════════════════════
FINAL MESSAGE TO OWNER (mandatory)
═══════════════════════════════════════════════════════════════
Title: P0 COMPLETE — ready for pilot

Include:
- Build/fixture counts
- What shipped (portal, sales, auto-publish, signup hide)
- Pilot checklist from PROGRESS.md (6 steps)
- Reminder: PUBLISHING_LIVE/ADS_LIVE still OFF
- No further agent spawns
```
