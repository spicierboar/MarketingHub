"use client";

import { useActionState, useState } from "react";
import { signIn } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createBrowserSupabase,
  isSupabaseConfiguredClient,
} from "@/lib/db/supabase-browser";

export function LoginForm() {
  const supabaseMode = isSupabaseConfiguredClient();
  const [demoState, demoAction, demoPending] = useActionState(signIn, null);
  const [clientPending, setClientPending] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [clientMessage, setClientMessage] = useState<string | null>(null);

  async function onSupabaseSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email");
    const trimmed = String(email || "").trim();
    if (!trimmed) {
      setClientError("Enter your email address.");
      return;
    }

    const sb = createBrowserSupabase();
    if (!sb) {
      setClientError("Auth is not available right now.");
      return;
    }

    setClientPending(true);
    setClientError(null);
    setClientMessage(null);

    // PKCE: code verifier is stored in a cookie on this origin. emailRedirectTo
    // must match window.location.origin so /auth/callback can exchange the code.
    const { error } = await sb.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setClientPending(false);
    if (error) setClientError(error.message);
    else setClientMessage("Check your email for a secure sign-in link.");
  }

  const pending = supabaseMode ? clientPending : demoPending;
  const error = supabaseMode ? clientError : demoState?.error;
  const message = supabaseMode ? clientMessage : demoState?.message;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Passwordless access — you&apos;ll never be issued a password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={supabaseMode ? undefined : demoAction}
          onSubmit={supabaseMode ? onSupabaseSubmit : undefined}
          className="space-y-4"
        >
          <Field label="Work email" htmlFor="email">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
            />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-700">{message}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Signing in…" : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
