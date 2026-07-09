// Knowledge gap detector (Phase 2, master prompt §51).
//
// Before drafting, the system checks whether it has enough approved
// information to draft safely. Blocking gaps stop generation and open an
// "Ask the Local Manager" workflow: structured questions attached to the
// request that the requester answers before drafting can proceed.

import {
  listEvidence,
  listKnowledgeDocs,
  listServices,
  liveOffers,
  validConsents,
} from "@/lib/db";
import type { Company, MarketingRequest } from "@/lib/types";

export interface DetectedGap {
  question: string;
  context?: string;
  blocking: boolean;
}

export async function detectGaps(
  company: Company,
  request: MarketingRequest,
): Promise<DetectedGap[]> {
  const gaps: DetectedGap[] = [];
  const consent = request.consent;
  const evidence = await listEvidence(company.id);
  const services = await listServices(company.id);
  const docs = await listKnowledgeDocs(company.id);

  // Customer named/shown → consent must be confirmed on the request AND a
  // valid Consent Register record must exist.
  if (
    (consent.customerNamed || consent.customerInPhotos) &&
    (!consent.consentObtained || (await validConsents(company.id)).length === 0)
  ) {
    gaps.push({
      question:
        "A customer or person is named or shown in this request, but consent is not confirmed with a valid record in the Consent Register. Who is shown, and can you upload their signed consent?",
      context: "Consent must be on file before this material can be used.",
      blocking: true,
    });
  }

  // Pricing mentioned → an approved pricing source must exist.
  const hasPricingSource =
    evidence.some((e) => e.evidenceType === "pricing") ||
    services.some((s) => s.priceApproved);
  if (consent.mentionsPricing && !hasPricingSource) {
    gaps.push({
      question:
        "This request mentions pricing, but there is no approved pricing source on file (Evidence Locker or approved service price). What is the approved pricing, and where is it documented?",
      blocking: true,
    });
  }

  // Performance claims → outcome/comparison evidence must exist.
  const hasOutcomeEvidence = evidence.some(
    (e) => e.evidenceType === "customer_outcome" || e.evidenceType === "comparison",
  );
  if (consent.performanceClaims && !hasOutcomeEvidence) {
    gaps.push({
      question:
        "This request makes performance claims, but no supporting evidence is in the Evidence Locker. What proof supports the claim?",
      blocking: true,
    });
  }

  // Offer mentioned → an actual live offer must exist somewhere (Offer
  // Manager, the request itself, or the legacy profile field).
  if (
    consent.mentionsOffer &&
    !request.offer?.trim() &&
    (await liveOffers(company.id)).length === 0 &&
    !company.profile.currentOffers?.trim()
  ) {
    gaps.push({
      question:
        "This request mentions an offer, but no offer details were provided and the company has no live approved offer. What exactly is the offer, including any end date and conditions?",
      blocking: true,
    });
  }

  // Advisory (non-blocking) gaps.
  if (docs.length === 0) {
    gaps.push({
      question:
        "This company has no approved source documents in its Brand Brain. Drafts will be less grounded — can you add website copy, brochures or FAQs?",
      blocking: false,
    });
  }
  if (!company.profile.approvalContact?.trim()) {
    gaps.push({
      question: "Who is the approval contact for this company?",
      blocking: false,
    });
  }

  return gaps;
}
