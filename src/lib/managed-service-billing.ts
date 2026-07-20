import type {
  CompanyServiceBillingState,
  CompanyServiceOptions,
  CurrentMarketingPackageId,
  MarketingPackageId,
} from "@/lib/types";
import { randomUUID } from "node:crypto";

export const WEBSITE_CONNECTION_SETUP_AUD = 299;
export const SEARCH_VISIBILITY_MONTHLY_AUD = 249;
export const WEBSITE_PUBLISHING_MONTHLY_AUD = 99;
export const HOSTED_LANDING_PAGE_MONTHLY_AUD = 79;
export const HOSTED_LANDING_PAGE_SETUP_AUD = 299;
export const FAILED_PAYMENT_GRACE_DAYS = 7;

const PACKAGE_RANK: Record<CurrentMarketingPackageId, number> = {
  starter: 0,
  growth: 1,
  managed: 2,
};

export function currentPackageId(
  id: MarketingPackageId | string | null | undefined,
): CurrentMarketingPackageId {
  switch (id) {
    case "managed":
    case "blast":
      return "managed";
    case "growth":
    case "pro":
    case "custom":
      return "growth";
    default:
      return "starter";
  }
}

export function defaultCompanyServiceOptions(
  packageId: MarketingPackageId | string,
): CompanyServiceOptions {
  const current = currentPackageId(packageId);
  return {
    searchVisibility: current === "managed",
    websiteConnectionSetup: true,
    websitePublishing: false,
    hostedLandingPage: false,
    monthlyAdCapAud: 0,
  };
}

export function normaliseCompanyServiceOptions(
  packageId: MarketingPackageId | string,
  value?: Partial<CompanyServiceOptions> | null,
): CompanyServiceOptions {
  const defaults = defaultCompanyServiceOptions(packageId);
  const current = currentPackageId(packageId);
  let searchVisibility = Boolean(value?.searchVisibility);
  if (current === "managed") {
    searchVisibility = true;
  } else if (current === "starter") {
    searchVisibility = false;
  }
  const requestedAdCap = value?.monthlyAdCapAud;
  return {
    searchVisibility,
    websiteConnectionSetup: true,
    websitePublishing: Boolean(value?.websitePublishing),
    hostedLandingPage: Boolean(value?.hostedLandingPage),
    monthlyAdCapAud: Math.max(
      0,
      typeof requestedAdCap === "number" && Number.isFinite(requestedAdCap)
        ? Math.round(requestedAdCap)
        : defaults.monthlyAdCapAud,
    ),
  };
}

export function parseCompanyServiceOptionsFromFormData(
  packageId: MarketingPackageId | string,
  formData: FormData,
): CompanyServiceOptions {
  const monthlyAdCapAud = Number(formData.get("monthlyAdCapAud"));
  return normaliseCompanyServiceOptions(packageId, {
    searchVisibility: formData.get("searchVisibility") === "on",
    websiteConnectionSetup: true,
    websitePublishing: formData.get("websitePublishing") === "on",
    hostedLandingPage: formData.get("hostedLandingPage") === "on",
    monthlyAdCapAud: Number.isFinite(monthlyAdCapAud) ? monthlyAdCapAud : 0,
  });
}

export function monthlyServiceOptionsAud(
  packageId: MarketingPackageId | string,
  options: Partial<CompanyServiceOptions> | null | undefined,
): number {
  const normalised = normaliseCompanyServiceOptions(packageId, options);
  return (
    (normalised.searchVisibility && currentPackageId(packageId) === "growth"
      ? SEARCH_VISIBILITY_MONTHLY_AUD
      : 0) +
    (normalised.websitePublishing ? WEBSITE_PUBLISHING_MONTHLY_AUD : 0) +
    (normalised.hostedLandingPage ? HOSTED_LANDING_PAGE_MONTHLY_AUD : 0)
  );
}

export function oneOffServiceSetupAud(
  options: Partial<CompanyServiceOptions> | null | undefined,
): number {
  return (
    WEBSITE_CONNECTION_SETUP_AUD +
    (options?.hostedLandingPage ? HOSTED_LANDING_PAGE_SETUP_AUD : 0)
  );
}

export function initialCompanyServiceBilling(
  packageId: MarketingPackageId | string,
  options?: Partial<CompanyServiceOptions> | null,
): CompanyServiceBillingState {
  const activePackageId = currentPackageId(packageId);
  return {
    status: "pending_payment",
    activePackageId,
    serviceOptions: normaliseCompanyServiceOptions(activePackageId, options),
  };
}

export function packageChangeKind(
  from: MarketingPackageId | string,
  to: MarketingPackageId | string,
): "upgrade" | "downgrade" | "same" {
  const delta = PACKAGE_RANK[currentPackageId(to)] - PACKAGE_RANK[currentPackageId(from)];
  if (delta > 0) return "upgrade";
  if (delta < 0) return "downgrade";
  return "same";
}

export function requestPackageChange(
  state: CompanyServiceBillingState,
  requested: MarketingPackageId | string,
  nowIso: string,
): CompanyServiceBillingState {
  const pendingPackageId = currentPackageId(requested);
  const kind = packageChangeKind(state.activePackageId, pendingPackageId);
  if (kind === "same") return state;
  return {
    ...state,
    pendingTransitionId: randomUUID(),
    pendingPackageId,
    pendingChangeKind: kind,
    pendingEffectiveAt:
      kind === "downgrade" ? state.currentPeriodEnd ?? nowIso : nowIso,
  };
}

export function applyServiceOptionsEdit(
  state: CompanyServiceBillingState,
  packageId: MarketingPackageId | string,
  options: Partial<CompanyServiceOptions>,
  nowIso = new Date().toISOString(),
): CompanyServiceBillingState {
  const pendingPackageId = currentPackageId(packageId);
  const requested = normaliseCompanyServiceOptions(pendingPackageId, options);
  const current = normaliseCompanyServiceOptions(state.activePackageId, state.serviceOptions);
  if (JSON.stringify(requested) === JSON.stringify(current) && !state.pendingPackageId) {
    return state;
  }
  const packageKind = packageChangeKind(state.activePackageId, pendingPackageId);
  const currentMonthly = monthlyServiceOptionsAud(state.activePackageId, current);
  const requestedMonthly = monthlyServiceOptionsAud(pendingPackageId, requested);
  const removesRecurring =
    (current.searchVisibility && !requested.searchVisibility) ||
    (current.websitePublishing && !requested.websitePublishing) ||
    (current.hostedLandingPage && !requested.hostedLandingPage);
  const addsRecurring =
    (!current.searchVisibility && requested.searchVisibility) ||
    (!current.websitePublishing && requested.websitePublishing) ||
    (!current.hostedLandingPage && requested.hostedLandingPage);
  const pendingChangeKind =
    packageKind === "upgrade"
      ? "upgrade"
      : packageKind === "downgrade"
        ? "downgrade"
        : addsRecurring && removesRecurring
          ? "mixed"
          : requestedMonthly > currentMonthly
            ? "options_upgrade"
            : "options_downgrade";
  const deferred = ["downgrade", "options_downgrade", "mixed"].includes(
    pendingChangeKind,
  );
  return {
    ...state,
    pendingTransitionId: randomUUID(),
    pendingPackageId,
    pendingServiceOptions: requested,
    pendingChangeKind,
    pendingEffectiveAt: deferred ? state.currentPeriodEnd ?? nowIso : nowIso,
  };
}

export function applyInvoicePaymentSucceeded(
  state: CompanyServiceBillingState,
  paidAt: string,
  periodEnd?: string,
): CompanyServiceBillingState {
  const activatePending =
    state.pendingChangeKind === "upgrade" ||
    state.pendingChangeKind === "options_upgrade" ||
    (Boolean(state.pendingChangeKind) &&
      Boolean(
        state.pendingEffectiveAt &&
          Date.parse(state.pendingEffectiveAt) <= Date.parse(paidAt),
      ));
  const activePackageId =
    activatePending && state.pendingPackageId
      ? state.pendingPackageId
      : state.activePackageId;
  return {
    ...state,
    status: state.cancelAtPeriodEnd ? "cancel_at_period_end" : "active",
    activePackageId,
    serviceOptions: normaliseCompanyServiceOptions(
      activePackageId,
      activatePending
        ? state.pendingServiceOptions ?? state.serviceOptions
        : state.serviceOptions,
    ),
    currentPeriodEnd: periodEnd ?? state.currentPeriodEnd,
    lastPaidAt: paidAt,
    failedPaymentAt: undefined,
    graceEndsAt: undefined,
    pausedAt: undefined,
    ...(activatePending
      ? {
          pendingPackageId: undefined,
          pendingTransitionId: undefined,
          pendingServiceOptions: undefined,
          pendingChangeKind: undefined,
          pendingEffectiveAt: undefined,
        }
      : {}),
  };
}

export function applyInvoicePaymentFailed(
  state: CompanyServiceBillingState,
  failedAt: string,
): CompanyServiceBillingState {
  if (state.status === "paused") return state;
  const firstFailedAt = state.failedPaymentAt ?? failedAt;
  const graceEndsAt = new Date(
    Date.parse(firstFailedAt) + FAILED_PAYMENT_GRACE_DAYS * 86_400_000,
  ).toISOString();
  return {
    ...state,
    status: "past_due_grace",
    failedPaymentAt: firstFailedAt,
    graceEndsAt,
  };
}

export function refreshFailedPaymentPause(
  state: CompanyServiceBillingState,
  nowIso: string,
): CompanyServiceBillingState {
  if (
    state.status !== "past_due_grace" ||
    !state.graceEndsAt ||
    Date.parse(nowIso) < Date.parse(state.graceEndsAt)
  ) {
    return state;
  }
  return { ...state, status: "paused", pausedAt: nowIso };
}

export function serviceOperationsAllowed(
  state: CompanyServiceBillingState | undefined,
  nowIso = new Date().toISOString(),
): boolean {
  if (!state) return false;
  const refreshed = refreshFailedPaymentPause(state, nowIso);
  if (refreshed.status === "active" || refreshed.status === "cancel_at_period_end") {
    return true;
  }
  return (
    refreshed.status === "past_due_grace" &&
    Boolean(refreshed.graceEndsAt) &&
    Number.isFinite(Date.parse(refreshed.graceEndsAt!)) &&
    Date.parse(nowIso) < Date.parse(refreshed.graceEndsAt!)
  );
}

export function isCurrentServiceSubscriptionEvent(
  state: CompanyServiceBillingState,
  incomingSubscriptionId: string | undefined,
): boolean {
  return Boolean(
    state.stripeSubscriptionId &&
      incomingSubscriptionId === state.stripeSubscriptionId,
  );
}

export function checkoutMatchesPendingServiceTransition(
  state: CompanyServiceBillingState,
  metadata: {
    packageId?: string;
    pendingTransitionId?: string;
    pendingChangeKind?: string;
    pendingEffectiveAt?: string;
  },
): boolean {
  if (
    !metadata.packageId ||
    !["starter", "growth", "managed", "basic", "pro", "blast", "custom"].includes(
      metadata.packageId,
    )
  ) return false;
  const expectedPackage =
    state.pendingPackageId ??
    (state.status === "pending_payment" ? state.activePackageId : undefined);
  return Boolean(
    expectedPackage &&
      currentPackageId(metadata.packageId) === expectedPackage &&
      (!state.pendingTransitionId ||
        metadata.pendingTransitionId === state.pendingTransitionId) &&
      (!state.pendingChangeKind ||
        metadata.pendingChangeKind === state.pendingChangeKind) &&
      (!state.pendingEffectiveAt ||
        metadata.pendingEffectiveAt === state.pendingEffectiveAt),
  );
}
