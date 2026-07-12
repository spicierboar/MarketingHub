"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { assertCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { assertCompanyAddon } from "@/lib/entitlements";
import { resolveOrigin } from "@/lib/origin";
import { bookMarketplaceShoot, tryReleasePhotographerPayout } from "@/lib/photo-marketplace";
import { getCompany } from "@/lib/db";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function lines(fd: FormData, key: string): string[] {
  // Checkboxes (name=key, multiple) or legacy comma/newline text.
  return fd
    .getAll(key)
    .flatMap((v) => String(v).split(/[\n,]/))
    .map((s) => s.trim())
    .filter(Boolean);
}

async function assertPhotoCompany(companyId: string) {
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  if (company.status !== "ai_ready" && company.status !== "approved") {
    throw new Error("Company is not AI-ready. Complete onboarding first.");
  }
  return company;
}

export async function bookPhotographerAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "photo");
  await assertPhotoCompany(companyId);

  const photographerId = text(formData, "photographerId");
  const packageId = text(formData, "packageId");
  const brief = text(formData, "brief");
  const location = text(formData, "location") || undefined;
  const scheduledSlot = text(formData, "scheduledSlot") || undefined;
  const targetChannels = lines(formData, "targetChannels");

  if (!photographerId || !packageId) {
    throw new Error("Select a photographer package.");
  }

  const hdrs = await headers();
  const origin = resolveOrigin((n) => hdrs.get(n));

  const result = await bookMarketplaceShoot({
    tenantId: user.tenantId,
    companyId,
    photographerId,
    packageId,
    bookedById: user.id,
    brief,
    location,
    scheduledSlot,
    targetChannels,
    origin,
  });

  await logAction(user, "photo_marketplace.booked", {
    targetType: "photo_marketplace_booking",
    targetId: result.booking.id,
    companyId,
    detail: `${result.mode} · shoot ${result.shoot.id}`,
  });

  revalidatePath("/photographers");
  revalidatePath("/visuals");

  if (result.checkoutUrl) {
    redirect(result.checkoutUrl);
  }

  redirect(`/photographers?company=${companyId}&booked=${result.booking.id}`);
}

export async function releaseMarketplacePayoutAction(formData: FormData) {
  const bookingId = text(formData, "bookingId");
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "photo");

  const released = await tryReleasePhotographerPayout(bookingId);
  if (!released) throw new Error("Booking not found.");

  await logAction(user, "photo_marketplace.payout_released", {
    targetType: "photo_marketplace_booking",
    targetId: bookingId,
    companyId,
    detail: released.payoutStatus,
  });

  revalidatePath("/photographers");
  revalidatePath("/visuals");
}
