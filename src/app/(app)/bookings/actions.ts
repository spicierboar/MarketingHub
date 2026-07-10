"use server";

import { revalidatePath } from "next/cache";
import {
  createServicePeriod,
  deleteServicePeriod,
  getBookingSettings,
  getCompany,
  getReservation,
  updateReservation,
  updateServicePeriod,
  upsertBookingSettings,
} from "@/lib/db";
import { assertCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { assertCompanyAddon } from "@/lib/entitlements";
import {
  arrivalStatusForVenue,
  assertBookingTransition,
  bookingStatusLabel,
  defaultBookingSettings,
} from "@/lib/bookings";
import type { BookingStatus, BookingVenueKind } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

async function assertBookingCompany(companyId: string) {
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  if (company.status === "archived") throw new Error("Company is archived.");
  return company;
}

export async function saveBookingSettingsAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "bookings");
  await assertBookingCompany(companyId);

  const existing = (await getBookingSettings(companyId)) ?? defaultBookingSettings(companyId);
  const venueKind = text(formData, "venueKind") as BookingVenueKind;
  const settings = await upsertBookingSettings({
    ...existing,
    venueKind: venueKind === "hotel" ? "hotel" : "restaurant",
    enabled: formData.get("enabled") === "on",
    buttonLabel: text(formData, "buttonLabel") || "Book a table",
    leadTimeHours: Math.max(0, Number(formData.get("leadTimeHours") || 1)),
    maxPartySize: Math.max(1, Number(formData.get("maxPartySize") || 12)),
    notes: text(formData, "notes") || undefined,
  });
  await logAction(user, "bookings.settings_updated", {
    targetType: "booking_settings",
    targetId: companyId,
    companyId,
    detail: `venue=${settings.venueKind} enabled=${settings.enabled}`,
  });
  revalidatePath("/bookings");
}

export async function saveServicePeriodAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "bookings");
  await assertBookingCompany(companyId);

  const name = text(formData, "name");
  if (!name) throw new Error("Service period name is required.");

  await createServicePeriod({
    companyId,
    name,
    dayOfWeek: Math.min(6, Math.max(0, Number(formData.get("dayOfWeek") || 1))),
    startTime: text(formData, "startTime") || "11:00",
    endTime: text(formData, "endTime") || "14:00",
    capacity: Math.max(1, Number(formData.get("capacity") || 20)),
    slotMinutes: Math.max(15, Number(formData.get("slotMinutes") || 30)),
    active: true,
  });
  await logAction(user, "bookings.service_period_created", {
    targetType: "booking_service_period",
    companyId,
    detail: name,
  });
  revalidatePath("/bookings");
}

export async function toggleServicePeriodAction(formData: FormData) {
  const periodId = text(formData, "periodId");
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "bookings");
  const active = text(formData, "active") === "true";
  await updateServicePeriod(periodId, { active });
  await logAction(user, "bookings.service_period_toggled", {
    targetType: "booking_service_period",
    targetId: periodId,
    companyId,
    detail: active ? "active" : "hidden",
  });
  revalidatePath("/bookings");
}

export async function deleteServicePeriodAction(formData: FormData) {
  const periodId = text(formData, "periodId");
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  await assertCompanyAddon(companyId, "bookings");
  await deleteServicePeriod(periodId);
  await logAction(user, "bookings.service_period_deleted", {
    targetType: "booking_service_period",
    targetId: periodId,
    companyId,
  });
  revalidatePath("/bookings");
}

async function advanceReservation(reservationId: string, to: BookingStatus) {
  const reservation = await getReservation(reservationId);
  if (!reservation) throw new Error("Reservation not found");
  const user = await requireAdmin();
  await assertCompanyAccess(reservation.companyId);
  await assertCompanyAddon(reservation.companyId, "bookings");
  assertBookingTransition(reservation.status, to);
  await updateReservation(reservationId, { status: to });
  await logAction(user, "bookings.reservation_advanced", {
    targetType: "reservation",
    targetId: reservationId,
    companyId: reservation.companyId,
    detail: `${bookingStatusLabel(reservation.status)} → ${bookingStatusLabel(to)}`,
  });
  revalidatePath("/bookings");
}

export async function advanceReservationAction(formData: FormData) {
  await advanceReservation(text(formData, "reservationId"), text(formData, "to") as BookingStatus);
}

export async function confirmReservationAction(formData: FormData) {
  await advanceReservation(text(formData, "reservationId"), "confirmed");
}

export async function markArrivedAction(formData: FormData) {
  const reservationId = text(formData, "reservationId");
  const reservation = await getReservation(reservationId);
  if (!reservation) throw new Error("Reservation not found");
  const settings = (await getBookingSettings(reservation.companyId)) ?? defaultBookingSettings(reservation.companyId);
  await advanceReservation(reservationId, arrivalStatusForVenue(settings.venueKind));
}
