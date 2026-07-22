import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, getTenant } from "@/lib/db";
import { templatesForCompany } from "@/lib/promo-catalog";
import { listOpenPromoSelections } from "@/lib/promo-requests";
import { PageHeader } from "@/components/page-header";
import { ClientPromoPicker } from "@/components/client-promo-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";

function money(n: number) {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

/**
 * Deep-link only — demoted from primary nav and Home (Wave A).
 * Agency owns packaging; route kept for existing links / agency-proposed flows.
 */
export default async function ClientPromosPage() {
  const { companyId } = await requirePortalUser();
  const company = await getCompany(companyId);
  if (!company) return null;

  const tenant = await getTenant(company.tenantId);
  const templates = templatesForCompany(
    company,
    tenant?.promoCatalog,
    tenant?.promoIndustries,
  );
  const open = listOpenPromoSelections(company);

  return (
    <div>
      <PageHeader
        title="Promotions"
        explainerId="client-promos"
        explainer="Legacy promotions page — order ready-made promos from Extras."
      >
        <Link href="/client/order" className={buttonClasses("outline", "sm")}>
          Open Extras
        </Link>
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Ordering moved to{" "}
          <Link href="/client/order" className="text-primary hover:underline">
            Extras
          </Link>
          — dishes, ready-made promos, and custom paid orders in one place. For a free message use{" "}
          <Link href="/client/requests/new" className="text-primary hover:underline">
            Ask us
          </Link>
          .
        </p>

        {open.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Your promo requests</h2>
            <ul className="space-y-2">
              {open.map((s) => (
                <li key={s.id}>
                  <Card>
                    <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                      <div className="min-w-0">
                        <p className="font-medium">{s.templateName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(s.startDate)} → {formatDate(s.endDate)} ·{" "}
                          {s.channels.join(", ")} ·{" "}
                          {s.billingClass === "included"
                            ? "Included in package"
                            : `${money(s.totalUsd)} incl. fee`}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Badge
                          tone={
                            s.billingClass === "included" ? "success" : "warning"
                          }
                        >
                          {s.billingClass === "included" ? "Included" : "Extra"}
                        </Badge>
                        <Badge
                          tone={s.status === "requested" ? "warning" : "success"}
                        >
                          {s.status === "requested"
                            ? "Not on calendar yet"
                            : s.status.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Browse packages</h2>
          <ClientPromoPicker templates={templates} />
        </section>
      </div>
    </div>
  );
}
