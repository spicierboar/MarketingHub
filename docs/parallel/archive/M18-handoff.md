# M18 — P0 Auto-publish handoff (2026-07-09)

**Agent:** M18-P0-AutoPublish · **Branch:** `p0/m18-auto-publish`  
**Depends:** M16 (`lib/scheduling.ts`) · **Consumers:** M17 portal UI, M00 integrator

## Shipped (module M8)

### `src/lib/auto-publish-on-approve.ts` (new)

- **`autoPublishOnApprove()`** — after client approval, optionally schedules and publishes.
- **Company flag:** `companies.profile.autoPublishOnClientApprove` — defaults **true** when absent; set `false` to skip.
- **Schedule intent** resolved in order:
  1. Linked **MarketingRequest**: `platform`, `preferredDate`, `preferredTime`
  2. Linked **CampaignItem** + campaign start: `channel`, `addDaysIso(startDate, dayOffset - 1)`
  3. Fallbacks: platform `Facebook`, date = tenant-local today (`queueNowPartsForTenant`)
- **Critique gate:** calls `scheduleOne()` — never bypasses AI critique / asset channel checks.
- **Critique block:** catches scheduling errors, audits `content.auto_publish_blocked`, returns `"blocked"` (approval still succeeds).
- **Due posts:** when `isDue(post, today, hhmm)`, calls `publishPostNow()` (sim path OK with `PUBLISHING_LIVE=false`).

### `src/lib/client-approval.ts` (full impl)

- **`completeClientApproval()`** — single API for token route and portal (M17).
- Pipeline: validate actor → `governContent` (approve only) → status update → request/campaign/variant side-effects → audit → `autoPublishOnApprove()`.
- Returns `{ ok: true, autoPublish?: "scheduled" | "published" | "skipped" | "blocked" }`.

### `src/app/approve/[token]/actions.ts` (wired)

- `clientApproveAction` → `completeClientApproval({ decision: "approved", actor: { kind: "token", … } })`
- `clientRequestChangesAction` → `completeClientApproval({ decision: "changes_requested", … })`
- `clientCommentAction` unchanged (comments only).

## API contract (M17 imports)

```typescript
import {
  completeClientApproval,
  type ClientApprovalActor,
  type ClientApprovalDecision,
  type ClientApprovalResult,
} from "@/lib/client-approval";

await completeClientApproval({
  contentId,
  actor: { kind: "portal", user, companyId },
  decision: "approved",
});
```

## Verified (2026-07-09)

```powershell
npx tsc --noEmit   # clean on M18-only tree
```

## Merge note (M00)

Merge order: `p0/m18-auto-publish` → `p0/m17-client-portal` → `p0/m19-field-sales` → `main`
