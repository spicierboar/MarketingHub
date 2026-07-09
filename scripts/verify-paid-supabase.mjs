// Live Supabase verification for Module 6 (paid advertising).
//   • Checks whether migration 0005's tables exist.
//   • If present: round-trips an ad account + budget + campaign + lead under a
//     throwaway tenant/company via the service client, asserts the numeric
//     mapper coercion works, then cleans up (cascade on tenant delete).
//   • If absent: reports that 0005 must be applied (owner-paste), so the run is
//     honest rather than silently green.
// Reads keys from .env.local. Run from the project root:
//   node scripts/verify-paid-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const TABLES = ["ad_accounts", "ad_budgets", "ad_campaigns", "leads", "audience_segments"];
const missing = [];
for (const t of TABLES) {
  // A real row select reliably errors on a missing relation (a head/count probe
  // can return an empty result without surfacing the schema-cache miss).
  const { error } = await sb.from(t).select("company_id").limit(1);
  if (error && /does not exist|schema cache|could not find|relation/i.test(error.message)) missing.push(t);
  else if (error) { console.log(`ERROR probing ${t}: ${error.message}`); process.exit(2); }
}
if (missing.length) {
  const needs0006 = missing.includes("audience_segments");
  const needs0005 = missing.some((t) => t !== "audience_segments");
  console.log(`MIGRATION NOT APPLIED — missing tables: ${missing.join(", ")}`);
  if (needs0005) console.log("Paste supabase/migrations/0005_paid_advertising.sql into the Supabase SQL editor.");
  if (needs0006) console.log("Paste supabase/migrations/0006_ad_audience_targeting.sql into the Supabase SQL editor.");
  console.log("Then re-run this script.");
  process.exit(3);
}

console.log(`All ${TABLES.length} tables exist. Running a service-role round-trip…`);
let tenantId, companyId;
const fail = (m) => { console.log("FAIL: " + m); };
try {
  const { data: tenant, error: te } = await sb.from("tenants")
    .insert({ name: "PaidVerify T", kind: "agency", plan: "agency", status: "suspended" })
    .select("id").single();
  if (te) throw new Error("create tenant: " + te.message);
  tenantId = tenant.id;
  const { data: company, error: ce } = await sb.from("companies")
    .insert({ tenant_id: tenantId, name: "PaidVerify Co", created_by: "system:verify" })
    .select("id").single();
  if (ce) throw new Error("create company: " + ce.message);
  companyId = company.id;

  const { data: acct, error: ae } = await sb.from("ad_accounts").insert({
    company_id: companyId, platform: "meta_ads", account_name: "Verify Meta",
    external_account_id: "act_verify_1", encrypted_token: "enc", token_last_four: "abcd",
    status: "connected", connected_by: "system:verify",
  }).select("*").single();
  if (ae) throw new Error("create ad_account: " + ae.message);

  const { data: budget, error: be } = await sb.from("ad_budgets").upsert({
    company_id: companyId, monthly_budget_usd: 1500, allocation: { meta_ads: 0.6, google_ads: 0.4 },
    fee_model: "percent_of_spend", fee_percent: 0.15, fee_flat_usd: 0, updated_by: "system:verify",
  }, { onConflict: "company_id" }).select("*").single();
  if (be) throw new Error("upsert ad_budget: " + be.message);

  const { data: camp, error: cae } = await sb.from("ad_campaigns").insert({
    company_id: companyId, ad_account_id: acct.id, platform: "meta_ads", name: "Verify Camp",
    objective: "leads", daily_budget_usd: 30, status: "active", start_date: "2026-06-15",
    created_by: "system:verify",
  }).select("*").single();
  if (cae) throw new Error("create ad_campaign: " + cae.message);

  const { data: lead, error: le } = await sb.from("leads").insert({
    company_id: companyId, platform: "meta_ads", ad_campaign_id: camp.id, contact: "Verify Lead",
    source: "meta_lead_ad", value_usd: 32, status: "qualified",
  }).select("*").single();
  if (le) throw new Error("create lead: " + le.message);

  // Audience targeting (0006): round-trip a segment (targeting jsonb) and attach
  // it to the campaign (ad_campaigns.audience_segment_id).
  const targeting = {
    locations: [{ kind: "radius", value: "Bondi NSW", radiusKm: 10 }],
    ageMin: 18, ageMax: 54, gender: "all", languages: ["English"],
    interests: ["coffee"], customAudiences: [], exclusions: [], devices: "mobile", placements: [],
  };
  const { data: seg, error: se } = await sb.from("audience_segments").insert({
    company_id: companyId, name: "Verify Audience", platform: "all",
    targeting, created_by: "system:verify",
  }).select("*").single();
  if (se) throw new Error("create audience_segment: " + se.message);
  const { error: ue } = await sb.from("ad_campaigns").update({ audience_segment_id: seg.id }).eq("id", camp.id);
  if (ue) throw new Error("attach audience to campaign: " + ue.message);

  // Assert numeric columns come back coercible to real numbers (mapper contract).
  const checks = [
    ["monthly_budget_usd", budget.monthly_budget_usd, 1500],
    ["fee_percent", budget.fee_percent, 0.15],
    ["daily_budget_usd", camp.daily_budget_usd, 30],
    ["value_usd", lead.value_usd, 32],
  ];
  let ok = true;
  for (const [name, raw, want] of checks) {
    const n = Number(raw);
    const good = Number.isFinite(n) && Math.abs(n - want) < 1e-6;
    if (!good) { ok = false; fail(`${name}: got ${JSON.stringify(raw)} want ${want}`); }
  }
  // allocation jsonb round-trips verbatim (platform keys preserved)
  if (budget.allocation?.meta_ads !== 0.6 || budget.allocation?.google_ads !== 0.4) {
    ok = false; fail(`allocation jsonb: ${JSON.stringify(budget.allocation)}`);
  }
  // targeting jsonb round-trips verbatim (nested location + device preserved)
  if (seg.targeting?.locations?.[0]?.radiusKm !== 10 || seg.targeting?.devices !== "mobile") {
    ok = false; fail(`targeting jsonb: ${JSON.stringify(seg.targeting)}`);
  }
  console.log(ok
    ? "ROUND-TRIP OK — ad account + budget + campaign + lead + audience segment inserted; numeric coercion + allocation jsonb + targeting jsonb correct; campaign↔audience link OK."
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
