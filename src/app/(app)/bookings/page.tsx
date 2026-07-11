import { requireAdmin } from "@/lib/auth/rbac";
import {
  getBookingSettings,
  listCompanies,
  listReservations,
  listServicePeriods,
} from "@/lib/db";
import { ADDONS } from "@/lib/addons";
import { companyAddonMap } from "@/lib/entitlements";
import { resolveOrigin } from "@/lib/origin";
import { headers } from "next/headers";
import {
  arrivalStatusForVenue,
  bookingStatusLabel,
  defaultBookingSettings,
  reservationSummary,
} from "@/lib/bookings";
import { bookingsLive } from "@/lib/bookings-connectors";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import type { BookingStatus, Reservation } from "@/lib/types";
import {
  advanceReservationAction,
  confirmReservationAction,
  deleteServicePeriodAction,
  markArrivedAction,
  saveBookingSettingsAction,
  saveServicePeriodAction,
  toggleServicePeriodAction,
} from "./actions";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter((c) => c.status !== "archived");
  const companyId = params.company ?? companies[0]?.id;
  const company = companies.find((c) => c.id === companyId);
  const addons = company ? await companyAddonMap(user.tenantId, company.id) : null;

  const [periods, reservations, settingsRow] = companyId
    ? await Promise.all([
        listServicePeriods(user.tenantId, companyId),
        listReservations(user.tenantId, companyId),
        getBookingSettings(companyId),
      ])
    : [[], [], undefined];
  const settings = settingsRow ?? (companyId ? defaultBookingSettings(companyId) : null);

  const hdrs = await headers();
  const origin = resolveOrigin((n) => hdrs.get(n));
  const bookUrl = companyId ? `${origin}/book/${companyId}` : "";
  const live = bookingsLive();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bookings"
        description="Table and room reservations for restaurant and hotel clients — service periods, capacity, guest requests, host queue."
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <Badge tone={live ? "success" : "neutral"}>
            {live ? "BOOKINGS_LIVE on" : "Simulated confirmations"}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field label="Client" htmlFor="bk-company">
              <Select id="bk-company" name="company" defaultValue={companyId}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">View</Button>
          </form>
          {company && addons && (
            <p className="mt-3 text-sm text-muted-foreground">
              Add-on:{" "}
              {addons.bookings ? (
                <span className="text-foreground">
                  {ADDONS.bookings.icon} {ADDONS.bookings.name}
                </span>
              ) : (
                <span>
                  {ADDONS.bookings.icon} {ADDONS.bookings.name} (off) — enable on{" "}
                  <a href="/billing" className="text-primary underline">
                    Billing
                  </a>
                </span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {company && addons?.bookings && settings && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-6 p-6">
              <form action={saveBookingSettingsAction} className="space-y-3">
                <input type="hidden" name="companyId" value={company.id} />
                <h2 className="font-semibold">Booking settings</h2>
                <Field label="Venue type" htmlFor="venue-kind">
                  <Select id="venue-kind" name="venueKind" defaultValue={settings.venueKind}>
                    <option value="restaurant">Restaurant (tables)</option>
                    <option value="hotel">Hotel (rooms)</option>
                  </Select>
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
                  Accepting reservations
                </label>
                <Field label="Button label" htmlFor="btn-label">
                  <Input id="btn-label" name="buttonLabel" defaultValue={settings.buttonLabel} />
                </Field>
                <Field label="Lead time (hours)" htmlFor="lead-time">
                  <Input id="lead-time" name="leadTimeHours" type="number" min="0" defaultValue={settings.leadTimeHours} />
                </Field>
                <Field label="Max party size" htmlFor="max-party">
                  <Input id="max-party" name="maxPartySize" type="number" min="1" defaultValue={settings.maxPartySize} />
                </Field>
                <Field label="Guest notes" htmlFor="bk-notes">
                  <Textarea id="bk-notes" name="notes" defaultValue={settings.notes ?? ""} className="min-h-16" />
                </Field>
                <Button type="submit" size="sm">
                  Save settings
                </Button>
              </form>

              <div className="border-t pt-6">
                <h3 className="mb-2 font-medium">Embed / share</h3>
                <p className="mb-2 text-sm text-muted-foreground">Public booking page:</p>
                <code className="block break-all rounded bg-muted p-2 text-xs">{bookUrl}</code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 font-semibold">Service periods</h2>
              <form action={saveServicePeriodAction} className="mb-6 space-y-3 border-b pb-6">
                <input type="hidden" name="companyId" value={company.id} />
                <Field label="Name" htmlFor="sp-name">
                  <Input id="sp-name" name="name" placeholder="Lunch, Dinner…" required />
                </Field>
                <Field label="Day" htmlFor="sp-day">
                  <Select id="sp-day" name="dayOfWeek" defaultValue="1">
                    {DAY_LABELS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start" htmlFor="sp-start">
                    <Input id="sp-start" name="startTime" type="time" defaultValue="11:30" />
                  </Field>
                  <Field label="End" htmlFor="sp-end">
                    <Input id="sp-end" name="endTime" type="time" defaultValue="14:00" />
                  </Field>
                </div>
                <Field label="Capacity (covers)" htmlFor="sp-cap">
                  <Input id="sp-cap" name="capacity" type="number" min="1" defaultValue="20" />
                </Field>
                <Field label="Slot length (minutes)" htmlFor="sp-slot">
                  <Input id="sp-slot" name="slotMinutes" type="number" min="15" step="15" defaultValue="30" />
                </Field>
                <Button type="submit" size="sm">
                  Add service period
                </Button>
              </form>
              {periods.length === 0 ? (
                <p className="text-sm text-muted-foreground">No service periods yet.</p>
              ) : (
                <ul className="space-y-3">
                  {periods.map((period) => (
                    <li key={period.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {period.name}{" "}
                          <span className="text-muted-foreground">
                            ({DAY_LABELS[period.dayOfWeek]} {period.startTime}–{period.endTime})
                          </span>
                        </p>
                        <p className="text-muted-foreground">
                          {period.capacity} covers · {period.slotMinutes} min slots
                          {!period.active && " · hidden"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <form action={toggleServicePeriodAction}>
                          <input type="hidden" name="periodId" value={period.id} />
                          <input type="hidden" name="companyId" value={company.id} />
                          <input type="hidden" name="active" value={period.active ? "false" : "true"} />
                          <Button type="submit" size="sm" variant="outline">
                            {period.active ? "Hide" : "Show"}
                          </Button>
                        </form>
                        <form action={deleteServicePeriodAction}>
                          <input type="hidden" name="periodId" value={period.id} />
                          <input type="hidden" name="companyId" value={company.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Delete
                          </Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {company && addons?.bookings && settings && (
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Reservation queue</h2>
            {reservations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reservations yet.</p>
            ) : (
              <div className="space-y-4">
                {reservations.map((reservation) => (
                  <ReservationRow key={reservation.id} reservation={reservation} settings={settings} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {company && !addons?.bookings && (
        <Card>
          <CardContent className="p-6 text-sm text-amber-700">
            Enable the Bookings add-on on Billing to manage service periods and reservations.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReservationRow({
  reservation,
  settings,
}: {
  reservation: Reservation;
  settings: { venueKind: "restaurant" | "hotel" };
}) {
  const arrival = arrivalStatusForVenue(settings.venueKind);
  const next: Partial<Record<BookingStatus, BookingStatus>> = {
    confirmed: arrival,
    seated: "completed",
    checked_in: "completed",
  };
  const forward = next[reservation.status];

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{reservation.guestName}</p>
          <p className="text-sm text-muted-foreground">{reservationSummary(reservation)}</p>
          <p className="text-xs text-muted-foreground">
            {formatDate(reservation.scheduledAt)} · {reservation.guestEmail}
            {reservation.guestPhone ? ` · ${reservation.guestPhone}` : ""}
          </p>
        </div>
        <StatusBadge status={reservation.status} />
      </div>
      {reservation.notes && (
        <p className="mt-2 text-sm text-muted-foreground">Note: {reservation.notes}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {reservation.status === "requested" && (
          <form action={confirmReservationAction}>
            <input type="hidden" name="reservationId" value={reservation.id} />
            <Button type="submit" size="sm">
              Confirm
            </Button>
          </form>
        )}
        {reservation.status === "confirmed" && (
          <form action={markArrivedAction}>
            <input type="hidden" name="reservationId" value={reservation.id} />
            <Button type="submit" size="sm">
              → {bookingStatusLabel(arrival)}
            </Button>
          </form>
        )}
        {forward && reservation.status !== "confirmed" && (
          <form action={advanceReservationAction}>
            <input type="hidden" name="reservationId" value={reservation.id} />
            <input type="hidden" name="to" value={forward} />
            <Button type="submit" size="sm">
              → {bookingStatusLabel(forward)}
            </Button>
          </form>
        )}
        {!["completed", "cancelled", "no_show"].includes(reservation.status) && (
          <>
            <form action={advanceReservationAction}>
              <input type="hidden" name="reservationId" value={reservation.id} />
              <input type="hidden" name="to" value="no_show" />
              <Button type="submit" size="sm" variant="outline">
                No show
              </Button>
            </form>
            <form action={advanceReservationAction}>
              <input type="hidden" name="reservationId" value={reservation.id} />
              <input type="hidden" name="to" value="cancelled" />
              <Button type="submit" size="sm" variant="outline">
                Cancel
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
