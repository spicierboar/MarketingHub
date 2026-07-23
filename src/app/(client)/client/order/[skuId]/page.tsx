import { redirect, notFound } from "next/navigation";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getClientMenuSku } from "@/lib/client-order-menu";

/**
 * Legacy deep link — order brief now opens as a modal on Extras.
 * Keep this route so old bookmarks still work.
 */
export default async function ClientOrderSkuPage({
  params,
}: {
  params: Promise<{ skuId: string }>;
}) {
  await requirePortalUser();
  const { skuId } = await params;
  if (!getClientMenuSku(skuId)) notFound();
  redirect(`/client/order?orderSku=${encodeURIComponent(skuId)}`);
}
