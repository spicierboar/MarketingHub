"use server";

import { redirect } from "next/navigation";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getClientMenuSku } from "@/lib/client-order-menu";
import { fulfilClientMenuOrder } from "@/lib/fulfil-menu-order";
import {
  assertOrderBriefComplete,
  formatOrderBriefNotes,
  parseOrderBriefFromFormData,
  resolveFulfilmentTopic,
} from "@/lib/client-order-brief";

/**
 * Place an Extras catalogue order → MarketingRequest + professional AI draft.
 * Payment capture is stubbed (no LIVE flags); agency reviews before publish.
 */
export async function placeClientMenuOrderAction(formData: FormData) {
  const { user, companyId } = await requirePortalUser();
  const skuId = String(formData.get("skuId") || "").trim();
  const sku = getClientMenuSku(skuId);
  if (!sku) throw new Error("That item is not available.");

  const workingTitle = String(formData.get("topic") || "").trim();
  const brief = parseOrderBriefFromFormData(formData);
  assertOrderBriefComplete(brief, sku);

  const clientNotes = formatOrderBriefNotes(brief, sku);
  const topic = resolveFulfilmentTopic(brief, sku.title, workingTitle);

  const preferredDate =
    String(formData.get("preferredDate") || "").trim() || undefined;

  if (brief.timing === "specific" && !preferredDate) {
    throw new Error("Pick a preferred date when timing is “Specific date”.");
  }

  const result = await fulfilClientMenuOrder({
    user,
    companyId,
    sku,
    topic,
    clientNotes,
    preferredDate,
  });

  redirect(`/client/requests/${result.requestId}`);
}
