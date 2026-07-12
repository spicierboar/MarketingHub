import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/auth/rbac";
import { visibleCompanies } from "@/lib/scope";
import { accessibleCompanyIds } from "@/lib/auth/rbac";
import { getCompany, listBrandTemplates } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { LockedCompanyField } from "@/components/locked-company-field";
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

export default async function BrandTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const superAdmin = user.role === "super_admin";
  const companies = await visibleCompanies(user);
  const companyIds = new Set(await accessibleCompanyIds(user));
  const { company: companyParam } = await searchParams;
  const contextCompanyId =
    companyParam && companyIds.has(companyParam) ? companyParam : undefined;
  const scopedCompany = contextCompanyId
    ? await getCompany(contextCompanyId)
    : null;
  // Tenant-wide templates plus any for companies the user can see.
  // When ?company=, show this client's templates plus group-wide layouts
  // available to them — never other clients' templates.
  const templates = (await listBrandTemplates(user.tenantId)).filter((t) => {
    if (t.companyId === null) return true;
    if (!companyIds.has(t.companyId)) return false;
    if (contextCompanyId) return t.companyId === contextCompanyId;
    return true;
  });
  const byCompany = new Map(companies.map((c) => [c.id, c.name]));
  const formCompanies = contextCompanyId
    ? companies.filter((c) => c.id === contextCompanyId)
    : companies;
  const assetsBack = contextCompanyId
    ? `/assets?company=${contextCompanyId}`
    : "/assets";

  return (
    <div>
      <PageHeader
        title={
          scopedCompany
            ? `Brand templates · ${scopedCompany.name}`
            : "Brand templates"
        }
        description={
          scopedCompany
            ? `Reusable layouts for ${scopedCompany.name} (plus group-wide). Fed into image briefs.`
            : "Reusable creative layouts (Canva/Figma) that keep every asset on-brand. Fed into image briefs."
        }
      >
        <Link href={assetsBack} className="text-sm text-primary hover:underline">
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
                          {t.companyId === null
                            ? "Group-wide"
                            : byCompany.get(t.companyId) ?? "Company"}
                        </Badge>
                        {t.dimensions && (
                          <span className="text-xs text-muted-foreground">
                            {t.dimensions}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t.description}
                      </p>
                      {t.spec && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Spec: {t.spec}
                        </p>
                      )}
                      {t.externalRef && (
                        <p className="mt-1 text-xs">
                          {t.externalRef.startsWith("http") ? (
                            <a
                              href={t.externalRef}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline"
                            >
                              Open in {titleCase(t.source)} →
                            </a>
                          ) : (
                            <span className="text-muted-foreground">
                              {t.externalRef}
                            </span>
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

        {admin && formCompanies.length > 0 && (
          <Card className="h-fit">
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">New template</h2>
              <form action={createBrandTemplateAction} className="space-y-3">
                {contextCompanyId ? (
                  <LockedCompanyField
                    id="companyId"
                    companies={formCompanies.map((c) => ({
                      id: c.id,
                      name: c.name,
                    }))}
                    companyId={contextCompanyId}
                    locked
                    label="Scope"
                  />
                ) : (
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
                )}
                <Field label="Name" htmlFor="name">
                  <Input
                    id="name"
                    name="name"
                    required
                    placeholder="e.g. Square feed — winter offer"
                  />
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
                <Field
                  label="Dimensions"
                  htmlFor="dimensions"
                  hint="Pixel size as used in the design tool"
                >
                  <Input
                    id="dimensions"
                    name="dimensions"
                    placeholder="e.g. 1080×1080"
                  />
                </Field>
                <Field
                  label="External ref / URL"
                  htmlFor="externalRef"
                  hint="Canva/Figma link or internal file id"
                >
                  <Input
                    id="externalRef"
                    name="externalRef"
                    placeholder="https://www.canva.com/design/…"
                  />
                </Field>
                <Field label="Description" htmlFor="description">
                  <Textarea
                    id="description"
                    name="description"
                    className="min-h-16"
                    placeholder="e.g. Square feed layout with logo top-left and CTA bar"
                  />
                </Field>
                <Field label="Spec notes" htmlFor="spec">
                  <Textarea
                    id="spec"
                    name="spec"
                    className="min-h-16"
                    placeholder="e.g. Safe margin 80px; headline max 6 words"
                  />
                </Field>
                <Button type="submit">Create template</Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
