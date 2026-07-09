# Agent M23-W1-PortalMigration

**Branch:** `w1/m23-portal-migration` · **Owns migration 0028**

```
AGENT: M23-W1-PortalMigration
Path: F:/MarketingHub/command-centre

SCOPE:
- supabase/migrations/0028_portal_and_sales.sql (portal_only flag)
- rbac.ts: portal_only when set; else infer member + single company_access
- Handoff: OWNER PASTE instructions (agent does not paste to live DB)

MERGE FIRST in M01-W1 integrator
OUTPUT: docs/parallel/M23-handoff.md · m23_handoff=yes
VERIFY: tsc · build · push
```
