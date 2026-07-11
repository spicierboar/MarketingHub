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

export default async function ClientPromosPage() {
  const { companyId } = await requirePortalUser();
  const company = await getCompany(companyId);
  if (!company) return null;

  const tenant = await getTenant(company.tenantId);
  const templates = templatesForCompany(company, tenant?.promoCatalog);
  const open = listOpenPromoSelections(company);

  return (
    <div>
      <PageHeader
        title="Ready-made promotions"
        explainerId="client-promos"
        explainer="Pick a pre-built campaign for your industry. You only set package price, start date, and channels — creative and posts are ready. Separate from your ongoing strategy calendar."
      >
        <Link href="/client" className={buttonClasses("outline", "sm")}>
          Home
        </Link>
      </PageHeader>

      <div className="space-y-6 p-4 sm:p-6">
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
                          {s.channels.join(", ")} · {money(s.totalUsd)} incl. fee
                        </p>
                      </div>
                      <Badge
                        tone={s.status === "requested" ? "warning" : "success"}
                      >
                        {s.status === "requested"
                          ? "Not on calendar yet"
                          : s.status.replace(/_/g, " ")}
                      </Badge>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Choose a promotion</h2>
          <ClientPromoPicker templates={templates} />
        </section>
      </div>
    </div>
  );
}
