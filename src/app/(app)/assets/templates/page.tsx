import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/auth/rbac";
import { visibleCompanies } from "@/lib/scope";
import { accessibleCompanyIds } from "@/lib/auth/rbac";
import { listBrandTemplates } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { titleCase } from "@/lib/utils";
import {
  createBrandTemplateAction,
  toggleBrandTemplateAction,
} from "../actions";

const KINDS: [string, string][] = [
  ["social_post", "Social post"],
  ["story", "Story"],
  ["poster", "Poster"],
  ["email_header", "Email header"],
  ["flyer", "Flyer"],
  ["video_intro", "Video intro"],
];
const SOURCES: [string, string][] = [
  ["canva", "Canva"],
  ["figma", "Figma"],
  ["upload", "In-house"],
];

export default async function BrandTemplatesPage() {
  const user = await requireUser();
  const admin = isAdmin(user);
  const superAdmin = user.role === "super_admin";
  const companies = await visibleCompanies(user);
  const companyIds = new Set(await accessibleCompanyIds(user));
  // Tenant-wide templates plus any for companies the user can see.
  const templates = (await listBrandTemplates(user.tenantId)).filter(
    (t) => t.companyId === null || companyIds.has(t.companyId),
  );
  const byCompany = new Map(companies.map((c) => [c.id, c.name]));

  return (
    <div>
      <PageHeader
        title="Brand templates"
        description="Reusable creative layouts (Canva/Figma) that keep every asset on-brand. Fed into image briefs."
      >
        <Link href="/assets" className="text-sm text-primary hover:underline">
          ← Back to assets
        </Link>
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {templates.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No brand templates yet.
              </CardContent>
            </Card>
          ) : (
            templates.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{t.name}</span>
                        <Badge tone="neutral">{titleCase(t.kind)}</Badge>
                        <Badge tone={t.companyId === null ? "primary" : "info"}>
                          {t.companyId === null ? "Group-wide" : byCompany.get(t.companyId) ?? "Company"}
                        </Badge>
                        {t.dimensions && (
                          <span className="text-xs text-muted-foreground">{t.dimensions}</span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
                      {t.spec && (
                        <p className="mt-1 text-xs text-muted-foreground">Spec: {t.spec}</p>
                      )}
                      {t.externalRef && (
                        <p className="mt-1 text-xs">
                          {t.externalRef.startsWith("http") ? (
                            <a href={t.externalRef} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              Open in {titleCase(t.source)} →
                            </a>
                          ) : (
                            <span className="text-muted-foreground">{t.externalRef}</span>
                          )}
                        </p>
                      )}
                    </div>
                    {admin && (
                      <form action={toggleBrandTemplateAction}>
                        <input type="hidden" name="templateId" value={t.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Deactivate
                        </Button>
                      </form>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {admin && (
          <Card className="h-fit">
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">New template</h2>
              <form action={createBrandTemplateAction} className="space-y-3">
                <Field label="Scope" htmlFor="companyId">
                  <Select
                    id="companyId"
                    name="companyId"
                    defaultValue={superAdmin ? "" : (companies[0]?.id ?? "")}
                  >
                    {superAdmin && <option value="">Group-wide</option>}
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Name" htmlFor="name">
                  <Input id="name" name="name" required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Kind" htmlFor="kind">
                    <Select id="kind" name="kind" defaultValue="social_post">
                      {KINDS.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Source" htmlFor="source">
                    <Select id="source" name="source" defaultValue="canva">
                      {SOURCES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Dimensions" htmlFor="dimensions">
                  <Input id="dimensions" name="dimensions" placeholder="1080x1080" />
                </Field>
                <Field label="Description" htmlFor="description">
                  <Textarea id="description" name="description" className="min-h-14" />
                </Field>
                <Field label="Spec / layout rules" htmlFor="spec">
                  <Textarea id="spec" name="spec" className="min-h-14" />
                </Field>
                <Field label="External reference" htmlFor="externalRef">
                  <Input id="externalRef" name="externalRef" placeholder="Canva/Figma URL or id" />
                </Field>
                <Button type="submit" className="w-full">
                  Create template
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
