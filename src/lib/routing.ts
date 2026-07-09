// Approval routing (Phase 3, master prompt §26).
//
// Routes each content item to the right approval queue based on content type,
// risk level, evidence status and consent involvement. With the Phase 1-3 role
// model (admin / super_admin), "senior" and "compliance" routes require the
// super admin; the full 10-role structure arrives in later phases.

import type {
  ApprovalRoute,
  ComplianceResult,
  ContentItem,
  RequestConsent,
  User,
} from "@/lib/types";

export function routeContent(args: {
  type: ContentItem["type"];
  compliance?: ComplianceResult;
  claimAudit?: ContentItem["claimAudit"];
  consent?: RequestConsent | null;
}): ApprovalRoute {
  const risk = args.compliance?.riskLevel ?? "low";
  const hasUnsupported = (args.claimAudit ?? []).some(
    (c) => c.status === "unsupported",
  );
  const consentInvolved =
    !!args.consent && (args.consent.customerNamed || args.consent.customerInPhotos);

  // High-risk / evidence / consent material goes to compliance review (§26).
  if (
    risk === "critical" ||
    risk === "high" ||
    hasUnsupported ||
    args.compliance?.requiresEvidence ||
    consentInvolved
  ) {
    return "compliance";
  }
  // Paid ads require senior approval.
  if (args.type === "ad_copy") return "senior";
  // Website content requires the company manager or admin (P5 types included).
  if (
    ["landing_page", "blog_article", "website_copy", "faq", "seo_meta"].includes(
      args.type,
    )
  ) {
    return "company_admin";
  }
  return "admin";
}

export const ROUTE_LABEL: Record<ApprovalRoute, string> = {
  admin: "Standard approval",
  company_admin: "Company manager approval",
  senior: "Senior approval",
  compliance: "Compliance review",
};

// Who may approve a given route under the Phase 1-3 role model.
export function canApproveRoute(user: User, route: ApprovalRoute): boolean {
  if (route === "senior" || route === "compliance") {
    return user.role === "super_admin";
  }
  return user.role === "admin" || user.role === "super_admin";
}

// T6 — which routes an external CLIENT (no login) may give FINAL approval on.
// Senior (paid ads) and compliance (high-risk / unsupported claims / consent)
// stay with internal staff: a client link can never clear those, so the
// tokenised approval is not a governance bypass. Everyday + website content
// (the agency's normal client-facing work) can be finalized by the client.
export function canClientApproveRoute(route: ApprovalRoute): boolean {
  return route === "admin" || route === "company_admin";
}
