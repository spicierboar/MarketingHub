// Live Supabase verification for migration 0007 (terms + onboarding).
//   • Checks terms_versions / terms_acceptances exist + tenants.onboarding cols.
//   • Round-trips: publish a terms version, record an acceptance, and set a
//     tenant's onboarding jsonb + completed_at — asserting the jsonb + version
//     survive the round-trip. Cleans up (throwaway tenant cascade + the terms row).
//   • If absent: reports that 0007 must be applied.
// Reads keys from .env.local. Run from the project root:
//   node scripts/verify-terms-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Presence check.
const missing = [];
for (const t of ["terms_versions", "terms_acceptances"]) {
  const { error } = await sb.from(t).select("id").limit(1);
  if (error && /does not exist|schema cache|could not find|relation/i.test(error.message)) missing.push(t);
  else if (error) { console.log(`ERROR probing ${t}: ${error.message}`); process.exit(2); }
}
// tenants.onboarding column presence
{
  const { error } = await sb.from("tenants").select("onboarding,onboarding_completed_at").limit(1);
  if (error && /column|does not exist|schema cache/i.test(error.message)) missing.push("tenants.onboarding");
}
if (missing.length) {
  console.log(`MIGRATION 0007 NOT APPLIED — missing: ${missing.join(", ")}`);
  console.log("Paste supabase/migrations/0007_terms_and_onboarding.sql into the Supabase SQL editor, then re-run.");
  process.exit(3);
}

console.log("terms_versions + terms_acceptances + tenants.onboarding exist. Round-trip…");
let tenantId, userId, termsVersion;
const fail = (m) => console.log("FAIL: " + m);
try {
  // A throwaway tenant + a synthetic auth user for the acceptance FK.
  const { data: tenant, error: te } = await sb.from("tenants")
    .insert({ name: "TermsVerify T", kind: "agency", plan: "starter", status: "suspended" })
    .select("id").single();
  if (te) throw new Error("create tenant: " + te.message);
  tenantId = tenant.id;

  // Set the tenant's onboarding jsonb + completed_at.
  const onboarding = { companyName: "Verify Co", contactName: "V", contactEmail: "v@x.dev" };
  const { data: upd, error: ue } = await sb.from("tenants")
    .update({ onboarding, onboarding_completed_at: new Date().toISOString() })
    .eq("id", tenantId).select("onboarding,onboarding_completed_at").single();
  if (ue) throw new Error("update tenant onboarding: " + ue.message);

  // Publish a terms version (pick a version number above any existing).
  const { data: rows } = await sb.from("terms_versions").select("version").order("version", { ascending: false }).limit(1);
  termsVersion = (rows && rows[0] ? Number(rows[0].version) : 0) + 1;
  const { data: tv, error: pe } = await sb.from("terms_versions")
    .insert({ version: termsVersion, title: "Verify Terms", body: "verify body", summary: "verify", effective_date: "2026-08-01", active: false, published_by: "system:verify" })
    .select("*").single();
  if (pe) throw new Error("publish terms: " + pe.message);

  // Record an acceptance (needs a real auth user for the FK — create one).
  const { data: au, error: ae } = await sb.auth.admin.createUser({ email: `terms-verify-${tenantId}@x.dev`, email_confirm: true });
  if (ae) throw new Error("create auth user: " + ae.message);
  userId = au.user.id;
  // app_users row (acceptance FK references app_users). A Supabase project may
  // auto-create it via an on-auth-insert trigger — upsert so we don't clash, and
  // error-check so a real failure surfaces instead of a downstream FK violation.
  const { error: aue } = await sb.from("app_users")
    .upsert({ id: userId, email: au.user.email, name: "Verify", active: true }, { onConflict: "id" });
  if (aue) throw new Error("create app_user: " + aue.message);
  const { data: acc, error: ce } = await sb.from("terms_acceptances")
    .insert({ user_id: userId, tenant_id: tenantId, version: termsVersion })
    .select("*").single();
  if (ce) throw new Error("record acceptance: " + ce.message);

  let ok = true;
  if (upd.onboarding?.companyName !== "Verify Co") { ok = false; fail(`onboarding jsonb: ${JSON.stringify(upd.onboarding)}`); }
  if (!upd.onboarding_completed_at) { ok = false; fail("onboarding_completed_at not set"); }
  if (acc.version !== termsVersion) { ok = false; fail(`acceptance version: ${acc.version}`); }
  console.log(ok
    ? "ROUND-TRIP OK — tenant onboarding jsonb + completed_at, terms version published, acceptance recorded."
    : "ROUND-TRIP had failures (see above).");
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  fail(e.message);
  process.exitCode = 1;
} finally {
  if (tenantId) await sb.from("tenants").delete().eq("id", tenantId).then(() => {}, () => {});
  if (termsVersion) await sb.from("terms_versions").delete().eq("version", termsVersion).then(() => {}, () => {});
  if (userId) await sb.auth.admin.deleteUser(userId).then(() => {}, () => {});
  console.log("Cleanup done (throwaway tenant + terms row + auth user removed).");
}
