// Paid (or simulated) credit top-up → wallet ledger + tax invoice.
// Stripe Checkout webhook and client portal actions share this path.

import { logAction } from "@/lib/audit";
import { getOrCreateCreditWallet, topUpCredit } from "@/lib/credit-wallet";
import {
  findCompanyCreditLedgerByRelated,
  getCompany,
  getTaxInvoiceByStripeCheckoutSession,
} from "@/lib/db";
import { issueTaxInvoice } from "@/lib/tax-invoices";
import type { ActingUser, CompanyCreditWallet, TaxInvoice } from "@/lib/types";

export async function applyPaidCreditTopUp(input: {
  companyId: string;
  amountUsd: number;
  user: ActingUser;
  reason: string;
  simulated?: boolean;
  kind?: "top_up" | "auto_top_up";
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
}): Promise<{ wallet: CompanyCreditWallet; invoice: TaxInvoice }> {
  if (!(input.amountUsd > 0)) {
    throw new Error("Top-up amount must be greater than zero.");
  }
  const company = await getCompany(input.companyId);
  if (!company) throw new Error("Company not found");
  if (company.tenantId !== input.user.tenantId) {
    throw new Error("Forbidden: company belongs to another workspace");
  }

  if (input.stripeCheckoutSessionId) {
    const existingInv = await getTaxInvoiceByStripeCheckoutSession(
      input.stripeCheckoutSessionId,
    );
    if (existingInv) {
      return {
        wallet: await getOrCreateCreditWallet(input.companyId),
        invoice: existingInv,
      };
    }
    const existingLedger = await findCompanyCreditLedgerByRelated(
      input.companyId,
      "stripe_checkout_session",
      input.stripeCheckoutSessionId,
    );
    if (existingLedger) {
      const invoice = await issueTaxInvoice({
        tenantId: company.tenantId,
        companyId: input.companyId,
        kind: "credit_top_up",
        totalIncGst: input.amountUsd,
        currency: "aud",
        description: `Prepaid account credit top-up ($${input.amountUsd.toFixed(2)})`,
        user: input.user,
        notes: input.reason,
        relatedType: "company_credit_ledger",
        relatedId: existingLedger.id,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        stripePaymentIntentId: input.stripePaymentIntentId,
      });
      return {
        wallet: await getOrCreateCreditWallet(input.companyId),
        invoice,
      };
    }
  }

  const related = input.stripeCheckoutSessionId
    ? {
        type: "stripe_checkout_session",
        id: input.stripeCheckoutSessionId,
      }
    : undefined;

  const wallet = await topUpCredit({
    companyId: input.companyId,
    amountUsd: input.amountUsd,
    user: input.user,
    kind: input.kind ?? "top_up",
    reason: input.reason,
    related,
  });

  const invoice = await issueTaxInvoice({
    tenantId: company.tenantId,
    companyId: input.companyId,
    kind: "credit_top_up",
    totalIncGst: input.amountUsd,
    currency: "aud",
    description: `Prepaid account credit top-up ($${input.amountUsd.toFixed(2)})`,
    user: input.user,
    notes: input.simulated
      ? `${input.reason} (demo — no card captured)`
      : input.reason,
    relatedType: "company_credit_wallet",
    relatedId: wallet.id,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    stripePaymentIntentId: input.stripePaymentIntentId,
  });

  await logAction(input.user, "credit.top_up_settled", {
    tenantId: company.tenantId,
    companyId: input.companyId,
    targetType: "tax_invoice",
    targetId: invoice.id,
    detail: `+$${input.amountUsd} invoice ${invoice.invoiceNumber}${
      input.simulated ? " (simulated)" : ""
    }`,
  });

  return { wallet, invoice };
}
