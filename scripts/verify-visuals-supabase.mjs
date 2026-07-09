// Live Supabase verification for Phase 4 photo shoots (migration 0009).
// Round-trips a photo_shoots row under a throwaway tenant via service role.
//   node scripts/verify-visuals-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { error: probe } = await sb.from("photo_shoots").select("company_id").limit(1);
if (probe && /does not exist|schema cache|could not find|relation/i.test(probe.message)) {
  console.log("MIGRATION NOT APPLIED — photo_shoots is missing.");
  console.log("Paste supabase/migrations/0009_photo_shoots.sql into the Supabase SQL editor, then re-run.");
  process.exit(3);
} else if (probe) {
  console.log(`ERROR probing photo_shoots: ${probe.message}`);
  process.exit(2);
}

console.log("photo_shoots exists. Running a service-role round-trip…");
let tenantId;
const fail = (m) => { console.log("FAIL: " + m); };
try {
  const { data: tenant, error: te } = await sb.from("tenants")
    .insert({ name: "VisualsVerify T", kind: "agency", plan: "agency", status: "suspended" })
    .select("id").single();
  if (te) throw new Error("create tenant: " + te.message);
  tenantId = tenant.id;
  const { data: company, error: ce } = await sb.from("companies")
    .insert({ tenant_id: tenantId, name: "VisualsVerify Co", created_by: "system:verify" })
    .select("id").single();
  if (ce) throw new Error("create company: " + ce.message);
  const companyId = company.id;

  let ok = true;
  const { data: shoot, error: se } = await sb.from("photo_shoots")
    .insert({
      company_id: companyId,
      brief: "Verify round-trip brief",
      status: "requested",
      deliverable_asset_ids: [],
      target_channels: ["instagram"],
      created_by: "system:verify",
    })
    .select("*").single();
  if (se) throw new Error("insert shoot: " + se.message);
  if (shoot.status !== "requested") { ok = false; fail(`status=${shoot.status}`); }
  if (!Array.isArray(shoot.deliverable_asset_ids)) { ok = false; fail("deliverable_asset_ids not array"); }

  const sched = new Date().toISOString();
  const { data: updated, error: ue } = await sb.from("photo_shoots")
    .update({ status: "scheduled", scheduled_at: sched, updated_at: sched })
    .eq("id", shoot.id).select("*").single();
  if (ue) throw new Error("update shoot: " + ue.message);
  if (updated.status !== "scheduled") { ok = false; fail(`scheduled status=${updated.status}`); }

  await sb.from("tenants").delete().eq("id", tenantId);
  if (ok) {
    console.log("OK — photo_shoots round-trip passed; DB left pristine.");
    process.exit(0);
  }
  process.exit(1);
} catch (err) {
  if (tenantId) await sb.from("tenants").delete().eq("id", tenantId).catch(() => {});
  console.log("FAIL: " + err.message);
  process.exit(1);
}
