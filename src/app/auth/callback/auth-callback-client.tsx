"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/db/supabase-browser";

// PKCE code exchange must run in the browser — the code verifier lives in
// document.cookie from signInWithOtp, which the server route cannot read.
export function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const type = searchParams.get("type");
    const nextParam = searchParams.get("next") ?? "/auth/complete";
    const next = nextParam.startsWith("/") ? nextParam : "/auth/complete";

    const sb = createBrowserSupabase();
    if (!sb) {
      router.replace("/login?error=auth");
      return;
    }

    void (async () => {
      if (code) {
        const { error } = await sb.auth.exchangeCodeForSession(code);
        if (error) {
          router.replace("/login?error=auth");
          return;
        }
      } else if (tokenHash && type) {
        const { error } = await sb.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });
        if (error) {
          router.replace("/login?error=auth");
          return;
        }
      } else {
        router.replace("/login?error=auth");
        return;
      }

      router.replace(next);
    })();
  }, [router, searchParams]);

  return (
    <p className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      Signing you in…
    </p>
  );
}
