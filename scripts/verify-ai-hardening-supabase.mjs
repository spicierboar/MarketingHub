// Live Supabase verification for AI assistant hardening (migration 0015).
//   node scripts/verify-ai-hardening-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { error: probe } = await sb.from("ai_runs").select("input_tokens").limit(1);
if (probe && /column.*input_tokens|does not exist|schema cache/i.test(probe.message)) {
  console.log("MIGRATION NOT APPLIED — ai_runs.input_tokens is missing.");
  console.log("Paste supabase/migrations/0015_ai_hardening.sql into the Supabase SQL editor, then re-run.");
  process.exit(3);
} else if (probe) {
  console.log(`ERROR probing ai_runs.input_tokens: ${probe.message}`);
  process.exit(2);
}

console.log("AI hardening columns exist. Running service-role round-trip…");
let tenantId;
let companyId;
let runId;
let assetId;
try {
  const { data: tenant, error: te } = await sb
    .from("tenants")
    .insert({ name: "AiHardeningVerify T", kind: "agency", plan: "agency", status: "suspended" })
    .select("id")
    .single();
  if (te) throw new Error("create tenant: " + te.message);
  tenantId = tenant.id;

  const { data: company, error: ce } = await sb
    .from("companies")
    .insert({
      tenant_id: tenantId,
      name: "Verify Co",
      status: "draft_onboarding",
      profile: { serviceAreas: [], services: [], callsToAction: [], prohibitedClaims: [], approvedClaims: [], requiredDisclaimers: [] },
      documents: [],
    })
    .select("id")
    .single();
  if (ce) throw new Error("create company: " + ce.message);
  companyId = company.id;

  const { data: run, error: re } = await sb
    .from("ai_runs")
    .insert({
      tenant_id: tenantId,
      company_id: companyId,
      kind: "content_draft",
      model: "verify",
      prompt_summary: "test",
      output_chars: 10,
      input_tokens: 100,
      output_tokens: 50,
      context_chars: 200,
      est_cost_usd: 0.001,
    })
    .select("id, input_tokens, output_tokens")
    .single();
  if (re) throw new Error("create ai_run: " + re.message);
  runId = run.id;
  if (run.input_tokens !== 100 || run.output_tokens !== 50) throw new Error("token columns not persisted");

  const { data: asset, error: ae } = await sb
    .from("assets")
    .insert({
      company_id: companyId,
      name: "Verify asset",
      asset_type: "image",
      source: "ai_generated",
      tags: ["ai-visuals"],
      usage_rights: { owner: "test", licenceType: "owned", consentObtained: true, allowedChannels: [], restrictions: "" },
      status: "pending_approval",
      created_by: null,
      ai_model: "verify-model",
      ai_prompt: "verify prompt",
      ai_run_id: runId,
      est_cost_usd: 0.002,
      sources_used: ["Brand Brain"],
    })
    .select("ai_model, ai_run_id, est_cost_usd")
    .single();
  if (ae) throw new Error("create asset: " + ae.message);
  assetId = asset.id;
  if (asset.ai_model !== "verify-model" || asset.ai_run_id !== runId) throw new Error("asset AI columns not persisted");

  const critique = { status: "pass", notes: [], model: "rules-engine", critiquedAt: new Date().toISOString() };
  const { data: content, error: co } = await sb
    .from("content_items")
    .insert({
      company_id: companyId,
      type: "social_post",
      title: "Verify",
      body: "test",
      status: "ai_draft",
      created_by: null,
      ai_run_id: runId,
      est_cost_usd: 0.001,
      ai_critique: critique,
    })
    .select("ai_run_id, ai_critique")
    .single();
  if (co) throw new Error("create content: " + co.message);
  if (content.ai_run_id !== runId || content.ai_critique?.status !== "pass") {
    throw new Error("content AI columns not persisted");
  }

  console.log("OK — ai_runs tokens, asset AI provenance, content critique round-trip.");
} catch (e) {
  console.log("FAIL: " + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
} finally {
  if (assetId) await sb.from("assets").delete().eq("id", assetId);
  if (runId) {
    await sb.from("content_items").delete().eq("ai_run_id", runId);
    await sb.from("ai_runs").delete().eq("id", runId);
  }
  if (companyId) await sb.from("companies").delete().eq("id", companyId);
  if (tenantId) await sb.from("tenants").delete().eq("id", tenantId);
}
