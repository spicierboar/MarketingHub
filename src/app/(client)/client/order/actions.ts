"use server";

import { redirect } from "next/navigation";
import { createRequest } from "@/lib/db";
import { requirePortalUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import {
  buildMenuOrderNotes,
  getClientMenuSku,
} from "@/lib/client-order-menu";

/**
 * Place an Extras catalogue order → MarketingRequest in Client asks.
 * Payment capture is stubbed (no LIVE flags); agency fulfils as special job.
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

  const preferredDate = String(formData.get("preferredDate") || "").trim() || undefined;

  const req = await createRequest({
    companyId,
    requesterId: user.id,
    requestType: sku.requestType,
    objective: `Extras: ${sku.title}`,
    platform: sku.primaryChannel,
    topic,
    offer: `Extras · ${sku.title} · From $${sku.priceFromAud}`,
    preferredDate,
    urgency: "normal",
    notes: buildMenuOrderNotes({ sku, clientNotes }),
    consent: {
      customerNamed: false,
      customerInPhotos: false,
      consentObtained: false,
      mentionsPricing: false,
      mentionsOffer: false,
      performanceClaims: false,
    },
    uploads: [],
    assignedReviewerId: null,
  });

  await logAction(user, "menu_order.placed", {
    targetType: "request",
    targetId: req.id,
    companyId,
    detail: `${sku.id} · From $${sku.priceFromAud} · ${topic}`.slice(0, 200),
  });

  redirect(`/client/requests/${req.id}`);
}
