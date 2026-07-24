import Link from "next/link";
import { redirect } from "next/navigation";
import {
  isAdmin,
  isSalesRep,
  requireSalesRepOrAdmin,
} from "@/lib/auth/rbac";
import { listCompanies } from "@/lib/db";
import { clientCompaniesOnly } from "@/lib/content-create-scope";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { buttonClasses } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

/**
 * Focused home for sales_rep seats: onboarding wizard entry + clients they
 * onboarded only. Admins who land here still see the same list filtered to
 * their createdBy when acting as sales; full portfolio stays on /dashboard.
 */
export default async function SalesHomePage() {
  const user = await requireSalesRepOrAdmin();
  // Admins keep the ops dashboard as their primary home.
  if (isAdmin(user) && !isSalesRep(user)) {
    redirect("/dashboard");
  }

  const companies = clientCompaniesOnly(
    (await listCompanies(user.tenantId)).filter((company) => {
      // PLACEHOLDER ownership: prefer soldByUserId when set; else createdBy.
      const ownerId = company.soldByUserId?.trim() || company.createdBy;
      return ownerId === user.id;
    }),
  );

  return (
    <div>
      <PageHeader
        title={`Sales home · ${user.name.split(" ")[0]}`}
        explainerId="sales-home"
        explainer="Onboard new clients and track only the accounts you signed up. Ops queues stay with agency admins."
      >
        <Link href="/sales/new-client" className={buttonClasses("default", "sm")}>
          New client wizard
        </Link>
      </PageHeader>

      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-5">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Start onboarding</h2>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">New client wizard</p>
                <p className="text-xs text-muted-foreground">
                  Website + Google Business auto-fill → profile review → package → checkout → portal login.
                </p>
              </div>
              <Link
                href="/sales/new-client"
                className={buttonClasses("outline", "sm")}
              >
                Open wizard
              </Link>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-2">
          <div className="flex items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Your clients</h2>
              <p className="text-xs text-muted-foreground">
                Filtered to accounts you onboarded ({companies.length}).
              </p>
            </div>
          </div>
          {companies.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
              No clients yet. Start the wizard to onboard your first account.
            </p>
          ) : (
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
              {companies.map((company) => (
                <li key={company.id}>
                  <Link
                    href={`/companies/${company.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{company.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Signup {formatDate(company.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={company.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Reports</h2>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                Coming soon — personal signup and conversion reports for your book.
              </p>
              {/* PLACEHOLDER: wire sales-scoped reporting once metrics exist. */}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
