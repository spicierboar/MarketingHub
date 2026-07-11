// Self-tests for tax invoices + paid credit top-up settlement.

import {
  addMembership,
  createCompany,
  createTenant,
  createUser,
  getTaxInvoice,
  listTaxInvoices,
  purgeTenant,
} from "@/lib/db";
import { applyPaidCreditTopUp } from "@/lib/credit-top-up";
import { getCreditBalance } from "@/lib/credit-wallet";
import {
  issueCreditNote,
  splitGstInclusive,
  voidTaxInvoice,
} from "@/lib/tax-invoices";
import { TENANT_ROLE_TIER } from "@/lib/types";
import type { ActingUser, User } from "@/lib/types";

function acting(user: User, tenantId: string): ActingUser {
  return {
    ...user,
    tenantId,
    tenantRole: "owner",
    role: TENANT_ROLE_TIER.owner,
  };
}

async function withCompany(
  run: (ctx: {
    user: ActingUser;
    companyId: string;
    tenantId: string;
  }) => Promise<{ ok: boolean; detail: string }>,
): Promise<{ ok: boolean; detail: string }> {
  const t = await createTenant({
    name: `Tax Inv ${Date.now()}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `taxinv-${Date.now()}@example.dev`,
    name: "Tax Admin",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const user = acting(userRow, t.id);
  const company = await createCompany({
    tenantId: t.id,
    name: "Tax Co",
    createdBy: user.id,
  });
  try {
    return await run({ user, companyId: company.id, tenantId: t.id });
  } finally {
    await purgeTenant(t.id);
  }
}

/** GST-inclusive split: $110 → $100 ex + $10 GST. */
export async function checkGstInclusiveSplit(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const s = splitGstInclusive(110);
  const ok =
    s.totalIncGst === 110 &&
    s.gstAmount === 10 &&
    s.subtotalExGst === 100;
  return { ok, detail: JSON.stringify(s) };
}

/** Simulated top-up issues wallet credit + tax invoice. */
export async function checkTopUpIssuesTaxInvoice(): Promise<{
  ok: boolean;
  detail: string;
}> {
  return withCompany(async ({ user, companyId, tenantId }) => {
    const { wallet, invoice } = await applyPaidCreditTopUp({
      companyId,
      amountUsd: 110,
      user,
      reason: "Self-test top-up",
      simulated: true,
    });
    const balance = await getCreditBalance(companyId);
    const listed = await listTaxInvoices(tenantId, { companyId });
    const ok =
      balance === 110 &&
      wallet.balanceUsd === 110 &&
      invoice.kind === "credit_top_up" &&
      invoice.status === "issued" &&
      invoice.gstAmount === 10 &&
      invoice.subtotalExGst === 100 &&
      listed.some((i) => i.id === invoice.id);
    return {
      ok,
      detail: `bal=${balance} inv=${invoice.invoiceNumber} gst=${invoice.gstAmount} listed=${listed.length}`,
    };
  });
}

/** Stripe session id is idempotent (second apply does not double-credit). */
export async function checkTopUpStripeSessionIdempotent(): Promise<{
  ok: boolean;
  detail: string;
}> {
  return withCompany(async ({ user, companyId }) => {
    const sessionId = `cs_test_${Date.now()}`;
    const first = await applyPaidCreditTopUp({
      companyId,
      amountUsd: 50,
      user,
      reason: "Self-test stripe top-up",
      stripeCheckoutSessionId: sessionId,
    });
    const second = await applyPaidCreditTopUp({
      companyId,
      amountUsd: 50,
      user,
      reason: "Self-test stripe top-up retry",
      stripeCheckoutSessionId: sessionId,
    });
    const balance = await getCreditBalance(companyId);
    const ok =
      balance === 50 &&
      first.invoice.id === second.invoice.id &&
      first.wallet.balanceUsd === 50;
    return {
      ok,
      detail: `bal=${balance} inv=${first.invoice.id === second.invoice.id}`,
    };
  });
}

/** Credit note marks original credited. */
export async function checkTaxInvoiceCreditNote(): Promise<{
  ok: boolean;
  detail: string;
}> {
  return withCompany(async ({ user, companyId }) => {
    const { invoice } = await applyPaidCreditTopUp({
      companyId,
      amountUsd: 55,
      user,
      reason: "Self-test for credit note",
      simulated: true,
    });
    const note = await issueCreditNote(invoice.id, user, "Self-test credit");
    const original = await getTaxInvoice(invoice.id);
    const ok =
      note.kind === "credit_note" &&
      note.totalIncGst === -55 &&
      note.creditsInvoiceId === invoice.id &&
      original?.status === "credited";
    return {
      ok,
      detail: `note=${note.invoiceNumber} orig=${original?.status} total=${note.totalIncGst}`,
    };
  });
}

/** Void marks invoice void. */
export async function checkTaxInvoiceVoid(): Promise<{
  ok: boolean;
  detail: string;
}> {
  return withCompany(async ({ user, companyId }) => {
    const { invoice } = await applyPaidCreditTopUp({
      companyId,
      amountUsd: 50,
      user,
      reason: "Self-test for void",
      simulated: true,
    });
    const voided = await voidTaxInvoice(invoice.id, user, "Self-test void");
    const ok = voided.status === "void" && !!voided.voidedAt;
    return { ok, detail: `status=${voided.status}` };
  });
}
