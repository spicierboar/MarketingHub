import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import { getCompany, listServices } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { titleCase } from "@/lib/utils";
import { addServiceAction, setServiceActiveAction } from "../../brand-actions";

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const company = await getCompany(id);
  if (!company || !(await canAccessCompany(user, company.id))) notFound();

  const services = await listServices(company.id, false);

  return (
    <div>
      <PageHeader
        title={`${company.name} — Service Catalogue`}
        description="Structured service records the AI uses when drafting. Prices are only usable when marked approved."
      >
        <Link href={`/companies/${company.id}`} className="text-sm text-primary hover:underline">
          ← Company profile
        </Link>
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-4">
          {services.map((svc) => (
            <Card key={svc.id} className={svc.active ? "" : "opacity-60"}>
              <CardContent className="p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{svc.name}</h3>
                  <Badge tone={svc.active ? "success" : "neutral"}>
                    {svc.active ? "Active" : "Inactive"}
                  </Badge>
                  <Badge tone={svc.marginPriority === "high" ? "primary" : "neutral"}>
                    {titleCase(svc.marginPriority)} margin
                  </Badge>
                  {svc.priceRange && (
                    <Badge tone={svc.priceApproved ? "success" : "warning"}>
                      {svc.priceApproved ? "Price approved" : "Price NOT approved"}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{svc.description}</p>
                <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {svc.priceRange && <div>Price: {svc.priceRange}</div>}
                  {svc.targetCustomer && <div>Target: {svc.targetCustomer}</div>}
                  {svc.seasonality && <div>Seasonality: {svc.seasonality}</div>}
                  {svc.requiredDisclaimer && <div>Disclaimer: {svc.requiredDisclaimer}</div>}
                  {svc.restrictions && (
                    <div className="text-amber-700">Restrictions: {svc.restrictions}</div>
                  )}
                </dl>
                <form action={setServiceActiveAction} className="mt-3">
                  <input type="hidden" name="serviceId" value={svc.id} />
                  <input type="hidden" name="companyId" value={company.id} />
                  <input type="hidden" name="active" value={svc.active ? "false" : "true"} />
                  <Button type="submit" variant="ghost" size="sm">
                    {svc.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
          {services.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No services yet — add the first one.
            </div>
          )}
        </div>

        <Card className="h-fit">
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Add service</h2>
            <form action={addServiceAction} className="space-y-4">
              <input type="hidden" name="companyId" value={company.id} />
              <Field label="Service name" htmlFor="name">
                <Input id="name" name="name" required />
              </Field>
              <Field label="Description" htmlFor="description">
                <Textarea id="description" name="description" required />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Target customer" htmlFor="targetCustomer">
                  <Input id="targetCustomer" name="targetCustomer" />
                </Field>
                <Field label="Margin priority" htmlFor="marginPriority">
                  <Select id="marginPriority" name="marginPriority" defaultValue="medium">
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </Select>
                </Field>
                <Field label="Price range" htmlFor="priceRange">
                  <Input id="priceRange" name="priceRange" placeholder="e.g. From $189/night" />
                </Field>
                <Field label="Seasonality" htmlFor="seasonality">
                  <Input id="seasonality" name="seasonality" />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="priceApproved" className="h-4 w-4" />
                Price is approved for use in marketing content
              </label>
              <Field label="Locations" htmlFor="locations" hint="One per line">
                <Textarea id="locations" name="locations" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Required disclaimer" htmlFor="requiredDisclaimer">
                  <Input id="requiredDisclaimer" name="requiredDisclaimer" />
                </Field>
                <Field label="Restrictions" htmlFor="restrictions">
                  <Input id="restrictions" name="restrictions" />
                </Field>
              </div>
              <Button type="submit">Add service</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
