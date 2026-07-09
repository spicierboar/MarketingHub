// Photographer marketplace engine (V1 module 14). Two-sided booking: browse
// photographer profiles + packages, book a shoot (creates PhotoShoot lifecycle),
// collect payment with marketplace fee, hold photographer payout until the shoot
// completes (DAM upload → approve path). Stripe Connect when live; simulated
// when PHOTO_MARKETPLACE_LIVE / Stripe keys are off.

import { appEnv } from "@/lib/env";
import { stripeConfigured } from "@/lib/billing";
import {
  createPhotoMarketplaceBooking,
  createPhotoShoot,
  getCompany,
  getPhotoMarketplaceBooking,
  getPhotoShoot,
  getPhotographerPackage,
  getPhotographerProfile,
  listPhotographerPackages,
  listPhotographerProfiles,
  updatePhotoMarketplaceBooking,
  updatePhotoShoot,
} from "@/lib/db";
import type {
  PhotoMarketplaceBooking,
  PhotographerPackage,
  PhotographerProfile,
  PhotoShoot,
} from "@/lib/types";
import { createMarketplaceCheckoutSession } from "@/lib/photo-marketplace-stripe";

// Platform take rate — 15% marketplace fee on the package price.
export const MARKETPLACE_FEE_BPS = 1500;

export function photoMarketplaceLive(): boolean {
  if (!stripeConfigured()) return false;
  const env = appEnv();
  if (env === "development" || env === "staging") return true;
  return process.env.PHOTO_MARKETPLACE_LIVE === "true";
}

export function photoMarketplaceStripeReady(): boolean {
  return photoMarketplaceLive();
}

export interface MarketplacePriceSplit {
  totalCents: number;
  marketplaceFeeCents: number;
  photographerPayoutCents: number;
}

export function computeMarketplaceSplit(priceCents: number): MarketplacePriceSplit {
  const marketplaceFeeCents = Math.round((priceCents * MARKETPLACE_FEE_BPS) / 10_000);
  const photographerPayoutCents = priceCents - marketplaceFeeCents;
  return { totalCents: priceCents, marketplaceFeeCents, photographerPayoutCents };
}

export interface BrowsablePhotographer extends PhotographerProfile {
  packages: PhotographerPackage[];
}

export async function listBrowsablePhotographers(
  tenantId: string,
): Promise<BrowsablePhotographer[]> {
  const profiles = await listPhotographerProfiles(tenantId);
  const out: BrowsablePhotographer[] = [];
  for (const profile of profiles) {
    const packages = await listPhotographerPackages(profile.id);
    if (packages.length > 0) out.push({ ...profile, packages });
  }
  return out;
}

export function photographerVisibleToTenant(
  profile: PhotographerProfile,
  tenantId: string,
): boolean {
  return profile.active && (profile.tenantId === null || profile.tenantId === tenantId);
}

export function canUseLiveMarketplaceCheckout(profile: PhotographerProfile): boolean {
  return (
    photoMarketplaceStripeReady() &&
    !!profile.stripeConnectAccountId &&
    profile.connectStatus === "active"
  );
}

export interface BookMarketplaceShootInput {
  tenantId: string;
  companyId: string;
  photographerId: string;
  packageId: string;
  bookedById: string;
  brief: string;
  location?: string;
  scheduledSlot?: string;
  targetChannels?: string[];
  origin?: string;
}

export interface BookMarketplaceShootResult {
  booking: PhotoMarketplaceBooking;
  shoot: PhotoShoot;
  checkoutUrl: string | null;
  mode: "live" | "simulated";
}

/** Book a marketplace shoot — always creates a PhotoShoot in `requested` status. */
export async function bookMarketplaceShoot(
  input: BookMarketplaceShootInput,
): Promise<BookMarketplaceShootResult> {
  const company = await getCompany(input.companyId);
  if (!company || company.tenantId !== input.tenantId) {
    throw new Error("Company not found for this tenant.");
  }

  const profile = await getPhotographerProfile(input.photographerId);
  if (!profile || !photographerVisibleToTenant(profile, input.tenantId)) {
    throw new Error("Photographer not available.");
  }

  const pkg = await getPhotographerPackage(input.packageId);
  if (!pkg || pkg.photographerId !== profile.id || !pkg.active) {
    throw new Error("Package not found.");
  }

  const split = computeMarketplaceSplit(pkg.priceCents);
  const brief =
    input.brief.trim() ||
    `${pkg.title} — ${profile.name}`.slice(0, 500);

  const shoot = await createPhotoShoot({
    companyId: input.companyId,
    brief,
    location: input.location,
    scheduledAt: input.scheduledSlot,
    status: "requested",
    deliverableAssetIds: [],
    targetChannels: input.targetChannels ?? [],
    createdById: input.bookedById,
  });

  const booking = await createPhotoMarketplaceBooking({
    companyId: input.companyId,
    photographerId: profile.id,
    packageId: pkg.id,
    photoShootId: shoot.id,
    scheduledSlot: input.scheduledSlot,
    brief,
    location: input.location,
    status: "pending_payment",
    paymentStatus: "pending",
    payoutStatus: "held",
    totalCents: split.totalCents,
    marketplaceFeeCents: split.marketplaceFeeCents,
    photographerPayoutCents: split.photographerPayoutCents,
    bookedById: input.bookedById,
  });

  await updatePhotoShoot(shoot.id, { marketplaceBookingId: booking.id });

  const live = canUseLiveMarketplaceCheckout(profile);
  if (!live) {
    const confirmed = await confirmSimulatedMarketplacePayment(booking.id);
    return {
      booking: confirmed,
      shoot: (await getPhotoShoot(shoot.id))!,
      checkoutUrl: null,
      mode: "simulated",
    };
  }

  let checkoutUrl: string | null = null;
  if (input.origin) {
    checkoutUrl = await createMarketplaceCheckoutSession(
      booking,
      profile,
      pkg.title,
      input.origin,
      input.tenantId,
    );
    if (checkoutUrl) {
      await updatePhotoMarketplaceBooking(booking.id, {
        stripeCheckoutSessionId: "pending",
      });
    }
  }

  return {
    booking,
    shoot: { ...shoot, marketplaceBookingId: booking.id },
    checkoutUrl,
    mode: "live",
  };
}

/** Demo / keys-off path — payment confirmed immediately; payout stays held. */
export async function confirmSimulatedMarketplacePayment(
  bookingId: string,
): Promise<PhotoMarketplaceBooking> {
  const booking = await getPhotoMarketplaceBooking(bookingId);
  if (!booking) throw new Error("Booking not found.");
  if (booking.paymentStatus === "paid" || booking.paymentStatus === "simulated") {
    return booking;
  }
  const updated = await updatePhotoMarketplaceBooking(bookingId, {
    status: "confirmed",
    paymentStatus: "simulated",
    payoutStatus: "held",
  });
  if (!updated) throw new Error("Failed to confirm booking.");
  return updated;
}

export function payoutEligibleForShoot(shoot: PhotoShoot): boolean {
  return shoot.status === "completed" && shoot.deliverableAssetIds.length > 0;
}

/**
 * Release photographer payout only after shoot completion + deliverables linked
 * (governance/DAM path — never on booking alone).
 */
export async function tryReleasePhotographerPayout(
  bookingId: string,
): Promise<PhotoMarketplaceBooking | null> {
  const booking = await getPhotoMarketplaceBooking(bookingId);
  if (!booking) return null;
  if (booking.payoutStatus === "released" || booking.payoutStatus === "simulated") {
    return booking;
  }
  if (booking.paymentStatus !== "paid" && booking.paymentStatus !== "simulated") {
    return booking;
  }

  const shoot = await getPhotoShoot(booking.photoShootId);
  if (!shoot || !payoutEligibleForShoot(shoot)) return booking;

  const profile = await getPhotographerProfile(booking.photographerId);
  const live = profile ? canUseLiveMarketplaceCheckout(profile) : false;

  return (
    (await updatePhotoMarketplaceBooking(bookingId, {
      payoutStatus: live ? "released" : "simulated",
    })) ?? booking
  );
}

export function marketplaceBookingSummary(booking: PhotoMarketplaceBooking): string {
  const parts = [
    booking.status,
    `$${(booking.totalCents / 100).toFixed(2)}`,
    `fee $${(booking.marketplaceFeeCents / 100).toFixed(2)}`,
    `payout ${booking.payoutStatus}`,
  ];
  return parts.join(" · ");
}

export function formatAud(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
