# Immutable legacy migration archive

This directory preserves the 49 migration files that were manually applied to
`command-centre-staging` before Supabase migration history was established.
Their original filenames and contents are unchanged.

`legacy-effect-manifest.json` records, for every file:

- its original filename and four-digit version;
- SHA-256 hash;
- deterministic canonical order;
- `PRESENT`, `PARTIAL`, or `ABSENT` verification against the read-only remote
  catalog snapshot; and
- any failed verification checks.

All 49 files were verified `PRESENT`. The two indexes introduced by migration
0007 and intentionally replaced by migration 0046 are recorded explicitly as
superseded effects rather than silently treated as present.

Do not edit, rename, execute, or move these archived files. Future schema
changes belong in `supabase/migrations` and must use unique CLI-generated
timestamp versions. The archive is lineage evidence, not an active migration
source.

The `pending` directory preserves the original, unapplied logical migration
0050. Its active timestamped successor includes the original SHA-256 hash.

