import type { TaxInvoice } from "@/lib/types";

const money = (currency: string, amount: number) => {
  const raw = (currency || "AUD").toUpperCase();
  const code = raw === "USD" ? "AUD" : raw;
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: code,
    minimumFractionDigits: 2,
  }).format(amount);
};

export function TaxInvoiceDocument({
  invoice,
  companyName,
}: {
  invoice: TaxInvoice;
  companyName?: string;
}) {
  return (
    <article className="mx-auto max-w-2xl space-y-8 bg-white p-8 text-slate-900 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Tax invoice
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{invoice.invoiceNumber}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Issued {new Date(invoice.issuedAt).toLocaleDateString("en-AU")}
            {invoice.status !== "issued" ? ` · ${invoice.status}` : ""}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-medium">{invoice.seller.name}</p>
          {invoice.seller.abn ? <p>ABN {invoice.seller.abn}</p> : null}
          {invoice.seller.address ? (
            <p className="whitespace-pre-line text-slate-600">{invoice.seller.address}</p>
          ) : null}
          {invoice.seller.email ? (
            <p className="text-slate-600">{invoice.seller.email}</p>
          ) : null}
        </div>
      </header>

      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Bill to</p>
          <p className="mt-1 font-medium">{invoice.buyer.name}</p>
          {companyName && companyName !== invoice.buyer.name ? (
            <p className="text-sm text-slate-600">{companyName}</p>
          ) : null}
          {invoice.buyer.abn ? <p className="text-sm">ABN {invoice.buyer.abn}</p> : null}
          {invoice.buyer.email ? (
            <p className="text-sm text-slate-600">{invoice.buyer.email}</p>
          ) : null}
          {invoice.buyer.address ? (
            <p className="whitespace-pre-line text-sm text-slate-600">{invoice.buyer.address}</p>
          ) : null}
        </div>
        <div className="text-sm text-slate-600">
          <p>
            Kind: <span className="text-slate-900">{invoice.kind.replace(/_/g, " ")}</span>
          </p>
          <p>
            Currency:{" "}
            <span className="text-slate-900">{invoice.currency.toUpperCase()}</span>
          </p>
          {invoice.gstInclusive ? <p>Amounts include GST (10%)</p> : <p>GST exclusive</p>}
        </div>
      </section>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Ex GST</th>
            <th className="py-2 text-right font-medium">GST</th>
            <th className="py-2 text-right font-medium">Inc GST</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line, i) => (
            <tr key={i} className="border-b border-slate-100">
              <td className="py-3 pr-2">{line.description}</td>
              <td className="py-3 text-right">{line.quantity}</td>
              <td className="py-3 text-right">
                {money(invoice.currency, line.unitAmountExGst * line.quantity)}
              </td>
              <td className="py-3 text-right">{money(invoice.currency, line.gstAmount)}</td>
              <td className="py-3 text-right">{money(invoice.currency, line.amountIncGst)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto w-full max-w-xs space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">Subtotal (ex GST)</dt>
          <dd>{money(invoice.currency, invoice.subtotalExGst)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-500">GST</dt>
          <dd>{money(invoice.currency, invoice.gstAmount)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd>{money(invoice.currency, invoice.totalIncGst)}</dd>
        </div>
      </dl>

      {invoice.notes ? (
        <p className="text-sm text-slate-600">Notes: {invoice.notes}</p>
      ) : null}

      <p className="text-xs text-slate-500 print:hidden">
        Use your browser print dialog to save a PDF copy of this tax invoice.
      </p>
    </article>
  );
}
