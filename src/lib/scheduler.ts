// Scheduled tick — the real heartbeat behind automated publishing + automation
// (closes the "no scheduler, only manual buttons" gap).
//
// runScheduledTick() iterates every ACTIVE tenant and, per tenant:
//   • publishes any scheduled posts that are due (publishDuePosts), and
//   • runs the automation engine when the tenant has it enabled AND in-plan.
// Each tenant is isolated (its own system actor scoped to tenant.id) and a
// failure in one tenant never aborts the others. Nothing here bypasses a gate:
// publishDuePosts still runs the full eligibility chain, and runAutomations
// never publishes — it only drafts/queues for human approval.
//
// Two drivers call this: the authenticated /api/cron/tick route (Vercel Cron in
// production) and an optional in-process heartbeat (CC_SCHEDULER=1, local dev).

import {
  getAutomationSettings,
  listTenants,
} from "@/lib/db";
import { runInServiceContext } from "@/lib/db/service-context";
import { planIncludesAutomations } from "@/lib/billing";
import { emptyQueueCounts, publishDuePosts } from "@/lib/publish-queue";
import { runAutomations } from "@/lib/automation";
import type { ActingUser } from "@/lib/types";

// A synthetic actor scoped to one tenant. Its audit entries are honestly
// attributed to "system:cron" so automated actions are distinguishable.
function systemActor(tenantId: string): ActingUser {
  return {
    id: "system:cron",
    email: "cron@marketing-command-centre.system",
    name: "Scheduler",
    role: "super_admin",
    active: true,
    tenantId,
    tenantRole: "owner",
    createdAt: "1970-01-01T00:00:00.000Z",
  };
}

export interface TenantTickResult {
  tenantId: string;
  published: number;
  failed: number;
  skipped: number;
  deferred: number; // held under a platform ceiling (see src/lib/platform-limits.ts)
  dead: number; // dead-lettered this tick after exhausting retries
  automationOutcomes: number;
}

export async function runScheduledTick(): Promise<TenantTickResult[]> {
  const results: TenantTickResult[] = [];
  for (const tenant of await listTenants()) {
    if (tenant.status !== "active") continue;
    const actor = systemActor(tenant.id);

    // Run this tenant's work in a trusted service context so the (session-less)
    // cron can read/write under Supabase — RLS has no auth.uid() here. Every repo
    // call still scopes by this tenant's ids, so isolation is preserved.
    const tick = await runInServiceContext(tenant.id, async () => {
      let pub = emptyQueueCounts();
      try {
        pub = await publishDuePosts(actor);
      } catch {
        /* one tenant's publishing failure must not abort the tick */
      }

      let automationOutcomes = 0;
      try {
        const settings = await getAutomationSettings(tenant.id);
        if (settings.enabled && (await planIncludesAutomations(tenant.id))) {
          const run = await runAutomations(actor, { trigger: "cron" });
          automationOutcomes = run.outcomes.length;
        }
      } catch {
        /* automation gate/errors never abort the tick */
      }
      return { ...pub, automationOutcomes };
    });

    results.push({ tenantId: tenant.id, ...tick });
  }
  return results;
}
