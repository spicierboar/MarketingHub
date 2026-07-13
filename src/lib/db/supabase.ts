// Supabase client factory (production data + auth path).
//
// EVERYTHING here is env-gated: with no NEXT_PUBLIC_SUPABASE_URL set the app
// keeps running on the in-memory store (src/lib/db/store.ts) and the demo needs
// zero external accounts. When the three Supabase env vars are present, these
// clients back the production adapter (src/lib/db/supabase-adapter.ts) and
// Supabase Auth (src/lib/auth/session.ts).

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { localDemoEnabled } from "@/lib/env";

export function isSupabaseConfigured(): boolean {
  // Local demo bypass: force in-memory store + cookie auth despite Supabase env.
  if (localDemoEnabled()) return false;
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

// Request-scoped client bound to the caller's auth cookies. RLS applies as the
// signed-in user — this is the client the adapter uses for user-facing reads
// and writes so Postgres Row-Level Security is enforced, not just app-layer RBAC.
export async function getServerSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null;
  // Imported lazily so the module never touches next/headers at build time
  // when Supabase isn't configured.
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return jar.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              jar.set(name, value, options);
            }
          } catch (err) {
            // next/headers throws this from Server Components (read-only).
            // In Server Actions / Route Handlers cookie writes must surface.
            const msg = err instanceof Error ? err.message : String(err);
            if (/Cookies can only be modified/i.test(msg)) return;
            throw err;
          }
        },
      },
    },
  );
}

// Service-role client — BYPASSES RLS. Use ONLY for trusted server-side work
// that must see across companies (e.g. the automation cron, audit inserts).
// Never expose the service-role key to the browser. Memoised — it's called on
// hot paths (media serving, storage-mode checks, webhooks) and constructing a
// fresh client per call is wasted allocation.
let serviceClient: SupabaseClient | null | undefined;
export function getServiceSupabase(): SupabaseClient | null {
  if (serviceClient !== undefined) return serviceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  serviceClient =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  return serviceClient;
}
