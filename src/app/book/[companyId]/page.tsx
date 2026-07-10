import { getConfirmedReservation } from "./actions";
import { loadPublicBookingsStorefront } from "@/lib/bookings-public";
import { bookingStatusLabel } from "@/lib/bookings";
import { requestReservationAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Book online" };

export default async function PublicBookPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ confirmed?: string }>;
}) {
  const { companyId } = await params;
  const sp = await searchParams;
  const storefront = await loadPublicBookingsStorefront(companyId);

  if (!storefront) {
    return (
      <Shell title="Book online">
        <Card>
          <CardContent className="p-8 text-center">
            <h1 className="text-lg font-semibold">Booking isn&apos;t available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This venue hasn&apos;t enabled online reservations yet.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { company, periods, settings } = storefront;

  if (sp.confirmed) {
    const confirmed = await getConfirmedReservation(companyId, sp.confirmed);
    if (confirmed) {
      const { reservation, period } = confirmed;
      return (
        <Shell title={company.name}>
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              <h1 className="text-xl font-semibold text-green-700">Reservation received</h1>
              <p className="text-sm text-muted-foreground">
                Thanks {reservation.guestName} — your request for {reservation.partySize} guest(s) is{" "}
                <strong>{bookingStatusLabel(reservation.status).toLowerCase()}</strong>.
              </p>
              <p className="text-sm">
                {period?.name ?? "Reservation"} · {reservation.scheduledAt.slice(0, 16).replace("T", " ")}
              </p>
            </CardContent>
          </Card>
        </Shell>
      );
    }
  }

  const defaultDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  return (
    <Shell title={company.name}>
      <Card>
        <CardContent className="p-6">
          <h1 className="mb-1 text-xl font-semibold">{company.name}</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            {settings.venueKind === "hotel" ? "Request a room reservation" : "Request a table"}
          </p>

          <form action={requestReservationAction} className="space-y-4">
            <input type="hidden" name="companyId" value={companyId} />

            <Field label="Service period" htmlFor="service-period">
              <Select id="service-period" name="servicePeriodId" required defaultValue={periods[0]?.id}>
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.startTime}–{p.endTime})
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" htmlFor="bk-date">
                <Input id="bk-date" name="date" type="date" required defaultValue={defaultDate} />
              </Field>
              <Field label="Time" htmlFor="bk-time">
                <Input id="bk-time" name="time" type="time" required defaultValue="12:00" />
              </Field>
            </div>

            <Field label="Party size" htmlFor="party-size">
              <Input
                id="party-size"
                name="partySize"
                type="number"
                min="1"
                max={settings.maxPartySize}
                defaultValue="2"
                required
              />
            </Field>

            <Field label="Name" htmlFor="guest-name">
              <Input id="guest-name" name="guestName" required />
            </Field>
            <Field label="Email" htmlFor="guest-email">
              <Input id="guest-email" name="guestEmail" type="email" required />
            </Field>
            <Field label="Phone" htmlFor="guest-phone">
              <Input id="guest-phone" name="guestPhone" type="tel" />
            </Field>
            <Field label="Notes" htmlFor="guest-notes">
              <Textarea id="guest-notes" name="notes" placeholder="Dietary needs, occasion…" className="min-h-16" />
            </Field>
            {settings.notes && (
              <p className="text-xs text-muted-foreground">{settings.notes}</p>
            )}
            <Button type="submit" className="w-full sm:w-auto">
              {settings.buttonLabel}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-lg px-4 py-10">
        <p className="mb-4 text-center text-sm font-medium text-muted-foreground">{title}</p>
        {children}
      </div>
    </div>
  );
}
