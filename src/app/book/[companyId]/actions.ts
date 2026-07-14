"use server";

import { redirect } from "next/navigation";
import {
  createReservation,
  getReservation,
  getServicePeriod,
  listReservations,
} from "@/lib/db";
import { runInServiceContext } from "@/lib/db/service-context";
import { companyHasAddon } from "@/lib/entitlements";
import { assertPublicRate, clientIp } from "@/lib/ratelimit";
import {
  assertLeadTime,
  assertPartySizeAllowed,
  assertSlotCapacity,
  confirmationMode,
  initialReservationStatus,
} from "@/lib/bookings";
import { dispatchBookingConfirmation } from "@/lib/bookings-connectors";
import { loadPublicBookingsStorefront } from "@/lib/bookings-public";
import {
  validateOptionalPhone,
  validateRequiredEmail,
} from "@/lib/form-validation";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

export async function requestReservationAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  await assertPublicRate("guest_booking", await clientIp());

  const storefront = await loadPublicBookingsStorefront(companyId);
  if (!storefront) throw new Error("Online booking is not available.");

  const { company, periods, settings } = storefront;
  const servicePeriodId = text(formData, "servicePeriodId");
  const period = periods.find((p) => p.id === servicePeriodId);
  if (!period) throw new Error("Select a service period.");

  const guestName = text(formData, "guestName");
  const guestEmail = text(formData, "guestEmail");
  const guestPhone = text(formData, "guestPhone") || undefined;
  const notes = text(formData, "notes") || undefined;
  const partySize = Math.max(1, Math.floor(Number(formData.get("partySize") || 2)));
  const date = text(formData, "date");
  const time = text(formData, "time");
  if (!guestName || !guestEmail || !date || !time) {
    throw new Error("Name, email, date, and time are required.");
  }
  if (guestName.length < 2) throw new Error("Enter your full name.");
  const emailErr = validateRequiredEmail(guestEmail);
  if (emailErr) throw new Error(emailErr);
  const phoneErr = validateOptionalPhone(guestPhone);
  if (phoneErr) throw new Error(phoneErr);

  const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
  assertPartySizeAllowed(settings, partySize);
  assertLeadTime(settings, scheduledAt);

  const reservation = await runInServiceContext(company.tenantId, async () => {
    if (!(await companyHasAddon(companyId, "bookings"))) {
      throw new Error("Online booking is not enabled.");
    }
    const existing = await listReservations(company.tenantId, companyId);
    assertSlotCapacity(period, existing, scheduledAt, partySize);
    const status = initialReservationStatus();
    const rec = await createReservation({
      companyId,
      servicePeriodId,
      status,
      guestName,
      guestEmail,
      guestPhone,
      partySize,
      scheduledAt,
      notes,
      confirmationMode: confirmationMode(),
    });
    if (status === "confirmed") {
      await dispatchBookingConfirmation({ companyId, reservationId: rec.id });
    }
    return rec;
  });

  redirect(`/book/${companyId}?confirmed=${reservation.id}`);
}

export async function getConfirmedReservation(companyId: string, reservationId: string) {
  const storefront = await loadPublicBookingsStorefront(companyId);
  if (!storefront) return null;
  return runInServiceContext(storefront.company.tenantId, async () => {
    const reservation = await getReservation(reservationId);
    if (!reservation || reservation.companyId !== companyId) return null;
    if (reservation.status === "cancelled") return null;
    const period = await getServicePeriod(reservation.servicePeriodId);
    return { reservation, period };
  });
}
