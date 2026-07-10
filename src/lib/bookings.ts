// Bookings engine (W7 M50). Service periods, capacity checks, and reservation
// lifecycle state machine for restaurant tables and hotel room reservations.

import { bookingsLive } from "@/lib/bookings-connectors";
import type {
  BookingSettings,
  BookingStatus,
  BookingVenueKind,
  Reservation,
  ServicePeriod,
} from "@/lib/types";

export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ["confirmed", "cancelled"],
  confirmed: ["seated", "checked_in", "completed", "cancelled", "no_show"],
  seated: ["completed", "cancelled"],
  checked_in: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertBookingTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransitionBooking(from, to)) {
    throw new Error(`Cannot move a reservation from "${from}" to "${to}".`);
  }
}

export function bookingStatusLabel(status: BookingStatus): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "confirmed":
      return "Confirmed";
    case "seated":
      return "Seated";
    case "checked_in":
      return "Checked in";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "no_show":
      return "No show";
    default:
      return status;
  }
}

export function arrivalStatusForVenue(venueKind: BookingVenueKind): "seated" | "checked_in" {
  return venueKind === "hotel" ? "checked_in" : "seated";
}

export function defaultBookingSettings(companyId: string): BookingSettings {
  const t = new Date().toISOString();
  return {
    companyId,
    venueKind: "restaurant",
    enabled: true,
    buttonLabel: "Book a table",
    leadTimeHours: 1,
    maxPartySize: 12,
    updatedAt: t,
  };
}

export function reservationSummary(reservation: Reservation): string {
  return [
    bookingStatusLabel(reservation.status),
    `${reservation.partySize} guest(s)`,
    reservation.scheduledAt.slice(0, 16).replace("T", " "),
  ].join(" · ");
}

/** Count active reservations overlapping a slot (excludes cancelled / no_show). */
export function countSlotBookings(
  reservations: Reservation[],
  servicePeriodId: string,
  scheduledAt: string,
): number {
  return reservations.filter(
    (r) =>
      r.servicePeriodId === servicePeriodId &&
      r.scheduledAt === scheduledAt &&
      r.status !== "cancelled" &&
      r.status !== "no_show",
  ).length;
}

export function assertSlotCapacity(
  period: ServicePeriod,
  reservations: Reservation[],
  scheduledAt: string,
  partySize: number,
  excludeReservationId?: string,
): void {
  if (!period.active) throw new Error("This service period is not available.");
  const active = reservations.filter(
    (r) =>
      r.servicePeriodId === period.id &&
      r.scheduledAt === scheduledAt &&
      r.status !== "cancelled" &&
      r.status !== "no_show" &&
      r.id !== excludeReservationId,
  );
  const covers = active.reduce((sum, r) => sum + r.partySize, 0) + partySize;
  if (covers > period.capacity) {
    throw new Error(`Only ${period.capacity - active.reduce((s, r) => s + r.partySize, 0)} cover(s) left for this slot.`);
  }
}

export function assertPartySizeAllowed(settings: BookingSettings, partySize: number): void {
  if (partySize < 1) throw new Error("Party size must be at least 1.");
  if (partySize > settings.maxPartySize) {
    throw new Error(`Maximum party size is ${settings.maxPartySize}.`);
  }
}

export function assertLeadTime(settings: BookingSettings, scheduledAt: string): void {
  const minMs = settings.leadTimeHours * 60 * 60 * 1000;
  const when = new Date(scheduledAt).getTime();
  if (when - Date.now() < minMs) {
    throw new Error(`Bookings require at least ${settings.leadTimeHours} hour(s) notice.`);
  }
}

/** When live is off, guest requests auto-confirm deterministically. */
export function initialReservationStatus(): BookingStatus {
  return bookingsLive() ? "requested" : "confirmed";
}

export function confirmationMode(): "simulated" | "live" {
  return bookingsLive() ? "live" : "simulated";
}
