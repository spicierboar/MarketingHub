import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { localDemoEnabled, devToolsOpen, appEnv } from "@/lib/env";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import {
  clearAndReseedAction,
  quickLoginAction,
  seedDemoDataAction,
} from "./actions";

export const dynamic = "force-dynamic";

const DEMO_LOGINS = [
  { email: "sasha@brightspark.dev", label: "Agency — operates the service" },
  { email: "liam@brightspark.dev", label: "Client — review & approve only" },
] as const;

export default async function DevToolsPage() {
  if (!devToolsOpen()) redirect("/login");

  const demo = localDemoEnabled();
  const supabaseActive = isSupabaseConfigured();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Local only
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Dev tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Seed / clear / auth bypass for main (and any branch). Locked in production.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/login" className="text-primary underline">
            ← Login
          </Link>
        </p>
      </div>

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
                {demo ? (
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
          </dl>
          {!demo && (
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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="font-semibold">Data</h2>
          <p className="text-sm text-muted-foreground">
            In-memory only. Re-seed restores Wattle + BrightSpark (campaigns, CRM,
            RAG, recommendations, AI-MOS, etc.).
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={seedDemoDataAction}>
              <Button type="submit" disabled={!demo}>
                Seed / reset demo data
              </Button>
            </form>
            <form action={clearAndReseedAction}>
              <Button type="submit" variant="secondary" disabled={!demo}>
                Clear session + re-seed
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-6">
          <h2 className="font-semibold">Quick login (bypass magic link)</h2>
          <ul className="space-y-2">
            {DEMO_LOGINS.map((d) => (
              <li key={d.email} className="flex flex-wrap items-center gap-2">
                <form action={quickLoginAction}>
                  <input type="hidden" name="email" value={d.email} />
                  <Button type="submit" disabled={!demo} size="sm">
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
