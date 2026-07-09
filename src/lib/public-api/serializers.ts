import type { Company, ContentItem, Lead } from "@/lib/types";

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
