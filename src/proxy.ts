// Auth session refresh proxy (production, Supabase). Next 16 "proxy" convention
// (formerly "middleware").
//
// @supabase/ssr keeps the auth session in cookies; those tokens must be
// refreshed on each request or a signed-in user is silently logged out when the
// access token expires. This refreshes them — but ONLY when Supabase is
// configured. In the demo (no NEXT_PUBLIC_SUPABASE_URL) it is a pure
// pass-through, so the passwordless cookie session is untouched.

import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Demo / unconfigured — do nothing.
  if (!url || !anon) return NextResponse.next();

  // Configured — refresh the Supabase session and propagate cookies.
  const response = NextResponse.next({ request });
  const { createServerClient } = await import("@supabase/ssr");
  const supabase = createServerClient(url, anon, {
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
  });
  // Touch the user to trigger a token refresh when needed.
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Run on app routes; skip static assets, images and the auth callback.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
