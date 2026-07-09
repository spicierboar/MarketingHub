import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import { getCompany, listOffers } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { now } from "@/lib/utils";
import { addOfferAction, setOfferStatusAction } from "../../brand-actions";

export default async function OffersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const company = await getCompany(id);
  if (!company || !(await canAccessCompany(user, company.id))) notFound();

  const offers = await listOffers(company.id);
  const today = now().slice(0, 10);

  return (
    <div>
      <PageHeader
        title={`${company.name} — Offer & Promotion Manager`}
        description="The AI may only promote live approved offers, using their approved wording."
      >
        <Link href={`/companies/${company.id}`} className="text-sm text-primary hover:underline">
          ← Company profile
        </Link>
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-4">
          {offers.map((o) => {
            const expired = !!o.endDate && o.endDate < today;
            const live = o.status === "approved" && !expired && (!o.startDate || o.startDate <= today);
            return (
              <Card key={o.id} className={o.status === "archived" ? "opacity-60" : ""}>
                <CardContent className="p-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{o.name}</h3>
                    {live ? (
                      <Badge tone="success">Live</Badge>
                    ) : expired && o.status === "approved" ? (
                      <Badge tone="danger">Expired</Badge>
                    ) : (
                      <Badge tone={o.status === "approved" ? "success" : "neutral"}>
                        {o.status === "approved" ? "Approved" : o.status === "draft" ? "Draft" : "Archived"}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">“{o.approvedWording}”</p>
                  <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                    {(o.startDate || o.endDate) && (
                      <div>
                        Runs: {o.startDate ?? "—"} → {o.endDate ?? "open-ended"}
                      </div>
                    )}
                    {o.terms && <div>Terms: {o.terms}</div>}
                    {o.exclusions && <div>Exclusions: {o.exclusions}</div>}
                    {o.requiredDisclaimer && <div>Disclaimer: {o.requiredDisclaimer}</div>}
                  </dl>
                  <div className="mt-3 flex gap-2">
                    {o.status === "draft" && (
                      <form action={setOfferStatusAction}>
                        <input type="hidden" name="offerId" value={o.id} />
                        <input type="hidden" name="status" value="approved" />
                        <Button type="submit" size="sm">Approve offer</Button>
                      </form>
                    )}
                    {o.status !== "archived" && (
                      <form action={setOfferStatusAction}>
                        <input type="hidden" name="offerId" value={o.id} />
                        <input type="hidden" name="status" value="archived" />
                        <Button type="submit" variant="ghost" size="sm">Archive</Button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {offers.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No offers yet.
            </div>
          )}
        </div>

        <Card className="h-fit">
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Add offer</h2>
            <form action={addOfferAction} className="space-y-4">
              <input type="hidden" name="companyId" value={company.id} />
              <Field label="Offer name" htmlFor="name">
                <Input id="name" name="name" required />
              </Field>
              <Field
                label="Approved wording"
                htmlFor="approvedWording"
                hint="The exact wording the AI is allowed to use."
              >
                <Textarea id="approvedWording" name="approvedWording" required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Start date" htmlFor="startDate">
                  <Input id="startDate" name="startDate" type="date" />
                </Field>
                <Field label="End date" htmlFor="endDate">
                  <Input id="endDate" name="endDate" type="date" />
                </Field>
              </div>
              <Field label="Terms" htmlFor="terms">
                <Input id="terms" name="terms" />
              </Field>
              <Field label="Exclusions" htmlFor="exclusions">
                <Input id="exclusions" name="exclusions" />
              </Field>
              <Field label="Required disclaimer" htmlFor="requiredDisclaimer">
                <Input id="requiredDisclaimer" name="requiredDisclaimer" />
              </Field>
              <Field label="Channels allowed" htmlFor="channelsAllowed" hint="One per line; blank = all">
                <Textarea id="channelsAllowed" name="channelsAllowed" className="min-h-16" />
              </Field>
              <Button type="submit">Add offer (as draft)</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
