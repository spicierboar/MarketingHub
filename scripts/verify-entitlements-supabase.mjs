// Live Supabase verification for Module 3 (per-company add-on entitlements).
//   • Checks whether migration 0008's company_entitlements table exists.
//   • If present: round-trips an entitlement under a throwaway tenant/company via
//     the service client — enable (active) → disable (cancelled) → re-enable, then
//     asserts the upsert conflict-target + timestamp semantics + the enabled_by
//     mapper alias, and that the (company_id, addon_id) uniqueness holds. Cleans
//     up on the way out (cascade on tenant delete).
//   • If absent: reports that 0008 must be applied (owner-paste), so the run is
//     honest rather than silently green.
// Reads keys from .env.local. Run from the project root:
//   node scripts/verify-entitlements-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { error: probe } = await sb.from("company_entitlements").select("company_id").limit(1);
if (probe && /does not exist|schema cache|could not find|relation/i.test(probe.message)) {
  console.log("MIGRATION NOT APPLIED — company_entitlements is missing.");
  console.log("Paste supabase/migrations/0008_company_addons.sql into the Supabase SQL editor, then re-run.");
  process.exit(3);
} else if (probe) {
  console.log(`ERROR probing company_entitlements: ${probe.message}`);
  process.exit(2);
}

console.log("company_entitlements exists. Running a service-role round-trip…");
let tenantId, companyId;
const fail = (m) => { console.log("FAIL: " + m); };
try {
  const { data: tenant, error: te } = await sb.from("tenants")
    .insert({ name: "EntVerify T", kind: "agency", plan: "agency", status: "suspended" })
    .select("id").single();
  if (te) throw new Error("create tenant: " + te.message);
  tenantId = tenant.id;
  const { data: company, error: ce } = await sb.from("companies")
    .insert({ tenant_id: tenantId, name: "EntVerify Co", created_by: "system:verify" })
    .select("id").single();
  if (ce) throw new Error("create company: " + ce.message);
  companyId = company.id;

  // Mirrors the app/adapter: `subId` set ONLY when provided (enable via Stripe
  // Checkout), OMITTED on the disable path — so ON CONFLICT DO UPDATE preserves
  // the existing stripe_subscription_id (the load-bearing invariant of the
  // webhook's anti-resurrection guard, FIX 3).
  const upsert = async (status, subId) => {
    const t = new Date().toISOString();
    const row = { company_id: companyId, addon_id: "menus", status, enabled_by: "system:verify", updated_at: t };
    if (subId !== undefined) row.stripe_subscription_id = subId;
    if (status === "active") { row.enabled_at = t; row.cancelled_at = null; }
    else { row.cancelled_at = t; }
    const { data, error } = await sb.from("company_entitlements")
      .upsert(row, { onConflict: "company_id,addon_id" }).select("*").single();
    if (error) throw new Error(`upsert ${status}: ` + error.message);
    return data;
  };

  let ok = true;
  const SUB = "sub_verify_0008";

  // 1) Enable (with a Stripe sub id) → active row, enabled_by alias present,
  //    cancelled_at null, stripe_subscription_id recorded.
  const a1 = await upsert("active", SUB);
  if (a1.status !== "active") { ok = false; fail(`enable: status=${a1.status}`); }
  if (a1.enabled_by !== "system:verify") { ok = false; fail(`enable: enabled_by=${a1.enabled_by}`); }
  if (a1.cancelled_at !== null) { ok = false; fail(`enable: cancelled_at should be null, got ${a1.cancelled_at}`); }
  if (a1.stripe_subscription_id !== SUB) { ok = false; fail(`enable: stripe_subscription_id=${a1.stripe_subscription_id}`); }

  // 2) Disable (subId OMITTED, as the app does) → SAME row updated (id preserved),
  //    status cancelled, cancelled_at set, enabled_at preserved, AND the
  //    stripe_subscription_id PRESERVED (FIX 3's anti-resurrection invariant).
  const c1 = await upsert("cancelled");
  if (c1.id !== a1.id) { ok = false; fail(`disable created a new row (id changed ${a1.id} → ${c1.id})`); }
  if (c1.status !== "cancelled") { ok = false; fail(`disable: status=${c1.status}`); }
  if (!c1.cancelled_at) { ok = false; fail(`disable: cancelled_at not set`); }
  if (c1.enabled_at !== a1.enabled_at) { ok = false; fail(`disable changed enabled_at`); }
  if (c1.stripe_subscription_id !== SUB) { ok = false; fail(`disable dropped stripe_subscription_id (got ${c1.stripe_subscription_id}) — anti-resurrection guard would break`); }

  // 3) Re-enable → active again, cancelled_at cleared, enabled_at refreshed.
  const a2 = await upsert("active");
  if (a2.status !== "active" || a2.cancelled_at !== null) { ok = false; fail(`re-enable: status=${a2.status} cancelled_at=${a2.cancelled_at}`); }

  // 4) Only ONE row exists for (company, addon) — the unique constraint held
  //    across the three upserts.
  const { data: rows, error: le } = await sb.from("company_entitlements")
    .select("id").eq("company_id", companyId).eq("addon_id", "menus");
  if (le) throw new Error("count rows: " + le.message);
  if (rows.length !== 1) { ok = false; fail(`expected exactly 1 row, found ${rows.length}`); }

  // 5) A raw INSERT of the same (company, addon) must be REJECTED by the unique
  //    constraint (proves the conflict target is real, not just app convention).
  const { error: dupe } = await sb.from("company_entitlements")
    .insert({ company_id: companyId, addon_id: "menus", status: "active", enabled_by: "system:verify" });
  if (!dupe) { ok = false; fail("duplicate insert was NOT rejected — unique(company_id,addon_id) missing"); }

  console.log(ok
    ? "ROUND-TRIP OK — enable→disable→re-enable upserts one stable row; timestamp semantics + enabled_by alias correct; stripe_subscription_id PRESERVED across cancel (anti-resurrection invariant); unique(company_id,addon_id) enforced."
    : "ROUND-TRIP had failures (see above).");
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  fail(e.message);
  process.exitCode = 1;
} finally {
  if (tenantId) {
    const { error } = await sb.from("tenants").delete().eq("id", tenantId);
    console.log(error ? `CLEANUP FAILED: ${error.message}` : "Cleanup: throwaway tenant purged (cascade).");
  }
}
