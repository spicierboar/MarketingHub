// Self-test helpers for W7 bookings (M50).

import {
  addMembership,
  createCompany,
  createReservation,
  createServicePeriod,
  createTenant,
  createUser,
  listReservations,
  purgeTenant,
  updateCompany,
  upsertBookingSettings,
  upsertCompanyEntitlement,
} from "@/lib/db";
import { bookingsLive } from "@/lib/bookings-connectors";
import {
  assertBookingTransition,
  canTransitionBooking,
  confirmationMode,
  initialReservationStatus,
} from "@/lib/bookings";
import { canAccessCompany } from "@/lib/auth/rbac";

export function checkBookingsSimulatedWhenLiveOff(): { ok: boolean; detail: string } {
  return {
    ok: !bookingsLive() && initialReservationStatus() === "confirmed" && confirmationMode() === "simulated",
    detail: `BOOKINGS_LIVE=${bookingsLive()} status=${initialReservationStatus()}`,
  };
}

export function checkBookingsStateMachine(): { ok: boolean; detail: string } {
  const ok =
    canTransitionBooking("requested", "confirmed") &&
    canTransitionBooking("confirmed", "seated") &&
    canTransitionBooking("confirmed", "checked_in") &&
    canTransitionBooking("seated", "completed") &&
    !canTransitionBooking("completed", "confirmed");
  return { ok, detail: ok ? "transitions ok" : "invalid transitions" };
}

export async function runBookingsSelfTest() {
  const start = Date.now();
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const purgeFailed: string[] = [];
  async function expect(name: string, fn: () => Promise<{ ok: boolean; detail?: string }> | { ok: boolean; detail?: string }) {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }

  await expect("bookings.simulatedWhenLiveOff", () => checkBookingsSimulatedWhenLiveOff());
  await expect("bookings.stateMachine", () => checkBookingsStateMachine());

  const tA = await createTenant({ name: "Bookings A", kind: "agency", plan: "starter", status: "active", timezone: "Australia/Sydney" });
  const tB = await createTenant({ name: "Bookings B", kind: "agency", plan: "starter", status: "active", timezone: "Australia/Sydney" });
  const userA = await createUser({ email: `bookings-a-${Date.now()}@example.dev`, name: "Bookings A", role: "admin" });
  const userB = await createUser({ email: `bookings-b-${Date.now()}@example.dev`, name: "Bookings B", role: "admin" });
  await addMembership({ tenantId: tA.id, userId: userA.id, role: "owner" });
  await addMembership({ tenantId: tB.id, userId: userB.id, role: "owner" });
  const companyA = await createCompany({ tenantId: tA.id, name: "Bookings Co A", createdBy: userA.id });
  const companyB = await createCompany({ tenantId: tB.id, name: "Bookings Co B", createdBy: userB.id });
  await updateCompany(companyA.id, { status: "approved" });
  await updateCompany(companyB.id, { status: "approved" });
  await upsertCompanyEntitlement({ companyId: companyA.id, addonId: "bookings", status: "active", enabledById: userA.id });
  await upsertBookingSettings({
    companyId: companyA.id,
    venueKind: "restaurant",
    enabled: true,
    buttonLabel: "Book",
    leadTimeHours: 0,
    maxPartySize: 8,
    updatedAt: new Date().toISOString(),
  });
  const period = await createServicePeriod({
    companyId: companyA.id,
    name: "Lunch",
    dayOfWeek: 1,
    startTime: "11:30",
    endTime: "14:00",
    capacity: 10,
    slotMinutes: 30,
    active: true,
  });
  const scheduledAt = new Date(Date.now() + 7200000).toISOString();
  const reservation = await createReservation({
    companyId: companyA.id,
    servicePeriodId: period.id,
    status: initialReservationStatus(),
    guestName: "Test Guest",
    guestEmail: "guest@example.dev",
    partySize: 2,
    scheduledAt,
    confirmationMode: confirmationMode(),
  });
  checks.push({
    name: "bookings.createReservation",
    ok: reservation.status === initialReservationStatus() && (await listReservations(tA.id, companyA.id)).some((r) => r.id === reservation.id),
    detail: reservation.status,
  });
  assertBookingTransition(reservation.status, "seated");
  checks.push({
    name: "bookings.tenantIsolation",
    ok: !(await canAccessCompany({ ...userB, tenantId: tB.id, tenantRole: "owner" }, companyA.id)) &&
      (await listReservations(tB.id)).every((r) => r.companyId !== companyA.id),
    detail: "cross-tenant blocked",
  });
  try {
    await purgeTenant(tA.id);
    await purgeTenant(tB.id);
  } catch {
    purgeFailed.push(tA.id, tB.id);
  }
  const failed = checks.filter((c) => !c.ok).length;
  return { ok: failed === 0 && !purgeFailed.length, passed: checks.length - failed, failed, purgeFailed, durationMs: Date.now() - start, checks };
}
