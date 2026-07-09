import { requireAdmin } from "@/lib/auth/rbac";
import {
  getPhotoShoot,
  listCompanies,
  listPhotoMarketplaceBookings,
  listPhotographerPackages,
} from "@/lib/db";
import { companyAddonMap } from "@/lib/entitlements";
import {
  formatAud,
  listBrowsablePhotographers,
  marketplaceBookingSummary,
  photoMarketplaceLive,
} from "@/lib/photo-marketplace";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import type { PhotoMarketplaceBooking } from "@/lib/types";
import { bookPhotographerAction, releaseMarketplacePayoutAction } from "./actions";

export default async function PhotographersPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; booked?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter(
    (c) => c.status !== "archived",
  );
  const companyId = params.company ?? companies[0]?.id;
  const company = companies.find((c) => c.id === companyId);
  const addons = company ? await companyAddonMap(user.tenantId, company.id) : null;

  const [photographers, bookings] = await Promise.all([
    listBrowsablePhotographers(user.tenantId),
    listPhotoMarketplaceBookings(user.tenantId, companyId),
  ]);

  const live = photoMarketplaceLive();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Photographer marketplace"
        description="Browse vetted photographers, book shoots, and track marketplace billing — deliverables still flow through Creative Assets → approval."
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <Badge tone={live ? "success" : "neutral"}>
            {live ? "Live Stripe Connect checkout" : "Simulated billing"}
          </Badge>
          <span className="text-muted-foreground">
            Platform fee 15% · photographer payout held until shoot completed with deliverables
          </span>
          <a href="/visuals" className="ml-auto text-primary underline text-sm">
            AI Visuals & manual shoots →
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field label="Company" htmlFor="ph-company">
              <Select id="ph-company" name="company" defaultValue={companyId}>
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
              {addons.photo ? (
                <span className="text-foreground">📸 Photo shoots add-on enabled</span>
              ) : (
                <span>
                  📸 Photo shoots add-on required — enable on{" "}
                  <a href="/billing" className="text-primary underline">
                    Billing
                  </a>
                </span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {params.booked && (
        <Card>
          <CardContent className="p-4 text-sm text-green-800">
            Booking confirmed (simulated payment). The linked photo shoot is in your queue below
            and on{" "}
            <a href={`/visuals?company=${companyId}`} className="underline">
              AI Visuals
            </a>
            .
          </CardContent>
        </Card>
      )}

      {company && addons?.photo && (
        <>
          <div>
            <h2 className="mb-3 text-lg font-semibold">Browse photographers</h2>
            {photographers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No photographers available yet.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {photographers.map((ph) => (
                  <Card key={ph.id}>
                    <CardContent className="p-6">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{ph.name}</h3>
                        <Badge tone={ph.tenantId ? "neutral" : "success"}>
                          {ph.tenantId ? "Agency preferred" : "Platform"}
                        </Badge>
                      </div>
                      {ph.bio && (
                        <p className="mb-2 text-sm text-muted-foreground">{ph.bio}</p>
                      )}
                      {ph.serviceArea && (
                        <p className="mb-3 text-xs text-muted-foreground">📍 {ph.serviceArea}</p>
                      )}
                      {ph.specialty.length > 0 && (
                        <p className="mb-4 text-xs">
                          {ph.specialty.map((s) => (
                            <span
                              key={s}
                              className="mr-1 inline-block rounded bg-muted px-1.5 py-0.5"
                            >
                              {s}
                            </span>
                          ))}
                        </p>
                      )}

                      <div className="space-y-4">
                        {ph.packages.map((pkg) => (
                          <form
                            key={pkg.id}
                            action={bookPhotographerAction}
                            className="rounded-lg border p-4 space-y-3"
                          >
                            <input type="hidden" name="companyId" value={company.id} />
                            <input type="hidden" name="photographerId" value={ph.id} />
                            <input type="hidden" name="packageId" value={pkg.id} />
                            <div>
                              <p className="font-medium">{pkg.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatAud(pkg.priceCents)} · {pkg.durationMinutes} min
                              </p>
                              {pkg.description && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {pkg.description}
                                </p>
                              )}
                            </div>
                            <Field label="Brief" htmlFor={`brief-${pkg.id}`}>
                              <Textarea
                                id={`brief-${pkg.id}`}
                                name="brief"
                                className="min-h-16"
                                placeholder="What should the photographer capture?"
                              />
                            </Field>
                            <Field label="Location" htmlFor={`loc-${pkg.id}`}>
                              <Input
                                id={`loc-${pkg.id}`}
                                name="location"
                                placeholder="On-site address"
                              />
                            </Field>
                            <Field label="Preferred slot" htmlFor={`slot-${pkg.id}`}>
                              <Input
                                id={`slot-${pkg.id}`}
                                name="scheduledSlot"
                                type="datetime-local"
                              />
                            </Field>
                            <Field label="Target channels" htmlFor={`ch-${pkg.id}`}>
                              <Input
                                id={`ch-${pkg.id}`}
                                name="targetChannels"
                                placeholder="instagram, facebook"
                              />
                            </Field>
                            <Button type="submit" size="sm" className="w-full">
                              Book — {formatAud(pkg.priceCents)}
                            </Button>
                          </form>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 font-semibold">Marketplace bookings</h2>
              {bookings.length === 0 ? (
                <p className="text-sm text-muted-foreground">No marketplace bookings yet.</p>
              ) : (
                <div className="space-y-4">
                  {await Promise.all(
                    bookings.map(async (b) => (
                      <BookingRow key={b.id} booking={b} companyId={company.id} />
                    )),
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

async function BookingRow({
  booking,
  companyId,
}: {
  booking: PhotoMarketplaceBooking;
  companyId: string;
}) {
  const shoot = await getPhotoShoot(booking.photoShootId);
  const pkg = (await listPhotographerPackages(booking.photographerId)).find(
    (p) => p.id === booking.packageId,
  );

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium">{pkg?.title ?? "Package"}</span>
        <Badge tone={booking.paymentStatus === "simulated" ? "neutral" : "success"}>
          {booking.paymentStatus}
        </Badge>
        <Badge tone="neutral">payout: {booking.payoutStatus}</Badge>
        {shoot && <StatusBadge status={shoot.status} />}
      </div>
      <p className="text-xs text-muted-foreground">{marketplaceBookingSummary(booking)}</p>
      {booking.scheduledSlot && (
        <p className="mt-1 text-xs text-muted-foreground">
          Slot: {formatDate(booking.scheduledSlot)}
        </p>
      )}
      {shoot && (
        <p className="mt-2 text-sm">{shoot.brief}</p>
      )}
      {shoot && (
        <a
          href={`/visuals?company=${companyId}`}
          className="mt-2 inline-block text-xs text-primary underline"
        >
          Manage shoot workflow →
        </a>
      )}
      {shoot?.status === "completed" &&
        booking.payoutStatus === "held" &&
        shoot.deliverableAssetIds.length > 0 && (
          <form action={releaseMarketplacePayoutAction} className="mt-3">
            <input type="hidden" name="bookingId" value={booking.id} />
            <input type="hidden" name="companyId" value={companyId} />
            <Button type="submit" size="sm">
              Release photographer payout
            </Button>
          </form>
        )}
    </div>
  );
}
