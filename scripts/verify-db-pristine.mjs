// Post-fixture pristine check: counts rows in the tables the self-test
// fixtures touch and flags any leftover throwaway data (SelfTest/QueueTest
// tenants). Reads keys from .env.local; run from the project root:
//   node scripts/verify-db-pristine.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const tables = [
  "tenants",
  "companies",
  "content_items",
  "scheduled_posts",
  "publish_logs",
  "publishing_integrations",
  "audit_logs",
];
let bad = false;
for (const t of tables) {
  const { count, error } = await sb.from(t).select("id", { count: "exact", head: true });
  console.log(`${t}: ${error ? "ERR " + error.message : count}`);
}
const { data: leftovers } = await sb
  .from("tenants")
  .select("id,name")
  .or("name.ilike.%SelfTest%,name.ilike.%QueueTest%");
if (leftovers && leftovers.length > 0) {
  bad = true;
  console.log("LEFTOVER FIXTURE TENANTS:", JSON.stringify(leftovers));
} else {
  console.log("No leftover fixture tenants — purge clean.");
}
process.exit(bad ? 1 : 0);
