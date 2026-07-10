# Full auto-orchestration

**Ledger:** `docs/parallel/PROGRESS.md` · **Scope:** `docs/FULL-IMPLEMENTATION-PLAN.md`

## Chain

W0 (M16→M00) → W1 (M20–M23→M01-W1) → W2 (M24–M27) → W3 (M30–M33) → W4 (M34–M37) → W5 (M40–M43) → W6 (OWNER-OPS+M45) → W7 (M50–M55→M01-FINAL)

## Rules

- Read flags before `Task` spawn; skip if already `yes`
- W0: `P0-ORCHESTRATION.md`
- **M00 spawns W1** (4 parallel Tasks) when `p0_complete=yes`
- **Live flags OFF until W6** Phase 4 GO (flip `PUBLISHING_LIVE`+`ADS_LIVE`+`ANALYTICS_LIVE` together)
- **W7 code-only OK while W6 Google-blocked** (owner confirmed 2026-07-10); migration band `0034_*`

## Integrator merge order

| Integrator | Order |
|------------|-------|
| M00 | m18 → m17 → m19 |
| M01-W1 | m23 → m20 → m21 → m22 |
| M01-W2 | m24 → m25 → m26 → m27 |
| M01-FINAL | m50 → m51 → m52 → m53 → m54 → m55 |

## Fixtures

W0: 77/77 · W1: ~85 · W2: ~95 · W3: ~110 · W5: 165/165 · full: TBD

## W7 prompts

`M50-W7-bookings-prompt.md` · `M51-W7-local-seo-prompt.md` · `M52-W7-exec-dash-prompt.md` · `M53-W7-api-prompt.md` · `M54-W7-security-prompt.md` · `M55-W7-video-learning-prompt.md`
