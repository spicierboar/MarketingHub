// Live Supabase verification for Phase 6 Order Now (migration 0011).
// Round-trips menu items, settings, and an order under a throwaway tenant.
//   node scripts/verify-ordering-supabase.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const tables = ["order_menu_items", "ordering_settings", "restaurant_orders"];
for (const t of tables) {
  const { error } = await sb.from(t).select("company_id").limit(1);
  if (error && /does not exist|schema cache|could not find|relation/i.test(error.message)) {
    console.log(`MIGRATION NOT APPLIED — ${t} is missing.`);
    console.log("Paste supabase/migrations/0011_ordering.sql into the Supabase SQL editor, then re-run.");
    process.exit(3);
  } else if (error) {
    console.log(`ERROR probing ${t}: ${error.message}`);
    process.exit(2);
  }
}

console.log("ordering tables exist. Running a service-role round-trip…");
let tenantId;
const fail = (m) => { console.log("FAIL: " + m); };
try {
  const { data: tenant, error: te } = await sb.from("tenants")
    .insert({ name: "OrderingVerify T", kind: "agency", plan: "agency", status: "suspended" })
    .select("id").single();
  if (te) throw new Error("create tenant: " + te.message);
  tenantId = tenant.id;
  const { data: company, error: ce } = await sb.from("companies")
    .insert({ tenant_id: tenantId, name: "OrderingVerify Co", created_by: "system:verify" })
    .select("id").single();
  if (ce) throw new Error("create company: " + ce.message);
  const companyId = company.id;

  let ok = true;
  const { data: item, error: ie } = await sb.from("order_menu_items")
    .insert({
      company_id: companyId,
      name: "Verify latte",
      price_cents: 500,
      category: "Coffee",
      available: true,
      sort_order: 1,
    })
    .select("*").single();
  if (ie) throw new Error("insert item: " + ie.message);

  const { error: se } = await sb.from("ordering_settings")
    .upsert({
      company_id: companyId,
      pickup_enabled: true,
      delivery_enabled: false,
      min_order_cents: 0,
      button_label: "Order Now",
      connect_status: "active",
    }, { onConflict: "company_id" });
  if (se) throw new Error("upsert settings: " + se.message);

  const { data: order, error: oe } = await sb.from("restaurant_orders")
    .insert({
      company_id: companyId,
      status: "paid",
      fulfillment: "pickup",
      customer_name: "Verify Guest",
      customer_email: "verify@example.com",
      lines: [{ menuItemId: item.id, name: "Verify latte", priceCents: 500, quantity: 1 }],
      subtotal_cents: 500,
      total_cents: 500,
      payment_status: "simulated",
    })
    .select("*").single();
  if (oe) throw new Error("insert order: " + oe.message);
  if (order.status !== "paid") { ok = false; fail(`order status=${order.status}`); }

  await sb.from("tenants").delete().eq("id", tenantId);
  if (ok) {
    console.log("OK — ordering round-trip passed; DB left pristine.");
    process.exit(0);
  }
  process.exit(1);
} catch (err) {
  if (tenantId) await sb.from("tenants").delete().eq("id", tenantId).catch(() => {});
  console.log("FAIL: " + err.message);
  process.exit(1);
}
