import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, getTaxInvoice } from "@/lib/db";
import { TaxInvoiceDocument } from "@/components/tax-invoice-document";
import { buttonClasses } from "@/components/ui/button";

export default async function ClientTaxInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { companyId } = await requirePortalUser();
  const invoice = await getTaxInvoice(id);
  if (!invoice || invoice.companyId !== companyId) notFound();
  const company = await getCompany(companyId);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/client/payments" className={buttonClasses("outline", "sm")}>
          Back to Billing
        </Link>
      </div>
      <TaxInvoiceDocument invoice={invoice} companyName={company?.name} />
    </div>
  );
}
