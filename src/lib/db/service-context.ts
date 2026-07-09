// Trusted SYSTEM/service execution context (SaaS — cron/scheduler support).
//
// The scheduler/automation cron runs with NO user session, so under Supabase the
// request-scoped RLS client has no auth.uid() and every company-scoped read/write
// is blocked — the cron would silently do nothing. runInServiceContext() marks a
// scoped-to-one-tenant SYSTEM context; inside it the adapter's usr() client
// resolves to the SERVICE-ROLE client (bypasses RLS) instead of the cookie client.
//
// This is SAFE because it is only entered by trusted server-side drivers
// (scheduler.ts, wrapped per tenant) AND every repo function still filters its
// query by the tenant's own company/tenant ids — so isolation is preserved at the
// application layer exactly as it is in the in-memory store, not via RLS. It is
// NEVER entered on a user request path (those keep full RLS enforcement).

import { AsyncLocalStorage } from "node:async_hooks";

export interface ServiceCtx {
  system: true;
  tenantId: string;
}

const storage = new AsyncLocalStorage<ServiceCtx>();

// Run `fn` as the trusted system actor for ONE tenant. AsyncLocalStorage
// propagates the context across every await inside fn.
export function runInServiceContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ system: true, tenantId }, fn);
}

// The active service context, if any (undefined on normal user request paths).
export function serviceContext(): ServiceCtx | undefined {
  return storage.getStore();
}
