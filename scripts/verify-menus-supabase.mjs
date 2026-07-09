// Live Supabase verification for Phase 5 menu designs (migration 0010).
// Round-trips a menu_designs row under a throwaway tenant via service role.
//   node scripts/verify-menus-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { error: probe } = await sb.from("menu_designs").select("company_id").limit(1);
if (probe && /does not exist|schema cache|could not find|relation/i.test(probe.message)) {
  console.log("MIGRATION NOT APPLIED — menu_designs is missing.");
  console.log("Paste supabase/migrations/0010_menu_designs.sql into the Supabase SQL editor, then re-run.");
  process.exit(3);
} else if (probe) {
  console.log(`ERROR probing menu_designs: ${probe.message}`);
  process.exit(2);
}

console.log("menu_designs exists. Running a service-role round-trip…");
let tenantId;
const fail = (m) => { console.log("FAIL: " + m); };
try {
  const year = new Date().getFullYear();
  const { data: tenant, error: te } = await sb.from("tenants")
    .insert({ name: "MenusVerify T", kind: "agency", plan: "agency", status: "suspended" })
    .select("id").single();
  if (te) throw new Error("create tenant: " + te.message);
  tenantId = tenant.id;
  const { data: company, error: ce } = await sb.from("companies")
    .insert({ tenant_id: tenantId, name: "MenusVerify Co", created_by: "system:verify" })
    .select("id").single();
  if (ce) throw new Error("create company: " + ce.message);
  const companyId = company.id;

  let ok = true;
  const { data: design, error: de } = await sb.from("menu_designs")
    .insert({
      company_id: companyId,
      title: "Verify lunch menu",
      brief: "Round-trip verification brief",
      format: "both",
      status: "requested",
      billing_class: "included",
      quota_year: year,
      deliverable_asset_ids: [],
      created_by: "system:verify",
    })
    .select("*").single();
  if (de) throw new Error("insert design: " + de.message);
  if (design.status !== "requested") { ok = false; fail(`status=${design.status}`); }
  if (design.billing_class !== "included") { ok = false; fail(`billing_class=${design.billing_class}`); }
  if (design.quota_year !== year) { ok = false; fail(`quota_year=${design.quota_year}`); }

  const { data: updated, error: ue } = await sb.from("menu_designs")
    .update({ status: "in_design", updated_at: new Date().toISOString() })
    .eq("id", design.id).select("*").single();
  if (ue) throw new Error("update design: " + ue.message);
  if (updated.status !== "in_design") { ok = false; fail(`in_design status=${updated.status}`); }

  await sb.from("tenants").delete().eq("id", tenantId);
  if (ok) {
    console.log("OK — menu_designs round-trip passed; DB left pristine.");
    process.exit(0);
  }
  process.exit(1);
} catch (err) {
  if (tenantId) await sb.from("tenants").delete().eq("id", tenantId).catch(() => {});
  console.log("FAIL: " + err.message);
  process.exit(1);
}
