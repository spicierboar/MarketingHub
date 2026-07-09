// Supabase Auth callback — exchanges the magic-link / OAuth code for a session,
// then lands the user in the app. Only meaningful when Supabase is configured;
// otherwise it simply returns to /login (the demo never reaches here).
//
// Session cookies MUST be written onto the redirect response (request/response
// cookie bridge). Using next/headers cookies() alone drops the PKCE verifier /
// session on redirect and yields /login?error=auth in production.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/db/supabase";

function supabaseOnResponse(request: NextRequest, redirectTo: URL) {
  const response = NextResponse.redirect(redirectTo);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );
  return { supabase, response };
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const nextParam = url.searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") ? nextParam : "/dashboard";
  const loginError = () =>
    NextResponse.redirect(new URL("/login?error=auth", url.origin));

  if (!isSupabaseConfigured()) return loginError();

  const redirectTo = new URL(next, url.origin);
  const { supabase, response } = supabaseOnResponse(request, redirectTo);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return loginError();
    return response;
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) return loginError();
    return response;
  }

  return loginError();
}
