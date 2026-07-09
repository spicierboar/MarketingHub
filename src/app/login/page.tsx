"use client";

import { useActionState } from "react";
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

// Two demo tenants prove multi-tenant isolation: a business group and a
// marketing agency. Sign in to one and you can never see the other.
const DEMO_TENANTS: { tenant: string; accounts: { email: string; role: string }[] }[] = [
  {
    tenant: "Wattle Group (business group)",
    accounts: [
      { email: "admin@wattlegroup.dev", role: "Owner (+ platform admin)" },
      { email: "priya@millbrookiga.dev", role: "Tenant admin" },
      { email: "tom@millbrookiga.dev", role: "Member — Millbrook IGA" },
      { email: "marco@westgateiga.dev", role: "Member — Westgate IGA Xpress" },
      { email: "deb@goldenwattlemotel.dev", role: "Member — Golden Wattle Motel" },
    ],
  },
  {
    tenant: "BrightSpark Marketing (agency)",
    accounts: [
      { email: "sasha@brightspark.dev", role: "Owner — 2 client companies" },
      { email: "liam@brightspark.dev", role: "Member — Harbour View Dental" },
    ],
  },
  {
    tenant: "Belongs to BOTH (tenant switcher)",
    accounts: [
      { email: "jordan@freelance.dev", role: "Consultant — switch between workspaces" },
    ],
  },
];

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
            MC
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Marketing Command Centre
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI drafts · you review · admins approve
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Passwordless access — you&apos;ll never be issued a password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={formAction} className="space-y-4">
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
              {state?.error && (
                <p className="text-sm text-red-600">{state.error}</p>
              )}
              {state?.message && (
                <p className="text-sm text-green-700">{state.message}</p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Signing in…" : "Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          New here?{" "}
          <a href="/signup" className="text-primary hover:underline">
            Create a workspace
          </a>
        </p>

        <div className="mt-6 rounded-lg border border-dashed border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Demo accounts (isolated tenants)
          </p>
          {DEMO_TENANTS.map((group) => (
            <div key={group.tenant} className="mb-3 last:mb-0">
              <p className="mb-1 text-xs font-medium text-foreground">{group.tenant}</p>
              <ul className="space-y-1">
                {group.accounts.map((a) => (
                  <li key={a.email} className="text-sm">
                    <span className="font-mono text-xs text-primary">{a.email}</span>
                    <span className="text-muted-foreground"> — {a.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
