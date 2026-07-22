"use server";

import { redirect } from "next/navigation";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getClientMenuSku } from "@/lib/client-order-menu";
import { fulfilClientMenuOrder } from "@/lib/fulfil-menu-order";

/**
 * Place an Extras catalogue order → MarketingRequest + professional AI draft.
 * Payment capture is stubbed (no LIVE flags); agency reviews before publish.
 */
export async function placeClientMenuOrderAction(formData: FormData) {
  const { user, companyId } = await requirePortalUser();
  const skuId = String(formData.get("skuId") || "").trim();
  const sku = getClientMenuSku(skuId);
  if (!sku) throw new Error("That item is not available.");

  const topicRaw = String(formData.get("topic") || "").trim();
  const clientNotes = String(formData.get("notes") || "").trim();
  if (!clientNotes && !topicRaw) {
    throw new Error("Add a short subject or notes so we know what to deliver.");
  }

  const topic =
    topicRaw ||
    `${sku.title}${clientNotes ? ` — ${clientNotes.slice(0, 60)}` : ""}`;

  const preferredDate =
    String(formData.get("preferredDate") || "").trim() || undefined;

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
