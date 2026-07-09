// Self-test helpers for V1 photographer marketplace (Module 14).

import {
  createCompany,
  createPhotoMarketplaceBooking,
  createPhotoShoot,
  createTenant,
  getPhotoShoot,
  listPhotoMarketplaceBookings,
  listPhotographerProfiles,
} from "@/lib/db";
import {
  bookMarketplaceShoot,
  computeMarketplaceSplit,
  confirmSimulatedMarketplacePayment,
  photographerVisibleToTenant,
  photoMarketplaceLive,
} from "@/lib/photo-marketplace";

export async function checkBookingCreatesShoot(): Promise<{ ok: boolean; detail: string }> {
  const tenant = await createTenant({
    name: "M14 book test",
    kind: "agency",
    plan: "starter",
    status: "active",
  });
  const company = await createCompany({
    tenantId: tenant.id,
    name: "Book Test Co",
    createdBy: "u_selftest",
  });

  const photographers = await listPhotographerProfiles(tenant.id);
  const platform = photographers.find((p) => p.tenantId === null);
  if (!platform) {
    return { ok: false, detail: "no platform photographer in seed" };
  }

  const result = await bookMarketplaceShoot({
    tenantId: tenant.id,
    companyId: company.id,
    photographerId: platform.id,
    packageId: "pkg_lens_food",
    bookedById: "u_selftest",
    brief: "Hero shots for spring menu",
    location: "Test kitchen",
    scheduledSlot: "2026-08-01T10:00:00.000Z",
  });

  const shoot = await getPhotoShoot(result.shoot.id);
  const ok =
    result.mode === "simulated" &&
    result.booking.status === "confirmed" &&
    result.booking.paymentStatus === "simulated" &&
    result.booking.payoutStatus === "held" &&
    !!shoot &&
    shoot.status === "requested" &&
    shoot.marketplaceBookingId === result.booking.id &&
    result.booking.photoShootId === shoot.id;

  return {
    ok,
    detail: `mode=${result.mode} shoot=${shoot?.status} booking=${result.booking.status}`,
  };
}

export async function checkSimulatedBillingWhenLiveOff(): Promise<{ ok: boolean; detail: string }> {
  const liveOff = !photoMarketplaceLive();
  const split = computeMarketplaceSplit(10000);
  const feeOk = split.marketplaceFeeCents === 1500 && split.photographerPayoutCents === 8500;

  const tenant = await createTenant({
    name: "M14 billing test",
    kind: "agency",
    plan: "starter",
    status: "active",
  });
  const company = await createCompany({
    tenantId: tenant.id,
    name: "Billing Test Co",
    createdBy: "u_selftest",
  });

  const shoot = await createPhotoShoot({
    companyId: company.id,
    brief: "Billing path test",
    status: "requested",
    deliverableAssetIds: [],
    targetChannels: [],
    createdById: "u_selftest",
  });

  const booking = await createPhotoMarketplaceBooking({
    companyId: company.id,
    photographerId: "ph_platform_lens",
    packageId: "pkg_lens_product",
    photoShootId: shoot.id,
    status: "pending_payment",
    paymentStatus: "pending",
    payoutStatus: "held",
    totalCents: split.totalCents,
    marketplaceFeeCents: split.marketplaceFeeCents,
    photographerPayoutCents: split.photographerPayoutCents,
    bookedById: "u_selftest",
  });

  const confirmed = await confirmSimulatedMarketplacePayment(booking.id);
  const ok =
    liveOff &&
    feeOk &&
    confirmed.paymentStatus === "simulated" &&
    confirmed.payoutStatus === "held";

  return {
    ok,
    detail: `liveOff=${liveOff} fee=${split.marketplaceFeeCents} pay=${confirmed.paymentStatus}`,
  };
}

export async function checkMarketplaceTenantIsolation(): Promise<{ ok: boolean; detail: string }> {
  const tA = await createTenant({ name: "M14 iso A", kind: "agency", plan: "starter", status: "active" });
  const tB = await createTenant({ name: "M14 iso B", kind: "agency", plan: "starter", status: "active" });
  const coA = await createCompany({
    tenantId: tA.id,
    name: "Iso A Co",
    createdBy: "u_a",
  });
  const coB = await createCompany({
    tenantId: tB.id,
    name: "Iso B Co",
    createdBy: "u_b",
  });

  const shootA = await createPhotoShoot({
    companyId: coA.id,
    brief: "Tenant A booking",
    status: "requested",
    deliverableAssetIds: [],
    targetChannels: [],
    createdById: "u_a",
  });
  const shootB = await createPhotoShoot({
    companyId: coB.id,
    brief: "Tenant B booking",
    status: "requested",
    deliverableAssetIds: [],
    targetChannels: [],
    createdById: "u_b",
  });

  await createPhotoMarketplaceBooking({
    companyId: coA.id,
    photographerId: "ph_platform_lens",
    packageId: "pkg_lens_food",
    photoShootId: shootA.id,
    status: "confirmed",
    paymentStatus: "simulated",
    payoutStatus: "held",
    totalCents: 89000,
    marketplaceFeeCents: 13350,
    photographerPayoutCents: 75650,
    bookedById: "u_a",
  });
  await createPhotoMarketplaceBooking({
    companyId: coB.id,
    photographerId: "ph_platform_lens",
    packageId: "pkg_lens_food",
    photoShootId: shootB.id,
    status: "confirmed",
    paymentStatus: "simulated",
    payoutStatus: "held",
    totalCents: 89000,
    marketplaceFeeCents: 13350,
    photographerPayoutCents: 75650,
    bookedById: "u_b",
  });

  const listA = await listPhotoMarketplaceBookings(tA.id);
  const listB = await listPhotoMarketplaceBookings(tB.id);
  const aOnly = listA.every((b) => b.companyId === coA.id) && listA.length >= 1;
  const bOnly = listB.every((b) => b.companyId === coB.id) && listB.length >= 1;
  const noLeak = !listA.some((b) => b.companyId === coB.id) && !listB.some((b) => b.companyId === coA.id);

  const tenantPh = {
    id: "ph_iso_tenant",
    tenantId: tA.id,
    name: "Private A photographer",
    specialty: ["test"],
    connectStatus: "active" as const,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const visibleToA = photographerVisibleToTenant(tenantPh, tA.id);
  const hiddenFromB = !photographerVisibleToTenant(tenantPh, tB.id);

  const ok = aOnly && bOnly && noLeak && visibleToA && hiddenFromB;
  return {
    ok,
    detail: `a=${listA.length} b=${listB.length} leak=${!noLeak} vis=${visibleToA}/${hiddenFromB}`,
  };
}
