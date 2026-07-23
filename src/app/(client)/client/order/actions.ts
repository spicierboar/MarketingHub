"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getClientMenuSku } from "@/lib/client-order-menu";
import { fulfilClientMenuOrder } from "@/lib/fulfil-menu-order";
import { resolveOrigin } from "@/lib/origin";
import {
  assertOrderBriefComplete,
  formatOrderBriefForCook,
  formatOrderBriefNotes,
  parseOrderBriefFromFormData,
  resolveFulfilmentTopic,
} from "@/lib/client-order-brief";

/**
 * Place an Extras catalogue order → AI draft → client Approvals →
 * schedule/post when applicable (never publishes without approval).
 */
export async function placeClientMenuOrderAction(formData: FormData) {
  const { user, companyId } = await requirePortalUser();
  const skuId = String(formData.get("skuId") || "").trim();
  const sku = getClientMenuSku(skuId);
  if (!sku) throw new Error("That item is not available.");

  const workingTitle = String(formData.get("topic") || "").trim();
  const brief = parseOrderBriefFromFormData(formData);
  assertOrderBriefComplete(brief, sku);

  const briefConfirmed = String(formData.get("briefConfirmed") || "").trim();
  if (briefConfirmed !== "1") {
    throw new Error(
      "Please check the brief summary and tick the confirmation box before submitting.",
    );
  }

  const clientNotes = formatOrderBriefNotes(brief, sku);
  const cookBrief = formatOrderBriefForCook(brief, sku);
  const topic = resolveFulfilmentTopic(brief, sku.title, workingTitle);

  const preferredDate =
    String(formData.get("preferredDate") || "").trim() || undefined;

  if (brief.timing === "specific" && !preferredDate) {
    throw new Error("Pick a preferred date when timing is “Specific date”.");
  }

  const h = await headers();
  const origin = resolveOrigin((name) => h.get(name));

  const result = await fulfilClientMenuOrder({
    user,
    companyId,
    sku,
    topic,
    clientNotes,
    cookBrief,
    preferredDate,
    origin,
  });

  redirect(`/client/order?placed=${encodeURIComponent(result.requestId)}`);
}
