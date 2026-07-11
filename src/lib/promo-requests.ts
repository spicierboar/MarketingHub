// Request a ready-made promo: client sets package price, start date, channels;
// template markup applies; spawns a draft campaign (never published).

import { logAction } from "@/lib/audit";
import {
  createCampaign,
  createCampaignItem,
  getCompany,
  getTenant,
  updateCompany,
} from "@/lib/db";
import {
  addDaysIso,
  campaignItemInputsFromOutlines,
  computePromoPricing,
  filterOutlinesForChannels,
  resolvePromoTemplate,
  resolvePromoMarkupPercent,
  templatesForCompany,
} from "@/lib/promo-catalog";
import type {
  ActingUser,
  ClientPromoSelection,
  Company,
} from "@/lib/types";
import { id, now } from "@/lib/utils";

export function listOpenPromoSelections(company: Company): ClientPromoSelection[] {
  return (company.profile.promoSelections ?? []).filter(
    (s) => s.status === "requested" || s.status === "on_calendar" || s.status === "in_delivery",
  );
}

export function selectionsNotOnCalendar(company: Company): ClientPromoSelection[] {
  return (company.profile.promoSelections ?? []).filter(
    (s) => s.status === "requested",
  );
}

export async function requestClientPromo(input: {
  companyId: string;
  user: ActingUser;
  templateId: string;
  startDate: string;
  endDate?: string;
  budgetUsd: number;
  channels: string[];
  notes?: string;
}): Promise<{ selection: ClientPromoSelection; campaignId: string }> {
  const company = await getCompany(input.companyId);
  if (!company) throw new Error("Company not found");
  if (company.tenantId !== input.user.tenantId) throw new Error("Access denied");

  const tenant = await getTenant(company.tenantId);
  const agencyCatalog = tenant?.promoCatalog;
  const template = resolvePromoTemplate(input.templateId, agencyCatalog);
  if (!template) throw new Error("Promotion template not found");

  const allowed = new Set(templatesForCompany(company, agencyCatalog).map((t) => t.id));
  if (!allowed.has(template.id)) {
    throw new Error("This promotion is not available for your business type.");
  }

  const channels = input.channels
    .map((c) => c.trim().toLowerCase())
    .filter((c) => template.availableChannels.includes(c));
  if (channels.length === 0) {
    throw new Error("Choose at least one social channel.");
  }

  const startDate = input.startDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    throw new Error("Start date is required.");
  }
  const endDate =
    (input.endDate ?? "").slice(0, 10) ||
    addDaysIso(startDate, template.defaultDurationDays);
  if (endDate < startDate) throw new Error("End date must be on or after the start date.");

  const clientPriceUsd = Number(input.budgetUsd);
  if (!Number.isFinite(clientPriceUsd) || clientPriceUsd < 50) {
    throw new Error("Package price must be at least $50.");
  }

  const markupPercent = resolvePromoMarkupPercent(company, template);
  const pricing = computePromoPricing(clientPriceUsd, markupPercent);
  const outlines = filterOutlinesForChannels(template, channels);
  const durationDays = Math.max(
    1,
    Math.ceil(
      (new Date(`${endDate}T12:00:00Z`).getTime() -
        new Date(`${startDate}T12:00:00Z`).getTime()) /
        86_400_000,
    ),
  );
  const campaignDuration: 30 | 90 = durationDays > 45 ? 90 : 30;

  const campaign = await createCampaign({
    companyId: company.id,
    name: template.name,
    objective: template.objective,
    audience: company.profile.targetCustomers,
    channels,
    durationDays: campaignDuration,
    startDate,
    endDate,
    keyMessage: template.keyMessage,
    status: "draft",
    createdById: input.user.id,
    campaignType: "seasonal",
    description: `Client promo pick · ${template.blurb}`,
    budgetAmount: pricing.budgetUsd,
    currency: "AUD",
    priority: "medium",
    layerMeta: {
      source: "client_promo_catalog",
      templateId: template.id,
      markupPercent: pricing.markupPercent,
      feeUsd: pricing.feeUsd,
      totalUsd: pricing.totalUsd,
      assumptions: [
        "Client chose package price, start date, and channels from a ready-made template.",
        "Posts, hashtags, and CTAs are pre-written; markup is built into the package price.",
      ],
      promotion: template.promotion,
    },
  });

  for (const item of campaignItemInputsFromOutlines(outlines, {
    campaignId: campaign.id,
    companyId: company.id,
    keyMessage: template.keyMessage,
  })) {
    await createCampaignItem(item);
  }

  const selection: ClientPromoSelection = {
    id: id("promo"),
    templateId: template.id,
    templateName: template.name,
    industry: template.industry,
    status: "requested",
    startDate,
    endDate,
    budgetUsd: pricing.budgetUsd,
    markupPercent: pricing.markupPercent,
    feeUsd: pricing.feeUsd,
    totalUsd: pricing.totalUsd,
    channels,
    campaignId: campaign.id,
    requestedById: input.user.id,
    requestedAt: now(),
    ...(input.notes?.trim() ? { notes: input.notes.trim().slice(0, 500) } : {}),
  };

  const prev = company.profile.promoSelections ?? [];
  await updateCompany(company.id, {
    profile: {
      ...company.profile,
      promoSelections: [selection, ...prev].slice(0, 40),
    },
  });

  await logAction(input.user, "promo.client_requested", {
    targetType: "campaign",
    targetId: campaign.id,
    companyId: company.id,
    detail: `${template.name} · budget $${pricing.budgetUsd} + fee $${pricing.feeUsd} · ${channels.join(",")}`,
  });

  return { selection, campaignId: campaign.id };
}

/** Agency marks a promo as placed on the strategy calendar. */
export async function markPromoOnCalendar(input: {
  companyId: string;
  selectionId: string;
  user: ActingUser;
}): Promise<ClientPromoSelection> {
  const company = await getCompany(input.companyId);
  if (!company) throw new Error("Company not found");
  const list = [...(company.profile.promoSelections ?? [])];
  const idx = list.findIndex((s) => s.id === input.selectionId);
  if (idx < 0) throw new Error("Promo selection not found");
  const updated: ClientPromoSelection = {
    ...list[idx],
    status: "on_calendar",
  };
  list[idx] = updated;
  await updateCompany(company.id, {
    profile: { ...company.profile, promoSelections: list },
  });
  await logAction(input.user, "promo.marked_on_calendar", {
    targetType: "campaign",
    targetId: updated.campaignId ?? updated.id,
    companyId: company.id,
    detail: updated.templateName,
  });
  return updated;
}
