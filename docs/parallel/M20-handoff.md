# M20 — Client reports handoff (2026-07-09)

**Agent:** M20-W1-ClientReports · **Branch:** `w1/m20-client-reports`

## Shipped

- `/client/reports` — white-label ROI dashboard (organic + paid + leads)
- `src/lib/client-reports.ts` — report engine + scheduled Resend email (sim without key)
- Scheduler hook — weekly portal report emails on cron tick
- Self-test +8 (`reports.*`) → ~85 total

## Flags

`m20_handoff=yes`
