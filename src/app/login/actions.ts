"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getUserByEmail } from "@/lib/db";
import { startSession, endSession } from "@/lib/auth/session";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { logAction } from "@/lib/audit";

// Passwordless sign-in.
//   • Demo: verify the email exists against an individual account, start a
//     cookie session. No password is ever handled.
//   • Production (Supabase configured): send a magic link via Supabase Auth.
//     OAuth SSO + passkeys are separate entry points (below / Supabase-hosted).
export async function signIn(_prev: unknown, formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  if (!email) return { error: "Enter your email address." };

  // Production path — Supabase magic link.
  if (isSupabaseConfigured()) {
    const sb = await getServerSupabase();
    if (!sb) return { error: "Auth is not available right now." };
    const origin = (await headers()).get("origin") ?? "";
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) return { error: error.message };
    return { message: "Check your email for a secure sign-in link." };
  }

  // Demo path — passwordless cookie session.
  const user = await getUserByEmail(email);
  if (!user) {
    // Failed-login monitoring (§10). Actor is unknown; record the attempt.
    await logAction(
      { id: "anon", email },
      "user.login_failed",
      { detail: "No account for that email" },
    );
    return { error: "No account found for that email. Ask an admin to add you." };
  }
  if (!user.active) {
    await logAction(user, "user.login_failed", { detail: "Account deactivated" });
    return { error: "This account has been deactivated." };
  }

  await startSession(user.id);
  await logAction(user, "user.login", { detail: "Passwordless sign-in" });
  redirect("/dashboard");
}

// OAuth SSO (Google / Microsoft) — production only. Redirects to the provider's
// consent screen; Supabase returns to /auth/callback.
export async function signInWithOAuth(provider: "google" | "azure") {
  if (!isSupabaseConfigured()) return;
  const sb = await getServerSupabase();
  if (!sb) return;
  const origin = (await headers()).get("origin") ?? "";
  const { data } = await sb.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (data?.url) redirect(data.url);
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
