// Privacy DSR helpers — marketing-use gate for contacts under consent /
// suppression / active restriction requests. Fail closed.

import { listPrivacyRequestsForCompany } from "@/lib/db";
import type { CrmConsentStatus, CrmContact, PrivacyRequest } from "@/lib/types";

/** Minimal contact shape accepted by the marketing-use gate. */
export type MarketingContactLike = {
  id?: string;
  companyId: string;
  email?: string;
  phone?: string;
  consentStatus?: CrmConsentStatus | string;
  tags?: string[];
};

const ACTIVE_RESTRICTION_STATUSES = new Set(["pending", "in_progress"]);

export function isOptedOut(contact: MarketingContactLike): boolean {
  const status = (contact.consentStatus ?? "").toLowerCase();
  return status === "unsubscribed" || status === "opted_out";
}

export function isSuppressed(contact: MarketingContactLike): boolean {
  const tags = contact.tags ?? [];
  return tags.some((t) => t.toLowerCase() === "suppressed");
}

export function subjectMatchesRequest(
  contact: MarketingContactLike,
  req: PrivacyRequest,
): boolean {
  const ref = req.subjectRef.trim().toLowerCase();
  if (!ref) return false;
  if (contact.id && contact.id.toLowerCase() === ref) return true;
  if (contact.email && contact.email.toLowerCase() === ref) return true;
  if (contact.phone && contact.phone.replace(/\s+/g, "") === ref.replace(/\s+/g, "")) {
    return true;
  }
  return false;
}

export async function hasActiveRestriction(
  contact: MarketingContactLike,
): Promise<boolean> {
  const rows = await listPrivacyRequestsForCompany(contact.companyId);
  return rows.some(
    (r) =>
      r.requestType === "restriction" &&
      ACTIVE_RESTRICTION_STATUSES.has(r.status) &&
      subjectMatchesRequest(contact, r),
  );
}

/**
 * Fail-closed gate for outbound marketing (email/SMS). Throws a clear error
 * when the contact is opted out, suppressed, or under an active restriction DSR.
 */
export async function assertMarketingUseAllowed(
  contact: MarketingContactLike,
): Promise<void> {
  if (isOptedOut(contact)) {
    throw new Error(
      "Marketing use blocked: contact has opted out (consent withdrawn).",
    );
  }
  if (isSuppressed(contact)) {
    throw new Error(
      "Marketing use blocked: contact is on the suppression list.",
    );
  }
  if (await hasActiveRestriction(contact)) {
    throw new Error(
      "Marketing use blocked: active privacy restriction request for this subject.",
    );
  }
}

export async function isMarketingUseAllowed(
  contact: MarketingContactLike,
): Promise<boolean> {
  try {
    await assertMarketingUseAllowed(contact);
    return true;
  } catch {
    return false;
  }
}

export function contactToMarketingLike(c: CrmContact): MarketingContactLike {
  return {
    id: c.id,
    companyId: c.companyId,
    email: c.email,
    phone: c.phone,
    consentStatus: c.consentStatus,
    tags: c.tags,
  };
}
