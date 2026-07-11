import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessCompany, requireUser } from "@/lib/auth/rbac";
import { getCompany, getTaxInvoice } from "@/lib/db";
import { TaxInvoiceDocument } from "@/components/tax-invoice-document";
import { Button, buttonClasses } from "@/components/ui/button";
import { issueCreditNoteAction, voidTaxInvoiceAction } from "../../actions";

export default async function AgencyTaxInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const invoice = await getTaxInvoice(id);
  if (!invoice || invoice.tenantId !== user.tenantId) notFound();
  if (!(await canAccessCompany(user, invoice.companyId))) notFound();
  const company = await getCompany(invoice.companyId);

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/billing" className={buttonClasses("outline", "sm")}>
          Back to Billing
        </Link>
        {invoice.status === "issued" ? (
          <>
            <form action={issueCreditNoteAction}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <input type="hidden" name="reason" value="Credit note issued by agency" />
              <Button type="submit" size="sm" variant="outline">
                Issue credit note
              </Button>
            </form>
            <form action={voidTaxInvoiceAction}>
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <input type="hidden" name="reason" value="Voided by agency" />
              <Button type="submit" size="sm" variant="outline">
                Void
              </Button>
            </form>
          </>
        ) : null}
      </div>
      <TaxInvoiceDocument invoice={invoice} companyName={company?.name} />
    </div>
  );
}
