/**
 * Durable map of client-scoped activity surfaces.
 * Agency: deep-link into ?company= module hubs (or company subroutes).
 * Client: portal routes the client is allowed to see (no agency admin tools).
 */

export type ActivityHubId =
  | "overview"
  | "strategy"
  | "content"
  | "campaigns"
  | "calendar"
  | "approvals"
  | "publishing"
  | "channels"
  | "ads"
  | "asks"
  | "extra_work"
  | "package"
  | "audit"
  | "assets"
  | "reports"
  | "profile"
  | "payment_method"
  | "invoices"
  | "value_add";

export type ActivityHub = {
  id: ActivityHubId;
  label: string;
  blurb: string;
  href: string;
};

/** Agency company account — work for this client lives here (or via ?company=). */
export function agencyCompanyActivityHubs(companyId: string): ActivityHub[] {
  const q = `company=${companyId}`;
  const base = `/companies/${companyId}`;
  return [
    {
      id: "strategy",
      label: "Strategy",
      blurb: "Package plan and delivery cadence",
      href: `${base}/strategy`,
    },
    {
      id: "package",
      label: "Marketing package",
      blurb: "SKU, price tier, and service level",
      href: `${base}#package-service`,
    },
    {
      id: "content",
      label: "Content",
      blurb: "Drafts and library for this client",
      href: `/content?${q}`,
    },
    {
      id: "campaigns",
      label: "Campaigns",
      blurb: "Campaign packs and items",
      href: `/campaigns?${q}`,
    },
    {
      id: "calendar",
      label: "Calendar",
      blurb: "Scheduled posts and look-ahead",
      href: `/calendar?${q}`,
    },
    {
      id: "approvals",
      label: "Approvals",
      blurb: "Agency and client review queues",
      href: `/approvals?${q}`,
    },
    {
      id: "publishing",
      label: "Publishing",
      blurb: "Queue, retries, and connections",
      href: `/publishing?${q}`,
    },
    {
      id: "asks",
      label: "Client asks",
      blurb: "Requests and messages for this client",
      href: `/requests?${q}`,
    },
    {
      id: "extra_work",
      label: "Extra work / promos",
      blurb: "Promo requests and catalog markup",
      href: `${base}#extra-work`,
    },
    {
      id: "channels",
      label: "Channels",
      blurb: "Inbox, social, reviews, analytics",
      href: `/inbox?${q}`,
    },
    {
      id: "ads",
      label: "Paid ads",
      blurb: "Delegated budgets and campaigns",
      href: `/ads?${q}`,
    },
    {
      id: "audit",
      label: "Audit trail",
      blurb: "Material actions for this client",
      href: `/audit?${q}`,
    },
  ];
}

/**
 * Client portal — same client account, client-safe surfaces only.
 * No studio, AI budgets, governance editors, or tenant settings.
 */
export function clientPortalActivityHubs(): ActivityHub[] {
  return [
    {
      id: "profile",
      label: "Profile",
      blurb: "Business details and contacts",
      href: "/client/profile",
    },
    {
      id: "strategy",
      label: "Strategy",
      blurb: "Your package-based marketing plan",
      href: "/client/strategy",
    },
    {
      id: "calendar",
      label: "Schedule",
      blurb: "Upcoming posts and calendar",
      href: "/client/calendar",
    },
    {
      id: "content",
      label: "Content status",
      blurb: "What is in review, approved, or live",
      href: "/client/content",
    },
    {
      id: "approvals",
      label: "Approvals",
      blurb: "Drafts waiting on your review",
      href: "/client/approvals",
    },
    {
      id: "payment_method",
      label: "Payment method",
      // PLACEHOLDER: Stripe Customer Portal deep-link once billing portal is live.
      blurb: "Card on file via Stripe (coming soon)",
      href: "/client/payments#payment-method",
    },
    {
      id: "invoices",
      label: "Invoices",
      blurb: "Tax invoices and payment history",
      href: "/client/payments#invoices",
    },
    {
      id: "package",
      label: "Package & billing",
      blurb: "Plan, credit, and invoices",
      href: "/client/account",
    },
    {
      id: "asks",
      label: "Ask us",
      blurb: "Messages and requests to the agency",
      href: "/client/requests",
    },
    {
      id: "extra_work",
      label: "Extra work",
      blurb: "Promos and custom work requests",
      href: "/client/account#extra-work",
    },
    {
      id: "reports",
      label: "Results",
      blurb: "Leads and performance snapshot",
      href: "/client/reports",
    },
    {
      id: "assets",
      label: "Files",
      blurb: "Assets you have shared with us",
      href: "/client/assets",
    },
  ];
}
