// Live Supabase verification for connect invites (migration 0014).
//   node scripts/verify-connect-invites-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { error: probe } = await sb.from("connect_invites").select("id").limit(1);
if (probe && /relation.*connect_invites|does not exist|schema cache/i.test(probe.message)) {
  console.log("MIGRATION NOT APPLIED — connect_invites table is missing.");
  console.log("Paste supabase/migrations/0014_connect_invites.sql into the Supabase SQL editor, then re-run.");
  process.exit(3);
} else if (probe) {
  console.log(`ERROR probing connect_invites: ${probe.message}`);
  process.exit(2);
}

console.log("connect_invites exists. Running a service-role round-trip…");
let tenantId;
let companyId;
let inviteId;
try {
  const { data: tenant, error: te } = await sb
    .from("tenants")
    .insert({ name: "ConnectInviteVerify T", kind: "agency", plan: "agency", status: "suspended" })
    .select("id")
    .single();
  if (te) throw new Error("create tenant: " + te.message);
  tenantId = tenant.id;

  const { data: company, error: ce } = await sb
    .from("companies")
    .insert({ tenant_id: tenantId, name: "Verify Co", status: "draft_onboarding" })
    .select("id")
    .single();
  if (ce) throw new Error("create company: " + ce.message);
  companyId = company.id;

  const token = randomBytes(18).toString("base64url");
  const expires = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { data: invite, error: ie } = await sb
    .from("connect_invites")
    .insert({
      tenant_id: tenantId,
      company_id: companyId,
      platform: "Facebook",
      token,
      status: "pending",
      invited_by: "verify-script",
      expires_at: expires,
    })
    .select("id, token, status")
    .single();
  if (ie) throw new Error("create invite: " + ie.message);
  inviteId = invite.id;
  if (invite.token !== token) throw new Error("token not persisted");

  const { data: byToken, error: be } = await sb
    .from("connect_invites")
    .select("id")
    .eq("token", token)
    .maybeSingle();
  if (be) throw new Error("lookup by token: " + be.message);
  if (!byToken || byToken.id !== inviteId) throw new Error("token lookup failed");

  const { error: ue } = await sb
    .from("connect_invites")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", inviteId);
  if (ue) throw new Error("update invite: " + ue.message);

  console.log("OK — connect_invites round-trip passed.");
} catch (e) {
  console.log("FAILED:", e.message || e);
  process.exit(1);
} finally {
  if (tenantId) await sb.from("tenants").delete().eq("id", tenantId);
}
process.exit(0);
