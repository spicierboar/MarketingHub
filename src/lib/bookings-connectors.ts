// Bookings connectors (W7 M50). Live reservation provider integration sits
// behind BOOKINGS_LIVE. Until then, guest requests auto-confirm in simulated
// mode so the full request → confirm → seated/checked-in flow is testable
// with zero external accounts. Mirrors orderingLive() / loyaltyLive().

export function bookingsLive(): boolean {
  return process.env.BOOKINGS_LIVE === "true";
}

export interface BookingDispatchResult {
  ok: boolean;
  detail: string;
  mode: "simulated" | "live";
}

/** Notify external booking provider (placeholder — simulated when live off). */
export async function dispatchBookingConfirmation(input: {
  companyId: string;
  reservationId: string;
}): Promise<BookingDispatchResult> {
  if (!bookingsLive()) {
    return {
      ok: true,
      detail: `simulated confirmation for ${input.reservationId}`,
      mode: "simulated",
    };
  }
  return {
    ok: false,
    detail: "Live booking provider not configured",
    mode: "live",
  };
}
