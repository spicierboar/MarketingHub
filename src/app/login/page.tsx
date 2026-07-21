import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { LoginAuthError } from "./login-auth-error";

// Managed service: two personas only — Agency (delivers) and Client (reviews).
const DEMO_TENANTS: { tenant: string; accounts: { email: string; role: string }[] }[] = [
  {
    tenant: "Southern Cross Hospitality",
    accounts: [
      {
        email: "admin@staging-fixture.invalid",
        role: "Alex Morgan — agency admin",
      },
      {
        email: "approver-saffron-laneway@staging-fixture.invalid",
        role: "Priya Mehta — Saffron Laneway Kitchen",
      },
    ],
  },
];

export default function LoginPage() {
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
            Managed marketing — we deliver, you approve
          </p>
        </div>

        <Suspense fallback={null}>
          <LoginAuthError />
        </Suspense>

        <LoginForm />

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Two roles: your agency runs the service; you review and approve as the client.
        </p>

        <p className="mt-2 text-center text-xs text-muted-foreground">
          Local testing?{" "}
          <a href="/dev" className="text-primary underline">
            Dev tools — seed / clear / quick login
          </a>
        </p>

        <div className="mt-6 rounded-lg border border-dashed border-border bg-card p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Demo accounts (2 users)
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
