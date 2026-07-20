# Canonical Supabase baseline preparation

This directory records the read-only evidence used to prepare the canonical
Command Centre baseline on 2026-07-19.

## Evidence

- `command-centre-staging-public-catalog-20260719.json` is a read-only
  `pg_catalog` snapshot of the linked staging project's `public` schema.
- `command-centre-staging-public-catalog-supplemental-20260719.json` records
  column grants and table/column comments.
- `build-canonical-baseline.mjs` deterministically converts those snapshots
  into a schema-only baseline and verifies the archived legacy effects.

The snapshot reports PostgreSQL 17.6, no
`supabase_migrations.schema_migrations` table, 121 public tables, 1,532
columns, 438 constraints, 252 indexes, 10 functions, 146 policies, and four
enums. It contains catalog metadata and function definitions but no table row
data or credentials.

The Supabase CLI's official `db dump --linked --schema public` path was
attempted but could not run because it invokes Docker and Docker Desktop is
not installed on this machine. Native `pg_dump` and `psql` are also absent.
The catalog snapshots are therefore the authoritative preparation evidence,
not a claim that the generated baseline has been replay-tested.

## Active migrations

The active `supabase/migrations` directory contains:

1. `20260719044000_command_centre_staging_canonical_baseline.sql` — schema-only
   representation of the verified remote `public` catalog.
2. `20260719044100_content_desk_delegation_replay_ledger.sql` — timestamped,
   unapplied successor to logical migration 0050.
3. `20260719063533_remediate_database_security.sql` — focused tenant-policy and
   `SECURITY DEFINER` ACL/search-path remediation from the read-only advisor
   audit.

None of these files has been applied to staging and remote migration history
has not been repaired.

## Validation gate

Before any remote history repair or migration application:

1. Install and start Docker Desktop, or install compatible PostgreSQL 17
   `pg_dump`, `psql`, and a disposable local PostgreSQL server.
2. Replay the baseline into an empty disposable Supabase/PostgreSQL database.
3. Compare the resulting schema to the captured catalogs, including RLS,
   policies, grants, function ACLs, constraints, and indexes.
4. Apply the replay-ledger migration locally and test its atomic one-use
   behavior.
5. Apply the database-security remediation locally; run
   `supabase test db supabase/tests/database --local` and
   `supabase db advisors --local`. Expected remaining findings and the manual
   leaked-password step are documented in `../../docs/DATABASE_SECURITY.md`.
6. Only after review, establish remote baseline history using the exact
   documented CLI command and version. Never run an unqualified linked
   `db push`.

