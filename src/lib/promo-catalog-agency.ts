// Agency CRUD for tenant-scoped promo catalog entries (customs + platform overrides).

import { logAction } from "@/lib/audit";
import { getTenant, updateTenant } from "@/lib/db";
import {
  PROMO_CHANNEL_OPTIONS,
  PROMO_INDUSTRY_OPTIONS,
  getPromoTemplate,
  isPlatformPromoId,
  type PromoTemplate,
} from "@/lib/promo-catalog";
import type {
  ActingUser,
  AgencyPromoPost,
  AgencyPromoTemplate,
  PromoIndustry,
} from "@/lib/types";
import { id, now } from "@/lib/utils";

const INDUSTRY_IDS = new Set(PROMO_INDUSTRY_OPTIONS.map((o) => o.id));
const CHANNEL_IDS = new Set(PROMO_CHANNEL_OPTIONS.map((c) => c.id));

export type PromoTemplateFormInput = {
  user: ActingUser;
  /** When set: update custom or upsert platform override with this id. */
  templateId?: string;
  industry: string;
  name: string;
  promotion: string;
  blurb?: string;
  defaultDurationDays: number;
  ongoing?: boolean;
  suggestedClientPriceUsd: number;
  markupPercent: number;
  channels: string[];
  objective: string;
  keyMessage: string;
  postTitles: string[];
  postCaptions: string[];
  postHashtags: string[];
  postCtas: string[];
  postChannels: string[];
  postDayOffsets: number[];
};

function parseChannels(raw: string[]): string[] {
  return [...new Set(raw.map((c) => c.trim().toLowerCase()).filter((c) => CHANNEL_IDS.has(c)))];
}

function parsePosts(input: {
  titles: string[];
  captions: string[];
  hashtags: string[];
  ctas: string[];
  channels: string[];
  dayOffsets: number[];
}): AgencyPromoPost[] {
  const posts: AgencyPromoPost[] = [];
  for (let i = 0; i < input.titles.length; i++) {
    const title = (input.titles[i] ?? "").trim();
    const caption = (input.captions[i] ?? "").trim();
    if (!title || !caption) continue;
    const channel = (input.channels[i] ?? "instagram").trim().toLowerCase();
    const dayOffset = Number(input.dayOffsets[i]);
    posts.push({
      dayOffset: Number.isFinite(dayOffset) && dayOffset >= 1 ? Math.floor(dayOffset) : i + 1,
      channel: CHANNEL_IDS.has(channel) ? channel : "instagram",
      contentType: channel === "email" ? "email_newsletter" : "social_post",
      title: title.slice(0, 120),
      caption: caption.slice(0, 2200),
      hashtags: (input.hashtags[i] ?? "").trim().slice(0, 400),
      cta: (input.ctas[i] ?? "").trim().slice(0, 200),
    });
  }
  return posts;
}

function parseTemplateBody(input: PromoTemplateFormInput): Omit<
  AgencyPromoTemplate,
  "id" | "active" | "source" | "createdById" | "createdAt" | "updatedAt"
> {
  const industry = input.industry as PromoIndustry;
  if (!INDUSTRY_IDS.has(industry)) throw new Error("Choose a valid industry.");

  const name = input.name.trim().slice(0, 120);
  const promotion = input.promotion.trim().slice(0, 200);
  if (!name || !promotion) throw new Error("Name and promotion are required.");

  const duration = Math.max(1, Math.min(90, Math.floor(input.defaultDurationDays) || 14));
  const price = Number(input.suggestedClientPriceUsd);
  if (!Number.isFinite(price) || price < 50) {
    throw new Error("Client price must be at least $50.");
  }
  let markup = Number(input.markupPercent);
  if (markup > 1) markup = markup / 100;
  if (!Number.isFinite(markup) || markup < 0 || markup > 0.9) {
    throw new Error("Markup must be between 0% and 90%.");
  }

  const channels = parseChannels(input.channels);
  if (channels.length === 0) throw new Error("Choose at least one channel.");

  const outlines = parsePosts({
    titles: input.postTitles,
    captions: input.postCaptions,
    hashtags: input.postHashtags,
    ctas: input.postCtas,
    channels: input.postChannels,
    dayOffsets: input.postDayOffsets,
  });
  if (outlines.length < 3) {
    throw new Error("Add at least 3 ready-to-publish posts (title + caption).");
  }
  if (outlines.length > 5) {
    throw new Error("Maximum 5 posts per campaign.");
  }

  return {
    industry,
    name,
    promotion,
    ...(input.blurb?.trim() ? { blurb: input.blurb.trim().slice(0, 400) } : {}),
    defaultDurationDays: duration,
    ...(input.ongoing ? { ongoing: true } : {}),
    suggestedClientPriceUsd: Math.round(price * 100) / 100,
    markupPercent: Math.round(markup * 1000) / 1000,
    defaultChannels: channels.slice(0, 4),
    availableChannels: channels,
    objective: input.objective.trim().slice(0, 300) || `Drive results with ${name}`,
    keyMessage: input.keyMessage.trim().slice(0, 300) || promotion,
    outlines,
  };
}

export function promoTemplateToAgencyDraft(
  t: PromoTemplate,
  meta: {
    userId: string;
    stamp: string;
    source: "custom" | "platform_override";
    active?: boolean;
    existing?: AgencyPromoTemplate | null;
  },
): AgencyPromoTemplate {
  return {
    id: t.id,
    industry: t.industry,
    name: t.name,
    promotion: t.promotion,
    blurb: t.blurb,
    defaultDurationDays: t.defaultDurationDays,
    ...(t.ongoing ? { ongoing: true } : {}),
    suggestedClientPriceUsd: t.suggestedClientPriceUsd,
    markupPercent: t.markupPercent,
    defaultChannels: t.defaultChannels,
    availableChannels: t.availableChannels,
    objective: t.objective,
    keyMessage: t.keyMessage,
    outlines: t.outlines.map((o) => ({
      dayOffset: o.dayOffset,
      channel: o.channel,
      contentType: o.contentType,
      title: o.title,
      caption: o.caption,
      hashtags: o.hashtags,
      cta: o.cta,
    })),
    active: meta.active ?? meta.existing?.active ?? true,
    source: meta.source,
    createdById: meta.existing?.createdById ?? meta.userId,
    createdAt: meta.existing?.createdAt ?? meta.stamp,
    updatedAt: meta.stamp,
  };
}

async function writeCatalog(
  tenantId: string,
  catalog: AgencyPromoTemplate[],
): Promise<void> {
  await updateTenant(tenantId, { promoCatalog: catalog.slice(0, 80) });
}

/** Create a custom campaign, or upsert when templateId is set (edit / platform override). */
export async function saveAgencyPromoTemplate(
  input: PromoTemplateFormInput,
): Promise<AgencyPromoTemplate> {
  const body = parseTemplateBody(input);
  const stamp = now();
  const tenant = await getTenant(input.user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");
  const prev = [...(tenant.promoCatalog ?? [])];

  const templateId = input.templateId?.trim();
  if (templateId) {
    const idx = prev.findIndex((t) => t.id === templateId);
    const existing = idx >= 0 ? prev[idx] : null;
    const isPlatform = isPlatformPromoId(templateId);
    if (!existing && !isPlatform) {
      throw new Error("Promo template not found.");
    }
    const saved: AgencyPromoTemplate = {
      ...body,
      id: templateId,
      active: existing?.active ?? true,
      source: isPlatform ? "platform_override" : existing?.source ?? "custom",
      createdById: existing?.createdById ?? input.user.id,
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    };
    if (idx >= 0) prev[idx] = saved;
    else prev.unshift(saved);
    await writeCatalog(input.user.tenantId, prev);
    await logAction(
      input.user,
      isPlatform ? "promo.platform_override_saved" : "promo.agency_template_updated",
      {
        targetType: "tenant",
        targetId: input.user.tenantId,
        detail: `${saved.name} · ${saved.industry}`,
      },
    );
    return saved;
  }

  const created: AgencyPromoTemplate = {
    ...body,
    id: id("apromo"),
    active: true,
    source: "custom",
    createdById: input.user.id,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await writeCatalog(input.user.tenantId, [created, ...prev]);
  await logAction(input.user, "promo.agency_template_created", {
    targetType: "tenant",
    targetId: input.user.tenantId,
    detail: `${created.name} · ${created.industry} · $${created.suggestedClientPriceUsd}`,
  });
  return created;
}

/** @deprecated use saveAgencyPromoTemplate */
export async function createAgencyPromoTemplate(
  input: Omit<PromoTemplateFormInput, "templateId">,
): Promise<AgencyPromoTemplate> {
  return saveAgencyPromoTemplate(input);
}

export async function setAgencyPromoTemplateActive(input: {
  user: ActingUser;
  templateId: string;
  active: boolean;
}): Promise<AgencyPromoTemplate> {
  const tenant = await getTenant(input.user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");
  const list = [...(tenant.promoCatalog ?? [])];
  let idx = list.findIndex((t) => t.id === input.templateId);

  // Hiding/showing a built-in that has no override yet → clone then set active.
  if (idx < 0 && isPlatformPromoId(input.templateId)) {
    const platform = getPromoTemplate(input.templateId);
    if (!platform) throw new Error("Promo template not found.");
    const stamp = now();
    const cloned = promoTemplateToAgencyDraft(platform, {
      userId: input.user.id,
      stamp,
      source: "platform_override",
      active: input.active,
    });
    list.unshift(cloned);
    await writeCatalog(input.user.tenantId, list);
    await logAction(
      input.user,
      input.active ? "promo.agency_template_activated" : "promo.agency_template_deactivated",
      {
        targetType: "tenant",
        targetId: input.user.tenantId,
        detail: cloned.name,
      },
    );
    return cloned;
  }

  if (idx < 0) throw new Error("Agency promo template not found.");
  const updated: AgencyPromoTemplate = {
    ...list[idx],
    active: input.active,
    updatedAt: now(),
  };
  list[idx] = updated;
  await writeCatalog(input.user.tenantId, list);
  await logAction(
    input.user,
    input.active ? "promo.agency_template_activated" : "promo.agency_template_deactivated",
    {
      targetType: "tenant",
      targetId: input.user.tenantId,
      detail: updated.name,
    },
  );
  return updated;
}

export async function deleteAgencyPromoTemplate(input: {
  user: ActingUser;
  templateId: string;
}): Promise<void> {
  const tenant = await getTenant(input.user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");
  const list = (tenant.promoCatalog ?? []).filter((t) => t.id !== input.templateId);
  if (list.length === (tenant.promoCatalog ?? []).length) {
    throw new Error("Agency promo template not found.");
  }
  await writeCatalog(input.user.tenantId, list);
  const wasPlatform = isPlatformPromoId(input.templateId);
  await logAction(
    input.user,
    wasPlatform ? "promo.platform_override_reset" : "promo.agency_template_deleted",
    {
      targetType: "tenant",
      targetId: input.user.tenantId,
      detail: input.templateId,
    },
  );
}

/** Remove a platform override so the built-in pack returns. */
export async function resetPlatformPromoOverride(input: {
  user: ActingUser;
  templateId: string;
}): Promise<void> {
  if (!isPlatformPromoId(input.templateId)) {
    throw new Error("Only built-in packs can be reset.");
  }
  await deleteAgencyPromoTemplate(input);
}
