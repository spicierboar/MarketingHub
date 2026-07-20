# Managed-content job deployment

Command Centre submits Content Engine contract `1.0` jobs through
`POST /api/managed-content/jobs`. Content Engine callbacks are received at
`POST /api/content-engine/events`; the route is public but requires the signed
event headers and rejects timestamps outside the configured replay window.
The existing hourly scheduler polls accepted/processing jobs when callbacks
are delayed or fail.

After migration history is reconciled, apply
`supabase/migrations/0049_managed_content_jobs.sql` after migration 0048, then
`supabase/migrations/0050_content_desk_delegation_replay_ledger.sql`. Do not
use an unqualified database push while history is unreconciled. The correlation,
callback/replay ledgers, provenance and staff-exception tables are service-only
and have RLS enabled without client policies.

## Content Desk submission boundary

Content Desk may call `POST /api/managed-content/jobs` with only this strict
caller-intent body:

```json
{
  "companyId": "company-id",
  "requestId": "content-desk-unique-request-id",
  "conceptId": "command-centre-concept-id",
  "plannedSlotId": "command-centre-slot-id",
  "assetIds": ["command-centre-asset-id"],
  "brief": "Operator intent for this generation."
}
```

Unknown fields are rejected. In particular, Content Desk must not send a
tenant, role, entitlement/package, strategy payload, theme, channel, schedule,
rights assertion, approval, or publishing instruction. Command Centre resolves
the company inside the delegated actor's tenant and independently checks the
actor's authoritative role and company assignment. It then derives the current
approved strategy, package/quota, concept theme, explicit planned slot and
channel, publish time, and asset rights from Command Centre records.
Archived companies are treated as inaccessible and return `404` before any
managed-content side effect.

Content Desk authenticates each request with:

- `Authorization: Bearer <CONTENT_DESK_INTERNAL_TOKEN>` for service identity.
- `X-Content-Desk-Actor: <signed-delegation>` for the real Admin/Staff actor.

Both credentials are mandatory on this route. It does not accept Command
Centre cookie sessions and has no first-party fallback.

The actor delegation is an HS256 compact JWT signed with the shared server-only
actor signing secret. Its header is exactly `{"alg":"HS256","typ":"JWT"}` and
its payload is exactly:

```json
{
  "iss": "content-desk",
  "aud": "command-centre",
  "sub": "command-centre-user-id",
  "tenantId": "command-centre-tenant-id",
  "iat": 1900000000,
  "exp": 1900000060,
  "jti": "unique-delegation-id"
}
```

Use integer epoch seconds, a unique `jti`, and exactly `exp - iat = 60`.
Command Centre requires `iat <= now < exp`; there is no future clock-skew
allowance. Each issuer/JTI is atomically consumed once in the durable replay
ledger before operator work begins. Command Centre rejects replayed, expired,
future-issued, malformed-lifetime, malformed, or tampered delegations and
resolves identity, email, active tenant, role, tenant membership, and company
access from its database. Do not include client-supplied role metadata.
Successful submissions append `managed_content.job_submitted` using the real
resolved actor id and email.

Desk response handling: `401` means missing, invalid, expired, or replayed
credentials and requires a freshly minted delegation; `403` means the resolved
actor, tenant, or role is not authorized; `404` hides an inaccessible company;
`400` is an invalid intent body; `409` is an authoritative governance conflict;
`503` means server authentication/replay protection is unavailable.

## Content Desk status polling

Content Desk polls:

```text
GET /api/managed-content/jobs/:jobId
```

Every poll requires the service bearer and a newly minted, single-use
`X-Content-Desk-Actor` delegation. The GET consumes its issuer/JTI exactly like
POST; a delegation cannot be shared across requests or polling attempts.
Command Centre resolves the active tenant, membership and role, then scopes the
job lookup to that tenant and independently verifies company access. Unknown,
cross-tenant, unassigned-company and archived-company jobs all return `404`.

A successful response is the raw Content Desk `ClientManagedJob` shape:

```json
{
  "id": "ccmj_...",
  "conceptId": "command-centre-concept-id",
  "status": "paused",
  "pollAttempts": 2,
  "updatedAt": "2030-01-20T10:00:00.000Z",
  "lastError": "Managed content delivery is paused by Command Centre service controls."
}
```

Status is one of `submitting`, `submit_failed`, `accepted`, `processing`,
`ready`, `paused`, `failed`, or `poll_exhausted`. `lastError` is `null` for
non-failure states and a fixed client-safe explanation for paused/failure
states. The response never includes tenant/company correlation, request
payloads, external job/status URLs, result payloads, provider/model/prompt
provenance, or raw upstream errors. GET uses the same `401`, `403`, `404`, and
`503` authentication/authorization semantics documented above.

Configure these variable names in the deployment environment:

- `CONTENT_ENGINE_BASE_URL`
- `CONTENT_ENGINE_API_KEY`
- `CONTENT_ENGINE_MANAGED_JOBS_LIVE`
- `CONTENT_ENGINE_REQUEST_TIMEOUT_MS`
- `CONTENT_ENGINE_CALLBACK_TARGET`
- `CONTENT_ENGINE_CALLBACK_URL`
- `COMMAND_CENTRE_PUBLIC_URL`
- `MANAGED_CONTENT_CALLBACK_SECRET`
- `MANAGED_CONTENT_CALLBACK_REPLAY_WINDOW_SECONDS`
- `MANAGED_CONTENT_POLL_BASE_MS`
- `MANAGED_CONTENT_POLL_MAX_MS`
- `MANAGED_CONTENT_POLL_MAX_ATTEMPTS`
- `CONTENT_DESK_INTERNAL_TOKEN`
- `CONTENT_DESK_ACTOR_SIGNING_SECRET`

Set `CONTENT_ENGINE_CALLBACK_TARGET=command-centre` for the deployed,
allowlisted Content Engine integration. Otherwise set
`CONTENT_ENGINE_CALLBACK_URL`, or let Command Centre derive that URL from
`COMMAND_CENTRE_PUBLIC_URL`. Never configure both callback selector variables.
`MANAGED_CONTENT_CALLBACK_SECRET` must match Content Engine. URL-based
callbacks must be inside Content Engine's `COMMAND_CENTRE_BASE_URL` allowlist.

Keep `CONTENT_ENGINE_MANAGED_JOBS_LIVE` unset/false in staging to use the
simulated submission path. Enable it only after the Content Engine URL, API
key, callback allowlist, shared callback secret and migration are in place.
