# M17 — Client portal handoff (2026-07-09)

**Agent:** M17-P0-ClientPortal · **Branch:** `p0/m17-client-portal`  
**Reset from:** `main` @ `014c87f` (corrupted remote had M19 commits — fixed)

## Shipped (modules M4–M7)

### Route group `src/app/(client)/`

- `layout.tsx` — `requirePortalUser()`, tenant + company branding via `ClientShell`
- `/client` — dashboard with pending approvals and open requests counts
- `/client/requests` — list (`visibleRequests` scoped to portal company)
- `/client/requests/new` — create form (auto `companyId`, no AI draft)
- `/client/requests/[id]` — timeline, `answerClientGap` forms, linked content draft status
- `/client/approvals` — pending `client_review` (`pending_approval` + `clientReview.status === "pending"`)
- `/client/approvals/[contentId]` — preview, approve / request changes

### Components & actions

- `src/components/client-shell.tsx` — minimal client nav (Dashboard, Requests, Approvals), tenant branding, sign out
- `src/app/(client)/actions.ts`
  - `createClientRequestAction` — auto `companyId` from `requirePortalUser()`
  - `answerClientGapAction`
  - `portalApproveContentAction` / `portalRequestChangesAction` → `completeClientApproval()` with `actor.kind === "portal"`

### RBAC & app guard

- `requirePortalUser()` in `src/lib/auth/rbac.ts` — returns `{ user, companyId }`
- `(app)/layout.tsx` — portal users redirected to `/client`

### M18 dependency (portal approve API)

- `src/app/(client)/actions.ts` calls `completeClientApproval()` from `@/lib/client-approval` (M16 stub on this branch; full engine on `p0/m18-auto-publish` — M00 merges m18 before m17)

## Do not touch (M17 boundary)

- `approve/[token]/actions.ts` — M18
- `src/app/(app)/sales/**` — M19

## Verified (2026-07-09)

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit
npm run build
```

## Flags

- `m17_handoff=yes` in PROGRESS.md on branch
