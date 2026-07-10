// Browser Supabase client — magic-link / OAuth PKCE must start in the browser so
// the code-verifier cookie is present when /auth/callback exchanges the code.

import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createBrowserClient(url, anon);
}

export function isSupabaseConfiguredClient(): boolean {
  // Mirror server local-demo bypass so the login form uses cookie auth.
  const demo = (process.env.NEXT_PUBLIC_CC_LOCAL_DEMO || "").trim().toLowerCase();
  if (demo === "true" || demo === "1") return false;
  return (
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
