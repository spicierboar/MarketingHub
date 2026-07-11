// Local tax-invoice suite (AU GST). Stripe Checkout/Invoice ids are payment
// proof only — this module is the legal SoT for numbering, parties, and GST.

import { logAction } from "@/lib/audit";
import {
  createTaxInvoice,
  getCompany,
  getTaxInvoice,
  getTaxInvoiceByStripeCheckoutSession,
  getTenant,
  listTaxInvoices,
  updateTaxInvoice,
} from "@/lib/db";
import type {
  ActingUser,
  TaxInvoice,
  TaxInvoiceKind,
  TaxInvoiceLine,
  TaxInvoiceParty,
} from "@/lib/types";

/** Split a GST-inclusive total (AU 10%): GST = total/11. */
export function splitGstInclusive(totalIncGst: number): {
  subtotalExGst: number;
  gstAmount: number;
  totalIncGst: number;
} {
  const total = Math.round(totalIncGst * 100) / 100;
  const gstAmount = Math.round((total / 11) * 100) / 100;
  const subtotalExGst = Math.round((total - gstAmount) * 100) / 100;
  return { subtotalExGst, gstAmount, totalIncGst: total };
}

/** True when all TAX_INVOICE_SELLER_* letterhead env vars are set. */
export function taxInvoiceLetterheadConfigured(): boolean {
  return !!(
    process.env.TAX_INVOICE_SELLER_NAME?.trim() &&
    process.env.TAX_INVOICE_SELLER_ABN?.trim() &&
    process.env.TAX_INVOICE_SELLER_ADDRESS?.trim() &&
    process.env.TAX_INVOICE_SELLER_EMAIL?.trim()
  );
}

function sellerFromEnv(tenantName: string): TaxInvoiceParty {
  return {
    name:
      process.env.TAX_INVOICE_SELLER_NAME?.trim() ||
      tenantName ||
      "Marketing Command Centre",
    abn: process.env.TAX_INVOICE_SELLER_ABN?.trim() || undefined,
    address: process.env.TAX_INVOICE_SELLER_ADDRESS?.trim() || undefined,
    email: process.env.TAX_INVOICE_SELLER_EMAIL?.trim() || undefined,
  };
}

function buyerFromCompany(company: {
  name: string;
  profile: { legalName?: string; approvalContact?: string };
}): TaxInvoiceParty {
  return {
    name: company.profile.legalName?.trim() || company.name,
    email: company.profile.approvalContact?.trim() || undefined,
  };
}

async function nextInvoiceNumber(tenantId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const existing = await listTaxInvoices(tenantId);
  const prefix = `INV-${year}-`;
  let max = 0;
  for (const inv of existing) {
    if (!inv.invoiceNumber.startsWith(prefix)) continue;
    const n = Number(inv.invoiceNumber.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

function moneyLine(
  description: string,
  totalIncGst: number,
): { lines: TaxInvoiceLine[]; subtotalExGst: number; gstAmount: number; totalIncGst: number } {
  const split = splitGstInclusive(totalIncGst);
  return {
    lines: [
      {
        description,
        quantity: 1,
        unitAmountExGst: split.subtotalExGst,
        gstAmount: split.gstAmount,
        amountIncGst: split.totalIncGst,
      },
    ],
    ...split,
  };
}

export async function issueTaxInvoice(input: {
  tenantId: string;
  companyId: string;
  kind: TaxInvoiceKind;
  totalIncGst: number;
  currency?: string;
  description: string;
  user: ActingUser;
  notes?: string;
  relatedType?: string;
  relatedId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string;
  creditsInvoiceId?: string;
}): Promise<TaxInvoice> {
  if (!(input.totalIncGst > 0) && input.kind !== "credit_note") {
    throw new Error("Invoice total must be greater than zero.");
  }
  if (input.stripeCheckoutSessionId) {
    const dup = await getTaxInvoiceByStripeCheckoutSession(
      input.stripeCheckoutSessionId,
    );
    if (dup) return dup;
  }

  const [tenant, company] = await Promise.all([
    getTenant(input.tenantId),
    getCompany(input.companyId),
  ]);
  if (!tenant) throw new Error("Workspace not found");
  if (!company || company.tenantId !== input.tenantId) {
    throw new Error("Company not found");
  }

  const absTotal = Math.abs(input.totalIncGst);
  const built = moneyLine(input.description, absTotal);
  const sign = input.kind === "credit_note" ? -1 : 1;
  const lines =
    sign < 0
      ? built.lines.map((l) => ({
          ...l,
          unitAmountExGst: -l.unitAmountExGst,
          gstAmount: -l.gstAmount,
          amountIncGst: -l.amountIncGst,
        }))
      : built.lines;

  const invoice = await createTaxInvoice({
    tenantId: input.tenantId,
    companyId: input.companyId,
    invoiceNumber: await nextInvoiceNumber(input.tenantId),
    kind: input.kind,
    status: "issued",
    currency: input.currency ?? "usd",
    seller: sellerFromEnv(tenant.name),
    buyer: buyerFromCompany(company),
    lines,
    subtotalExGst: sign * built.subtotalExGst,
    gstAmount: sign * built.gstAmount,
    totalIncGst: sign * built.totalIncGst,
    gstInclusive: true,
    notes: input.notes,
    relatedType: input.relatedType,
    relatedId: input.relatedId,
    creditsInvoiceId: input.creditsInvoiceId,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    stripePaymentIntentId: input.stripePaymentIntentId,
    stripeInvoiceId: input.stripeInvoiceId,
    issuedAt: new Date().toISOString(),
    createdById: input.user.id,
  });

  await logAction(input.user, "tax_invoice.issued", {
    tenantId: input.tenantId,
    companyId: input.companyId,
    targetType: "tax_invoice",
    targetId: invoice.id,
    detail: `${invoice.invoiceNumber} ${input.kind} ${invoice.currency.toUpperCase()} ${invoice.totalIncGst}`,
  });
  return invoice;
}

/** Issue a credit note that voids the original for GST purposes. */
export async function issueCreditNote(
  invoiceId: string,
  user: ActingUser,
  reason: string,
): Promise<TaxInvoice> {
  const original = await getTaxInvoice(invoiceId);
  if (!original) throw new Error("Invoice not found");
  if (original.status !== "issued") {
    throw new Error("Only issued invoices can be credited.");
  }
  if (original.tenantId !== user.tenantId) {
    throw new Error("Forbidden: invoice belongs to another workspace");
  }

  const note = await issueTaxInvoice({
    tenantId: original.tenantId,
    companyId: original.companyId,
    kind: "credit_note",
    totalIncGst: Math.abs(original.totalIncGst),
    currency: original.currency,
    description: `Credit note for ${original.invoiceNumber}: ${reason}`,
    user,
    notes: reason,
    creditsInvoiceId: original.id,
    relatedType: "tax_invoice",
    relatedId: original.id,
  });

  await updateTaxInvoice(original.id, {
    status: "credited",
    voidedAt: new Date().toISOString(),
  });
  await logAction(user, "tax_invoice.credited", {
    tenantId: original.tenantId,
    companyId: original.companyId,
    targetType: "tax_invoice",
    targetId: original.id,
    detail: `Credited by ${note.invoiceNumber}: ${reason}`,
  });
  return note;
}

export async function voidTaxInvoice(
  invoiceId: string,
  user: ActingUser,
  reason: string,
): Promise<TaxInvoice> {
  const original = await getTaxInvoice(invoiceId);
  if (!original) throw new Error("Invoice not found");
  if (original.tenantId !== user.tenantId) {
    throw new Error("Forbidden: invoice belongs to another workspace");
  }
  if (original.status !== "issued") {
    throw new Error("Only issued invoices can be voided.");
  }
  const updated = await updateTaxInvoice(original.id, {
    status: "void",
    voidedAt: new Date().toISOString(),
    notes: [original.notes, `Voided: ${reason}`].filter(Boolean).join(" · "),
  });
  if (!updated) throw new Error("Failed to void invoice");
  await logAction(user, "tax_invoice.voided", {
    tenantId: original.tenantId,
    companyId: original.companyId,
    targetType: "tax_invoice",
    targetId: original.id,
    detail: reason,
  });
  return updated;
}

export type { TaxInvoice };
