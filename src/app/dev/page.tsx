import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { localDemoEnabled, devToolsOpen, appEnv } from "@/lib/env";
import {
  localDemoMutationAllowed,
  selfTestSecretConfigured,
} from "@/lib/dev-access";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import {
  clearAndReseedAction,
  quickLoginAction,
  seedDemoDataAction,
} from "./actions";

export const dynamic = "force-dynamic";

const DEMO_LOGINS = [
  {
    email: "admin@staging-fixture.invalid",
    label: "Alex Morgan — agency admin",
  },
  {
    email: "staff-1@staging-fixture.invalid",
    label: "Jordan Chen — content staff",
  },
  {
    email: "approver-saffron-laneway@staging-fixture.invalid",
    label: "Priya Mehta — Saffron Laneway Kitchen",
  },
] as const;

function QuickLoginSecretFields({ required }: { required: boolean }) {
  if (!required) return null;
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">CC_SELFTEST_SECRET</span>
      <input
        type="password"
        name="selftestSecret"
        required
        autoComplete="off"
        placeholder="Required on this deployment"
        className="h-9 min-w-[16rem] rounded-md border border-input bg-background px-3 text-sm"
      />
    </label>
  );
}

export default async function DevToolsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; seeded?: string; cleared?: string }>;
}) {
  if (!devToolsOpen()) redirect("/login");

  const params = (await searchParams) ?? {};
  const error = typeof params.error === "string" ? params.error.trim() : "";
  const demoFlag = localDemoEnabled();
  const demoMutations = localDemoMutationAllowed(await headers());
  const staging = appEnv() === "staging";
  const quickLoginOk = demoFlag || staging;
  const supabaseActive = isSupabaseConfigured();
  const secretRequired = selfTestSecretConfigured();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {staging ? "Staging" : "Local only"}
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Dev tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {staging
            ? "Staging diagnostics and magic-link bypass. Locked in production."
            : "Seed / clear / auth bypass for main (and any branch). Locked in production."}
        </p>
        <p className="mt-2 text-sm">
          <Link href="/login" className="text-primary underline">
            ← Login
          </Link>
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-3 p-6">
          <h2 className="font-semibold">Status</h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">appEnv</dt>
              <dd className="font-mono">{appEnv()}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Local demo bypass</dt>
              <dd>
                {demoFlag ? (
                  <Badge tone="success">ON — memory + cookie auth</Badge>
                ) : (
                  <Badge tone="warning">OFF — Supabase / magic link</Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">isSupabaseConfigured()</dt>
              <dd className="font-mono">{String(supabaseActive)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Quick login</dt>
              <dd>
                {quickLoginOk ? (
                  <Badge tone="success">
                    {staging && !demoFlag
                      ? secretRequired
                        ? "ON — fixture emails + secret"
                        : "ON — fixture emails only"
                      : "ON"}
                  </Badge>
                ) : (
                  <Badge tone="warning">OFF</Badge>
                )}
              </dd>
            </div>
          </dl>
          {!demoFlag && !staging && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Add to <code className="font-mono">.env.local</code> then restart{" "}
              <code className="font-mono">npm run dev</code>:
              <code className="mt-2 block font-mono text-xs">
                CC_LOCAL_DEMO=true
                <br />
                NEXT_PUBLIC_CC_LOCAL_DEMO=true
              </code>
              Bypasses Supabase on <strong>main</strong> so seeded demo accounts
              work without magic link / Google billing.
            </p>
          )}
          {staging && !demoFlag && (
            <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
              Staging: Seed stays local-demo-only. Quick login is limited to the
              fixture emails below (same-origin POST
              {secretRequired
                ? "; CC_SELFTEST_SECRET required"
                : ""}
              ).
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="font-semibold">Data</h2>
          <p className="text-sm text-muted-foreground">
            In-memory only. Re-seed restores the ten fictional Australian Indian
            restaurants and their linked agency, client, delivery, billing and
            operations records. No external side effects are enabled.
            {staging && !demoMutations
              ? " Disabled on staging Supabase — use Quick login instead."
              : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={seedDemoDataAction}>
              <Button type="submit" disabled={!demoMutations}>
                Seed / reset demo data
              </Button>
            </form>
            <form action={clearAndReseedAction}>
              <Button type="submit" variant="secondary" disabled={!demoMutations}>
                Clear session + re-seed
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="font-semibold">Quick login (bypass magic link)</h2>
          {staging && !demoFlag && (
            <p className="text-sm text-muted-foreground">
              Use a Sign in button below. Arbitrary emails are not accepted on
              staging.
              {secretRequired
                ? " Enter CC_SELFTEST_SECRET with each sign-in."
                : ""}
            </p>
          )}
          {demoFlag && (
            <form action={quickLoginAction} className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Email</span>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="you@example.com"
                  className="h-9 min-w-[16rem] rounded-md border border-input bg-background px-3 text-sm"
                />
              </label>
              <QuickLoginSecretFields required={secretRequired} />
              <Button type="submit" disabled={!quickLoginOk} size="sm">
                Sign in with email
              </Button>
            </form>
          )}
          <ul className="space-y-2">
            {DEMO_LOGINS.map((d) => (
              <li key={d.email} className="flex flex-wrap items-center gap-2">
                <form
                  action={quickLoginAction}
                  className="flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="email" value={d.email} />
                  <QuickLoginSecretFields required={secretRequired} />
                  <Button type="submit" disabled={!quickLoginOk} size="sm">
                    Sign in
                  </Button>
                </form>
                <span className="font-mono text-xs text-primary">{d.email}</span>
                <span className="text-sm text-muted-foreground">— {d.label}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-6">
          <h2 className="font-semibold">Fixtures</h2>
          <div className="flex flex-wrap gap-3 text-sm">
            <a className="text-primary underline" href="/api/dev/self-test">
              /api/dev/self-test
            </a>
            <a className="text-primary underline" href="/api/dev/queue-test">
              /api/dev/queue-test
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
