"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/rbac";
import {
  deleteAgencyPromoTemplate,
  resetPlatformPromoOverride,
  saveAgencyPromoTemplate,
  setAgencyPromoTemplateActive,
} from "@/lib/promo-catalog-agency";

function multi(fd: FormData, key: string): string[] {
  return fd.getAll(key).map((v) => String(v));
}

function nums(fd: FormData, key: string): number[] {
  return multi(fd, key).map((v) => Number(v));
}

function formFields(formData: FormData) {
  return {
    industry: String(formData.get("industry") || ""),
    name: String(formData.get("name") || ""),
    promotion: String(formData.get("promotion") || ""),
    blurb: String(formData.get("blurb") || "") || undefined,
    defaultDurationDays: Number(formData.get("defaultDurationDays") || 14),
    ongoing: formData.get("ongoing") === "on",
    suggestedClientPriceUsd: Number(formData.get("suggestedClientPriceUsd") || 0),
    markupPercent: Number(formData.get("markupPercent") || 42),
    channels: multi(formData, "channels"),
    objective: String(formData.get("objective") || ""),
    keyMessage: String(formData.get("keyMessage") || ""),
    postTitles: multi(formData, "postTitle"),
    postCaptions: multi(formData, "postCaption"),
    postHashtags: multi(formData, "postHashtags"),
    postCtas: multi(formData, "postCta"),
    postChannels: multi(formData, "postChannel"),
    postDayOffsets: nums(formData, "postDayOffset"),
  };
}

function revalidatePromoPaths() {
  revalidatePath("/promo-catalog");
  revalidatePath("/client");
  revalidatePath("/client/promos");
}

export async function createAgencyPromoAction(formData: FormData) {
  const user = await requireAdmin();
  await saveAgencyPromoTemplate({ user, ...formFields(formData) });
  revalidatePromoPaths();
}

export async function saveAgencyPromoAction(formData: FormData) {
  const user = await requireAdmin();
  const templateId = String(formData.get("templateId") || "").trim();
  if (!templateId) throw new Error("Template id required.");
  await saveAgencyPromoTemplate({
    user,
    templateId,
    ...formFields(formData),
  });
  revalidatePromoPaths();
}

export async function toggleAgencyPromoAction(formData: FormData) {
  const user = await requireAdmin();
  const templateId = String(formData.get("templateId") || "");
  const active = String(formData.get("active") || "") === "true";
  await setAgencyPromoTemplateActive({ user, templateId, active });
  revalidatePromoPaths();
}

export async function deleteAgencyPromoAction(formData: FormData) {
  const user = await requireAdmin();
  const templateId = String(formData.get("templateId") || "");
  await deleteAgencyPromoTemplate({ user, templateId });
  revalidatePromoPaths();
}

export async function resetPlatformPromoAction(formData: FormData) {
  const user = await requireAdmin();
  const templateId = String(formData.get("templateId") || "");
  await resetPlatformPromoOverride({ user, templateId });
  revalidatePromoPaths();
}
