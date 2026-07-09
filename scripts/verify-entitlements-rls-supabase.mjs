// Live RLS leak-test for company_entitlements (migration 0008) — the isolation
// half the service-role round-trip (verify-entitlements-supabase.mjs) can't cover.
//
// It provisions two throwaway tenants, each with an OWNER auth user (password so
// we can sign in), an app_users row, a tenant_members owner row, a company and a
// seeded active entitlement. Then, using the ANON key signed in AS each owner (so
// Postgres RLS is enforced with a real auth.uid()), it asserts the
// company_entitlements_rw policy (has_company_access) isolates tenants:
//   own-tenant read/write ALLOWED · cross-tenant read → 0 rows · cross-tenant
//   write → refused (42501). Then it purges everything (tenant cascade + auth
//   users) so the DB is left pristine.
// Reads keys from .env.local. Run from the project root:
//   node scripts/verify-entitlements-rls-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const svc = createClient(SUPA_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Presence check (fail honest if 0008 not applied).
{
  const { error } = await svc.from("company_entitlements").select("company_id").limit(1);
  if (error && /does not exist|schema cache|could not find|relation/i.test(error.message)) {
    console.log("MIGRATION 0008 NOT APPLIED — company_entitlements is missing. Paste supabase/migrations/0008_company_addons.sql, then re-run.");
    process.exit(3);
  } else if (error) { console.log(`ERROR probing company_entitlements: ${error.message}`); process.exit(2); }
}

const PW = "Verify-Rls-0008!" + Math.floor(Number(process.env.SEED ?? "424242"));
const checks = [];
const ok = (name, pass, detail) => { checks.push({ name, pass, detail }); };
const created = { tenants: [], users: [] };

// Provision one tenant + owner + company + seeded entitlement (service role).
async function provision(tag) {
  const { data: t, error: te } = await svc.from("tenants")
    .insert({ name: `RLS-${tag}`, kind: "agency", plan: "agency", status: "suspended" })
    .select("id").single();
  if (te) throw new Error(`create tenant ${tag}: ${te.message}`);
  created.tenants.push(t.id);
  const email = `rls-${tag}-${t.id}@selftest.dev`;
  const { data: au, error: ae } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (ae) throw new Error(`create auth user ${tag}: ${ae.message}`);
  created.users.push(au.user.id);
  // app_users row (active) — has NO role column; role lives on tenant_members.
  const { error: ue } = await svc.from("app_users")
    .upsert({ id: au.user.id, email, name: `Owner ${tag}`, active: true }, { onConflict: "id" });
  if (ue) throw new Error(`app_user ${tag}: ${ue.message}`);
  const { error: me } = await svc.from("tenant_members")
    .insert({ tenant_id: t.id, user_id: au.user.id, role: "owner" });
  if (me) throw new Error(`tenant_member ${tag}: ${me.message}`);
  const { data: c, error: ce } = await svc.from("companies")
    .insert({ tenant_id: t.id, name: `Co ${tag}`, created_by: "system:verify" })
    .select("id").single();
  if (ce) throw new Error(`company ${tag}: ${ce.message}`);
  const { data: ent, error: ee } = await svc.from("company_entitlements")
    .insert({ company_id: c.id, addon_id: "menus", status: "active", enabled_by: "system:verify" })
    .select("*").single();
  if (ee) throw new Error(`seed entitlement ${tag}: ${ee.message}`);
  return { tenantId: t.id, userId: au.user.id, email, companyId: c.id, entId: ent.id };
}

let A, B;
try {
  A = await provision("A");
  B = await provision("B");

  // Sign in as each owner via the ANON key → RLS-enforced clients.
  const mkUser = async (email) => {
    const cl = createClient(SUPA_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await cl.auth.signInWithPassword({ email, password: PW });
    if (error) throw new Error(`sign in ${email}: ${error.message}`);
    if (!data.session) throw new Error(`no session for ${email}`);
    return cl;
  };
  const uA = await mkUser(A.email);
  const uB = await mkUser(B.email);

  // 1) Owner A reads OWN entitlement (RLS allows).
  {
    const { data, error } = await uA.from("company_entitlements").select("*").eq("company_id", A.companyId);
    ok("A reads own entitlement", !error && (data?.length ?? 0) >= 1, error ? `err=${error.message}` : `rows=${data?.length}`);
  }
  // 2) Owner A cannot SEE tenant B's entitlement by company (RLS filters → 0 rows).
  {
    const { data, error } = await uA.from("company_entitlements").select("*").eq("company_id", B.companyId);
    ok("A cannot read B's entitlement (by company)", !error && (data?.length ?? 0) === 0, error ? `err=${error.message}` : `rows=${data?.length} (must be 0)`);
  }
  // 3) Owner A cannot SEE tenant B's entitlement by its exact id either.
  {
    const { data, error } = await uA.from("company_entitlements").select("*").eq("id", B.entId);
    ok("A cannot read B's entitlement (by id)", !error && (data?.length ?? 0) === 0, error ? `err=${error.message}` : `rows=${data?.length} (must be 0)`);
  }
  // 4) Owner A can WRITE (upsert) an entitlement for its OWN company (RLS allows).
  {
    const { error } = await uA.from("company_entitlements")
      .upsert({ company_id: A.companyId, addon_id: "video", status: "active", enabled_by: A.userId }, { onConflict: "company_id,addon_id" });
    ok("A writes own entitlement", !error, error ? `err=${error.message}` : "insert ok");
  }
  // 5) Owner A CANNOT insert an entitlement for tenant B's company (RLS with-check → 42501).
  {
    const { error } = await uA.from("company_entitlements")
      .insert({ company_id: B.companyId, addon_id: "photo", status: "active", enabled_by: A.userId });
    ok("A cannot write B's entitlement (insert refused)", !!error, error ? `blocked: ${error.code ?? error.message}` : "NOT BLOCKED — LEAK");
  }
  // 6) Owner A UPDATE of B's entitlement affects 0 rows (RLS filters the target away).
  {
    const { data, error } = await uA.from("company_entitlements")
      .update({ status: "cancelled" }).eq("id", B.entId).select("id");
    ok("A cannot update B's entitlement (0 rows)", !error && (data?.length ?? 0) === 0, error ? `blocked: ${error.code ?? error.message}` : `rows=${data?.length} (must be 0)`);
    // Confirm via service that B's row is still active (untouched).
    const { data: still } = await svc.from("company_entitlements").select("status").eq("id", B.entId).single();
    ok("B's entitlement still active after A's update attempt", still?.status === "active", `status=${still?.status}`);
  }
  // 7) Symmetric: Owner B cannot read or write A's entitlement.
  {
    const { data, error } = await uB.from("company_entitlements").select("*").eq("company_id", A.companyId);
    ok("B cannot read A's entitlement", !error && (data?.length ?? 0) === 0, error ? `err=${error.message}` : `rows=${data?.length} (must be 0)`);
    const { error: ie } = await uB.from("company_entitlements")
      .insert({ company_id: A.companyId, addon_id: "photo", status: "active", enabled_by: B.userId });
    ok("B cannot write A's entitlement (insert refused)", !!ie, ie ? `blocked: ${ie.code ?? ie.message}` : "NOT BLOCKED — LEAK");
  }

  const failed = checks.filter((c) => !c.pass);
  for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name} — ${c.detail}`);
  console.log(failed.length === 0
    ? `\nRLS OK — ${checks.length}/${checks.length} isolation checks passed on company_entitlements.`
    : `\nRLS FAILURES: ${failed.length}/${checks.length}.`);
  process.exitCode = failed.length === 0 ? 0 : 1;
} catch (e) {
  console.log("ERROR: " + e.message);
  process.exitCode = 1;
} finally {
  for (const id of created.tenants) await svc.from("tenants").delete().eq("id", id).then(() => {}, () => {});
  for (const id of created.users) await svc.auth.admin.deleteUser(id).then(() => {}, () => {});
  console.log("Cleanup: throwaway tenants purged (cascade) + auth users removed.");
}
