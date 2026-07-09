// Audit logging. Every material action records an entry (master prompt §57).
// Audit entries are append-only — there is no delete path.
//
// T1: every entry is stamped with the ACTOR'S TENANT (from the session-resolved
// user) so one tenant's compliance trail is never visible to another. Entries
// without a tenant (failed logins, platform-level ops) are platform-only.

import { db } from "@/lib/db/store";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { supabaseRepo } from "@/lib/db/supabase-adapter";
import { id, now } from "@/lib/utils";
import type { AuditLog, User } from "@/lib/types";

export async function logAction(
  actor: Pick<User, "id" | "email"> & { tenantId?: string },
  action: string,
  opts: {
    targetType?: string;
    targetId?: string;
    companyId?: string;
    detail?: string;
    tenantId?: string; // override when acting outside the session tenant
  } = {},
): Promise<void> {
  if (isSupabaseConfigured()) {
    await supabaseRepo.appendAudit({
      action,
      actorId: actor.id,
      actorEmail: actor.email,
      tenantId: opts.tenantId ?? actor.tenantId,
      targetType: opts.targetType,
      targetId: opts.targetId,
      companyId: opts.companyId,
      detail: opts.detail,
    });
    return;
  }
  const entry: AuditLog = {
    id: id("a"),
    tenantId: opts.tenantId ?? actor.tenantId,
    action,
    actorId: actor.id,
    actorEmail: actor.email,
    targetType: opts.targetType,
    targetId: opts.targetId,
    companyId: opts.companyId,
    detail: opts.detail,
    createdAt: now(),
  };
  db().audit.push(entry);
}

// One tenant's audit trail, optionally narrowed to specific companies.
export async function listAudit(
  tenantId: string,
  companyIds?: string[],
): Promise<AuditLog[]> {
  if (isSupabaseConfigured()) return supabaseRepo.listAudit(tenantId, companyIds);
  let entries = db().audit.filter((e) => e.tenantId === tenantId);
  if (companyIds) {
    const allowed = new Set(companyIds);
    // Entries scoped to allowed companies, plus company-agnostic tenant ones.
    entries = entries.filter((e) => !e.companyId || allowed.has(e.companyId));
  }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
