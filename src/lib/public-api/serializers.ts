import type { Campaign, Company, CompanyReview, ContentItem, Lead, Reservation } from "@/lib/types";

export function serializeCompany(c: Company) {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    industry: c.profile.industry,
    serviceAreas: c.profile.serviceAreas,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function serializeContent(item: ContentItem) {
  return {
    id: item.id,
    companyId: item.companyId,
    type: item.type,
    title: item.title,
    body: item.body,
    status: item.status,
    createdById: item.createdById,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function serializeLead(lead: Lead) {
  return {
    id: lead.id,
    companyId: lead.companyId,
    platform: lead.platform,
    contact: lead.contact,
    source: lead.source,
    status: lead.status,
    valueUsd: lead.valueUsd,
    capturedAt: lead.capturedAt,
  };
}

export function serializeCampaign(campaign: Campaign) {
  return {
    id: campaign.id,
    companyId: campaign.companyId,
    name: campaign.name,
    objective: campaign.objective,
    audience: campaign.audience,
    serviceFocus: campaign.serviceFocus,
    channels: campaign.channels,
    durationDays: campaign.durationDays,
    startDate: campaign.startDate,
    offerId: campaign.offerId,
    eventName: campaign.eventName,
    eventDate: campaign.eventDate,
    keyMessage: campaign.keyMessage,
    status: campaign.status,
    requestId: campaign.requestId,
    createdById: campaign.createdById,
    approvedById: campaign.approvedById,
    approvedAt: campaign.approvedAt,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
  };
}

export function serializeReservation(reservation: Reservation) {
  return {
    id: reservation.id,
    companyId: reservation.companyId,
    servicePeriodId: reservation.servicePeriodId,
    status: reservation.status,
    guestName: reservation.guestName,
    guestEmail: reservation.guestEmail,
    guestPhone: reservation.guestPhone,
    partySize: reservation.partySize,
    scheduledAt: reservation.scheduledAt,
    notes: reservation.notes,
    confirmationMode: reservation.confirmationMode,
    createdAt: reservation.createdAt,
    updatedAt: reservation.updatedAt,
  };
}

export function serializeReview(review: CompanyReview) {
  return {
    id: review.id,
    companyId: review.companyId,
    platform: review.platform,
    externalId: review.externalId,
    authorName: review.authorName,
    rating: review.rating,
    body: review.body,
    reviewedAt: review.reviewedAt,
    sentiment: review.sentiment,
    topics: review.topics,
    urgency: review.urgency,
    escalationRequired: review.escalationRequired,
    status: review.status,
    publishedResponse: review.publishedResponse,
    importedAt: review.importedAt,
    respondedAt: review.respondedAt,
  };
}
