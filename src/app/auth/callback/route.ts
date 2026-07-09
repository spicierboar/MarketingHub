// Supabase Auth callback — exchanges the magic-link / OAuth code for a session,
// then lands the user in the app. Only meaningful when Supabase is configured;
// otherwise it simply returns to /login (the demo never reaches here).

import { NextResponse } from "next/server";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/db/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (isSupabaseConfigured() && code) {
    const sb = await getServerSupabase();
    if (sb) {
      const { error } = await sb.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, url.origin));
      }
    }
  }
  return NextResponse.redirect(new URL("/login?error=auth", url.origin));
}
