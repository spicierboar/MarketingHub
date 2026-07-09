// Live Supabase verification for per-tenant schedule timezone (migration 0013).
//   node scripts/verify-timezone-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { error: probe } = await sb.from("tenants").select("timezone").limit(1);
if (probe && /column.*timezone|does not exist|schema cache/i.test(probe.message)) {
  console.log("MIGRATION NOT APPLIED — tenants.timezone is missing.");
  console.log("Paste supabase/migrations/0013_tenant_timezone.sql into the Supabase SQL editor, then re-run.");
  process.exit(3);
} else if (probe) {
  console.log(`ERROR probing tenants.timezone: ${probe.message}`);
  process.exit(2);
}

console.log("tenants.timezone exists. Running a service-role round-trip…");
let tenantId;
try {
  const { data: tenant, error: te } = await sb
    .from("tenants")
    .insert({
      name: "TimezoneVerify T",
      kind: "agency",
      plan: "agency",
      status: "suspended",
      timezone: "Australia/Sydney",
    })
    .select("id, timezone")
    .single();
  if (te) throw new Error("create tenant: " + te.message);
  tenantId = tenant.id;
  if (tenant.timezone !== "Australia/Sydney") throw new Error("timezone not persisted on insert");

  const { data: updated, error: ue } = await sb
    .from("tenants")
    .update({ timezone: "Australia/Perth" })
    .eq("id", tenantId)
    .select("timezone")
    .single();
  if (ue) throw new Error("update timezone: " + ue.message);
  if (updated.timezone !== "Australia/Perth") throw new Error("timezone not updated");

  const { error: ce } = await sb.from("tenants").update({ timezone: null }).eq("id", tenantId);
  if (ce) throw new Error("clear timezone: " + ce.message);

  console.log("OK — insert, update, and clear timezone on tenants.");
} catch (e) {
  console.log("FAIL: " + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
} finally {
  if (tenantId) {
    const { error: de } = await sb.from("tenants").delete().eq("id", tenantId);
    if (de) console.log("WARN: teardown delete failed: " + de.message);
  }
}
