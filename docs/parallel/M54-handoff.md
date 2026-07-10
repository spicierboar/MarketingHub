# M54 handoff — Security hardening (W7)

**Branch work:** on `main` (code-only)  
**Status:** implemented (stub/suggest-only — no live flags flipped)

## Delivered

### Engine — `src/lib/security-slice.ts`

- **MFA enrollment stubs (OAuth-only)**
  - `mfaIdpConfigured()` — gated on `MFA_IDP_CLIENT_ID` + `MFA_IDP_ISSUER`
  - `getMfaEnrollment()` / `beginMfaEnrollment()` / `completeMfaEnrollment()` — statuses `not_enrolled` | `pending` | `enabled`; stub when IdP unset; **no passwords stored**
  - In-memory store (no migration)
- **Admin impersonation**
  - `startImpersonation()` / `stopImpersonation()` — fail-closed unless `admin`/`super_admin`; cross-tenant blocked
  - `listImpersonationAudit()` / `getActiveImpersonation()` — in-memory audit trail (audit-only stub; no session swap)
- **API key scope hardening hooks** (for `public-api` to adopt later)
  - `assertScopeAllowed()`, `validateApiKeyScopes()`, `dangerousScopeWarnings()`, `DANGEROUS_API_KEY_SCOPES`
- **Integration health alerting**
  - `buildIntegrationHealthAlerts()` — threshold-based alerts from `buildIntegrationHealthBundle()`

### UI

- `src/components/security-health-panel.tsx` — extended with:
  - `IntegrationHealthAlertsPanel`
  - `MfaEnrollmentPanel`
  - `ImpersonationAuditPanel`
- `/admin` — MFA stub, impersonation audit, health alerts sections
- `/ai-control` — integration health alerts panel
- `src/app/(app)/admin/actions.ts` — MFA + impersonation server actions (audit logged)

### Self-test — `src/lib/selftest/security-slice.ts` (+3)

- `securitySlice.mfaStubWhenIdpOff`
- `securitySlice.impersonationFailClosed`
- `securitySlice.integrationHealthAlerts`

Wired in `src/lib/selftest/isolation.ts` (not `self-test/route.ts`).

## Migration

**None** — MFA enrollment, impersonation audit, and alert bundles are in-process / compute-only.

## Hard locks respected

- OAuth-only MFA · no passwords · `appEnv()` used in stub messaging
- No live flags flipped
- Did **not** edit: `bookings*`, `local-seo*`, `exec-dash*`, `public-api` routes, `video*`, `learning*`, `HANDOVER`, `self-test/route.ts`

## Verify

```powershell
cd F:/MarketingHub/command-centre
npx tsc --noEmit
```

Self-test (dev/staging):

```powershell
# With dev server running:
curl http://localhost:3000/api/dev/self-test
# Expect new checks: securitySlice.mfaStubWhenIdpOff, impersonationFailClosed, integrationHealthAlerts
```

UI:

- `/admin` — MFA enrollment card, impersonation audit, integration alerts
- `/ai-control` — integration alerts below health table

## Blockers / follow-ups

- **MFA IdP:** Set `MFA_IDP_CLIENT_ID` + `MFA_IDP_ISSUER` for real OAuth/OIDC enrollment; until then UI stays suggest/stub.
- **Impersonation:** V1 records audit only — wire session swap when auth layer supports controlled impersonation.
- **Public API:** Call `assertScopeAllowed` / `validateApiKeyScopes` from route handlers when hardening M27 routes (helpers ready; routes untouched per lock).
