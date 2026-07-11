// Prepaid company credit wallet (C2).
// $50 minimum floor. Manual top-ups use Stripe Checkout when configured
// (setup_future_usage saves the card). Auto top-up charges off-session when a
// payment method is saved; otherwise ledger-simulates in demo.
// Does not flip ADS_LIVE or bypass spend-approval human gates.

import { logAction } from "@/lib/audit";
import {
  createCompanyCreditLedgerEntry,
  createCompanyCreditWallet,
  getCompany,
  getCompanyCreditWallet,
  listCompanyCreditLedger,
  updateCompanyCreditWallet,
} from "@/lib/db";
import type {
  ActingUser,
  CompanyCreditLedgerEntry,
  CompanyCreditWallet,
  CreditLedgerKind,
} from "@/lib/types";

export const MIN_CREDIT_FLOOR_USD = 50;

const DEFAULT_TOP_UP_TRIGGER_USD = 50;
const DEFAULT_TOP_UP_AMOUNT_USD = 100;
const DEFAULT_MAX_TOP_UP_AMOUNT_USD = 500;
const DEFAULT_MAX_TOP_UP_PER_DAY = 3;

const FLOOR_MESSAGE =
  `Account credit is below the $${MIN_CREDIT_FLOOR_USD} minimum. Top up credit before activating ads or changing spend.`;

export async function getOrCreateCreditWallet(
  companyId: string,
): Promise<CompanyCreditWallet> {
  const existing = await getCompanyCreditWallet(companyId);
  if (existing) return existing;
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  return createCompanyCreditWallet({
    tenantId: company.tenantId,
    companyId,
    balanceUsd: 0,
    minFloorUsd: MIN_CREDIT_FLOOR_USD,
    autoTopUpEnabled: false,
    topUpTriggerBalanceUsd: DEFAULT_TOP_UP_TRIGGER_USD,
    topUpAmountUsd: DEFAULT_TOP_UP_AMOUNT_USD,
    maxTopUpAmountUsd: DEFAULT_MAX_TOP_UP_AMOUNT_USD,
    maxTopUpPerDay: DEFAULT_MAX_TOP_UP_PER_DAY,
  });
}

export async function getCreditBalance(companyId: string): Promise<number> {
  const wallet = await getOrCreateCreditWallet(companyId);
  return wallet.balanceUsd;
}

/**
 * Throws if balance is below the wallet floor ($50) or below minRequiredUsd.
 * When `user` is provided and balance is below floor, attempts maybeAutoTopUp
 * once then rechecks.
 */
export async function assertPrepaidCredit(
  companyId: string,
  opts?: { minRequiredUsd?: number; user?: ActingUser },
): Promise<void> {
  let wallet = await getOrCreateCreditWallet(companyId);
  if (wallet.balanceUsd < wallet.minFloorUsd && opts?.user) {
    await maybeAutoTopUp(companyId, opts.user);
    wallet = await getOrCreateCreditWallet(companyId);
  }
  if (wallet.balanceUsd < wallet.minFloorUsd) {
    throw new Error(FLOOR_MESSAGE);
  }
  if (
    opts?.minRequiredUsd != null &&
    wallet.balanceUsd < opts.minRequiredUsd
  ) {
    throw new Error(FLOOR_MESSAGE);
  }
}

export async function topUpCredit(input: {
  companyId: string;
  amountUsd: number;
  user: ActingUser;
  kind?: CreditLedgerKind;
  reason: string;
  related?: { type: string; id: string };
}): Promise<CompanyCreditWallet> {
  if (!(input.amountUsd > 0)) {
    throw new Error("Top-up amount must be greater than zero.");
  }
  const kind: CreditLedgerKind = input.kind ?? "top_up";
  if (kind === "debit") {
    throw new Error("Use debitCredit for debits.");
  }
  const wallet = await getOrCreateCreditWallet(input.companyId);
  const balanceAfterUsd = wallet.balanceUsd + input.amountUsd;
  await createCompanyCreditLedgerEntry({
    tenantId: wallet.tenantId,
    companyId: input.companyId,
    walletId: wallet.id,
    kind,
    amountUsd: input.amountUsd,
    balanceAfterUsd,
    reason: input.reason,
    relatedType: input.related?.type,
    relatedId: input.related?.id,
    createdById: input.user.id,
  });
  const updated = await updateCompanyCreditWallet(wallet.id, {
    balanceUsd: balanceAfterUsd,
  });
  if (!updated) throw new Error("Failed to update credit wallet.");
  const action =
    kind === "auto_top_up"
      ? "credit.auto_top_up"
      : kind === "refund"
        ? "credit.refund"
        : kind === "adjustment"
          ? "credit.adjustment"
          : "credit.top_up";
  await logAction(input.user, action, {
    targetType: "company_credit_wallet",
    targetId: wallet.id,
    companyId: input.companyId,
    detail: `+$${input.amountUsd} → $${balanceAfterUsd} (${input.reason})`,
  });
  return updated;
}

/** Debit credit for future spend settlement. Refuses if balance would go below 0. */
export async function debitCredit(input: {
  companyId: string;
  amountUsd: number;
  user: ActingUser;
  reason: string;
  related?: { type: string; id: string };
}): Promise<CompanyCreditWallet> {
  if (!(input.amountUsd > 0)) {
    throw new Error("Debit amount must be greater than zero.");
  }
  const wallet = await getOrCreateCreditWallet(input.companyId);
  if (wallet.balanceUsd - input.amountUsd < 0) {
    throw new Error("Insufficient credit balance.");
  }
  const balanceAfterUsd = wallet.balanceUsd - input.amountUsd;
  await createCompanyCreditLedgerEntry({
    tenantId: wallet.tenantId,
    companyId: input.companyId,
    walletId: wallet.id,
    kind: "debit",
    amountUsd: -input.amountUsd,
    balanceAfterUsd,
    reason: input.reason,
    relatedType: input.related?.type,
    relatedId: input.related?.id,
    createdById: input.user.id,
  });
  const updated = await updateCompanyCreditWallet(wallet.id, {
    balanceUsd: balanceAfterUsd,
  });
  if (!updated) throw new Error("Failed to update credit wallet.");
  await logAction(input.user, "credit.debit", {
    targetType: "company_credit_wallet",
    targetId: wallet.id,
    companyId: input.companyId,
    detail: `-$${input.amountUsd} → $${balanceAfterUsd} (${input.reason})`,
  });
  return updated;
}

export async function updateCreditAutoTopUpSettings(
  companyId: string,
  user: ActingUser,
  settings: {
    autoTopUpEnabled?: boolean;
    topUpTriggerBalanceUsd?: number;
    topUpAmountUsd?: number;
    maxTopUpAmountUsd?: number;
    maxTopUpPerDay?: number;
  },
): Promise<CompanyCreditWallet> {
  const wallet = await getOrCreateCreditWallet(companyId);
  const updated = await updateCompanyCreditWallet(wallet.id, settings);
  if (!updated) throw new Error("Failed to update credit wallet settings.");
  await logAction(user, "credit.auto_top_up_settings", {
    targetType: "company_credit_wallet",
    targetId: wallet.id,
    companyId,
    detail: `enabled=${updated.autoTopUpEnabled} trigger=$${updated.topUpTriggerBalanceUsd} amount=$${updated.topUpAmountUsd}`,
  });
  return updated;
}

/**
 * If auto top-up is enabled and balance <= trigger, charge topUpAmount
 * capped by maxTopUpAmount and maxTopUpPerDay.
 * With Stripe + saved payment method → off-session PaymentIntent then ledger.
 * Without → ledger-simulated (demo path).
 */
export async function maybeAutoTopUp(
  companyId: string,
  user: ActingUser,
): Promise<CompanyCreditWallet | null> {
  const wallet = await getOrCreateCreditWallet(companyId);
  if (!wallet.autoTopUpEnabled) return null;
  if (wallet.balanceUsd > wallet.topUpTriggerBalanceUsd) return null;

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const todayAutos = await listCompanyCreditLedger(companyId, {
    kind: "auto_top_up",
    since: dayStart.toISOString(),
  });
  if (todayAutos.length >= wallet.maxTopUpPerDay) return null;

  const amountUsd = Math.min(wallet.topUpAmountUsd, wallet.maxTopUpAmountUsd);
  if (!(amountUsd > 0)) return null;

  const { chargeOffSessionCreditTopUp, stripeConfigured } = await import(
    "@/lib/billing"
  );
  const { applyPaidCreditTopUp } = await import("@/lib/credit-top-up");

  if (
    stripeConfigured() &&
    wallet.stripeCustomerId &&
    wallet.stripePaymentMethodId
  ) {
    const charged = await chargeOffSessionCreditTopUp({
      customerId: wallet.stripeCustomerId,
      paymentMethodId: wallet.stripePaymentMethodId,
      amountUsd,
      tenantId: wallet.tenantId,
      companyId,
    });
    if (!charged) return null;
    await applyPaidCreditTopUp({
      companyId,
      amountUsd,
      user,
      reason: "Off-session auto top-up",
      stripePaymentIntentId: charged.paymentIntentId,
      kind: "auto_top_up",
    });
    return getOrCreateCreditWallet(companyId);
  }

  return topUpCredit({
    companyId,
    amountUsd,
    user,
    kind: "auto_top_up",
    reason: "Simulated auto top-up (no saved card — demo path)",
  });
}

export type { CompanyCreditWallet, CompanyCreditLedgerEntry, CreditLedgerKind };
