# M16 — P0 Foundation handoff (2026-07-09)

**Agent:** M16-P0-Foundation · **Branch:** `p0/m16-foundation`  
**Blocks:** M17, M18, M19 — merge to `main` before launching parallel builders.

## Shipped (modules M1–M3)

### M1 — Scheduling extract

- **New:** `src/lib/scheduling.ts` — exports `scheduleOne()` (critique gate, asset channel check, legal hold, campaign item sync).
- **Modified:** `src/app/(app)/calendar/actions.ts` — imports and delegates; no behaviour change.

### M2 — Portal RBAC & post-login redirect

- **Modified:** `src/lib/auth/rbac.ts`
  - `isPortalUser(user)` — `tenantRole === "member"` with exactly one `company_access` row in the active tenant.
  - `portalCompanyId(user)` — that company id, or `null`.
  - `postLoginRedirectPath(user)` — portal → `/client`; incomplete owner → `/onboarding`; else `/dashboard`.
- **New:** `src/app/auth/complete/page.tsx` — server-side post-auth landing (Supabase callback default).
- **Modified:** `src/app/login/actions.ts` (demo sign-in), `src/app/page.tsx` (root), `src/app/auth/callback/auth-callback-client.tsx` (default `next=/auth/complete`).

### M3 — Invite-only UX

- **Modified:** `src/app/login/page.tsx` — removed signup link; invitation copy.
- **Modified:** `src/app/signup/page.tsx` — invite-only message + link to `/login` (form hidden; `signup/actions.ts` unchanged for M19 sales provisioning).

### M16 stub — client approval API (M18 implements)

- **New:** `src/lib/client-approval.ts` — types + throwing stub.

## Interface contract (M17 / M18)

### RBAC (M17 adds `requirePortalUser` after M16 merge)

```typescript
// src/lib/auth/rbac.ts — M16 ships helpers; M17 adds guard

export async function isPortalUser(user: ActingUser): Promise<boolean>;
export async function portalCompanyId(user: ActingUser): Promise<string | null>;
export async function postLoginRedirectPath(user: ActingUser): Promise<string>;
// M17: requirePortalUser() — member + exactly 1 company_access → redirect /client
```

### Scheduling (M18 read-only)

```typescript
// src/lib/scheduling.ts — M16 owns; M18 imports for auto-publish

export async function scheduleOne(args: {
  contentId: string;
  platform: string;
  date: string;
  time?: string;
  userId: string;
  tenantId: string;
}): Promise<ScheduledPost>;
```

### Client approval (M18 owns implementation)

```typescript
// src/lib/client-approval.ts

export type ClientApprovalActor =
  | { kind: "token"; token: string; clientEmail: string; tenantId: string; companyId: string }
  | { kind: "portal"; user: ActingUser; companyId: string };

export type ClientApprovalDecision = "approved" | "changes_requested";

export async function completeClientApproval(args: {
  contentId: string;
  actor: ClientApprovalActor;
  decision: ClientApprovalDecision;
  note?: string;
}): Promise<{ ok: true; autoPublish?: "scheduled" | "published" | "skipped" | "blocked" }>;
```

**M18:** implement `completeClientApproval` → `governContent` → status update → `autoPublishOnApprove()` using `scheduleOne`. Wire `approve/[token]/actions.ts`.

**M17:** portal UI calls `completeClientApproval()` only — do not touch token approve actions.

## Do not touch (M16 scope boundary)

- `src/app/(client)/**` — M17
- `src/app/(app)/sales/**` — M19
- `src/lib/auto-publish-on-approve.ts` — M18
- `approve/[token]/actions.ts` — M18
- No migration · `PUBLISHING_LIVE` / `ADS_LIVE` unchanged

## Verified (2026-07-09)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit          # clean
Remove-Item -Recurse -Force .next; npm run build   # clean — 57 routes
npx tsx scripts/run-fixtures.mjs
# self-test 67/67 + queue-test 20/20
```

## Next steps

1. **Owner / M99:** merge `p0/m16-foundation` → `main`.
2. **Launch in parallel:** M17 (client portal), M18 (auto-publish), M19 (field sales).
3. **Merge order (M00):** m16 → m18 → m17 → m19.

**Note:** Portal users redirect to `/client` after login; route ships with M17 (404 until then — expected).
