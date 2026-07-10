import { requireAdmin } from "@/lib/auth/rbac";
import {
  getCmsPageVersion,
  getCmsSeoMetadata,
  listCmsPageVersions,
  listCmsPages,
  listCmsUpdateRequests,
  listCompanies,
} from "@/lib/db";
import { cmsConfigured, cmsLive, pageStatusLabel } from "@/lib/cms";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import {
  approvePageAction,
  completeUpdateRequestAction,
  createPageAction,
  createUpdateRequestAction,
  importPagesAction,
  publishPageAction,
  saveSeoAction,
  saveVersionAction,
  submitReviewAction,
} from "./actions";

export default async function CmsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; page?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter((c) => c.status !== "archived");
  const companyId =
    params.company && companies.some((c) => c.id === params.company) ? params.company : companies[0]?.id;
  const pages = companyId ? await listCmsPages(user.tenantId, companyId) : [];
  const selectedPageId = params.page && pages.some((p) => p.id === params.page) ? params.page : pages[0]?.id;
  const selectedPage = pages.find((p) => p.id === selectedPageId);
  const versions =
    companyId && selectedPageId ? await listCmsPageVersions(user.tenantId, selectedPageId) : [];
  const currentVersion = selectedPage?.currentVersionId
    ? versions.find((v) => v.id === selectedPage.currentVersionId) ?? (await getCmsPageVersion(selectedPage.currentVersionId))
    : versions[0];
  const seo = selectedPageId ? await getCmsSeoMetadata(selectedPageId) : undefined;
  const updateRequests = companyId ? await listCmsUpdateRequests(user.tenantId, companyId) : [];

  return (
    <div>
      <PageHeader
        title="Website CMS"
        description="Page and landing-page CMS with review workflow, SEO metadata, version history, and simulated publish when CMS_LIVE is off."
      >
        <Badge tone={cmsConfigured() ? "success" : "neutral"}>
          {cmsLive() ? (cmsConfigured() ? "CMS live" : "CMS_LIVE on (no API key)") : "Simulated (CMS_LIVE off)"}
        </Badge>
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardContent className="flex flex-wrap items-end gap-4 p-6">
            <form method="get" className="flex flex-wrap gap-3">
              <Field label="Company" htmlFor="company">
                <Select id="company" name="company" defaultValue={companyId ?? ""}>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {selectedPageId && <input type="hidden" name="page" value={selectedPageId} />}
              <Button type="submit" variant="secondary">
                Switch
              </Button>
            </form>
            {companyId && (
              <form action={importPagesAction}>
                <input type="hidden" name="companyId" value={companyId} />
                <Button type="submit" variant="outline">
                  Import pages (simulated)
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {companyId && (
          <Card>
            <CardContent className="space-y-4 p-6">
              <h2 className="font-semibold">Create draft page</h2>
              <form action={createPageAction} className="space-y-3">
                <input type="hidden" name="companyId" value={companyId} />
                <Field label="Title" htmlFor="title">
                  <Input id="title" name="title" required placeholder="Summer offer" />
                </Field>
                <Field label="Slug" htmlFor="slug">
                  <Input id="slug" name="slug" required placeholder="summer-offer" />
                </Field>
                <Field label="Kind" htmlFor="kind">
                  <Select id="kind" name="kind" defaultValue="page">
                    <option value="page">Page</option>
                    <option value="landing">Landing page</option>
                  </Select>
                </Field>
                <Field label="Body HTML" htmlFor="bodyHtml">
                  <Textarea id="bodyHtml" name="bodyHtml" rows={4} placeholder="<h1>Hello</h1>" />
                </Field>
                <Button type="submit">Create draft</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Pages</h2>
            {!pages.length && <p className="text-sm text-muted-foreground">No pages yet.</p>}
            <ul className="space-y-2">
              {pages.map((page) => (
                <li key={page.id}>
                  <a
                    href={`/cms?company=${companyId}&page=${page.id}`}
                    className={`block rounded border p-3 text-sm ${page.id === selectedPageId ? "border-primary bg-muted/40" : ""}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{page.title}</span>
                      <Badge tone="neutral">/{page.slug}</Badge>
                      <Badge tone="primary">{pageStatusLabel(page.status)}</Badge>
                    </div>
                    {page.liveUrl && <p className="mt-1 text-xs text-muted-foreground">{page.liveUrl}</p>}
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {selectedPage && currentVersion && companyId && (
          <>
            <Card className="lg:col-span-2">
              <CardContent className="space-y-4 p-6">
                <h2 className="font-semibold">Review & publish</h2>
                <p className="text-sm text-muted-foreground">
                  v{currentVersion.versionNumber} · {pageStatusLabel(currentVersion.status)}
                </p>
                <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: currentVersion.bodyHtml }} />
                <div className="flex flex-wrap gap-2">
                  {currentVersion.status === "draft" && (
                    <form action={submitReviewAction}>
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="versionId" value={currentVersion.id} />
                      <Button size="sm" type="submit">
                        Submit for review
                      </Button>
                    </form>
                  )}
                  {currentVersion.status === "pending_review" && (
                    <form action={approvePageAction}>
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="versionId" value={currentVersion.id} />
                      <Button size="sm" type="submit">
                        Approve
                      </Button>
                    </form>
                  )}
                  {currentVersion.status === "approved" && (
                    <form action={publishPageAction}>
                      <input type="hidden" name="companyId" value={companyId} />
                      <input type="hidden" name="versionId" value={currentVersion.id} />
                      <Button size="sm" type="submit">
                        Publish
                      </Button>
                    </form>
                  )}
                </div>
                <form action={saveVersionAction} className="space-y-3 border-t pt-4">
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="pageId" value={selectedPage.id} />
                  <Field label="New version title" htmlFor="vtitle">
                    <Input id="vtitle" name="title" defaultValue={selectedPage.title} />
                  </Field>
                  <Field label="Body HTML" htmlFor="vbody">
                    <Textarea id="vbody" name="bodyHtml" rows={3} defaultValue={currentVersion.bodyHtml} />
                  </Field>
                  <Field label="Change summary" htmlFor="changeSummary">
                    <Input id="changeSummary" name="changeSummary" placeholder="Updated hero copy" />
                  </Field>
                  <Button type="submit" variant="outline" size="sm">
                    Save new version
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-6">
                <h2 className="font-semibold">Version history</h2>
                <ul className="space-y-2 text-sm">
                  {versions.map((v) => (
                    <li key={v.id} className="rounded border p-2">
                      <div className="font-medium">
                        v{v.versionNumber} · {pageStatusLabel(v.status)}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDate(v.createdAt)}</div>
                      {v.changeSummary && <div className="text-xs">{v.changeSummary}</div>}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-4 p-6">
                <h2 className="font-semibold">SEO metadata</h2>
                <form action={saveSeoAction} className="space-y-3">
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="pageId" value={selectedPage.id} />
                  <Field label="Meta title" htmlFor="metaTitle">
                    <Input id="metaTitle" name="metaTitle" defaultValue={seo?.metaTitle ?? ""} />
                  </Field>
                  <Field label="Meta description" htmlFor="metaDescription">
                    <Textarea id="metaDescription" name="metaDescription" rows={2} defaultValue={seo?.metaDescription ?? ""} />
                  </Field>
                  <Field label="Canonical URL" htmlFor="canonicalUrl">
                    <Input id="canonicalUrl" name="canonicalUrl" defaultValue={seo?.canonicalUrl ?? ""} />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="noIndex" defaultChecked={seo?.noIndex} />
                    No index
                  </label>
                  <Button type="submit" size="sm">
                    Save SEO
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        )}

        {companyId && (
          <Card className="lg:col-span-3">
            <CardContent className="space-y-4 p-6">
              <h2 className="font-semibold">Update requests</h2>
              <form action={createUpdateRequestAction} className="grid gap-3 md:grid-cols-2">
                <input type="hidden" name="companyId" value={companyId} />
                {selectedPageId && <input type="hidden" name="pageId" value={selectedPageId} />}
                <Field label="Title" htmlFor="urt">
                  <Input id="urt" name="title" required placeholder="Update hero image" />
                </Field>
                <Field label="Description" htmlFor="urd">
                  <Input id="urd" name="description" required placeholder="Client requested new photo" />
                </Field>
                <Button type="submit" className="md:col-span-2 md:w-fit">
                  Open request
                </Button>
              </form>
              <ul className="space-y-2 text-sm">
                {updateRequests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3">
                    <div>
                      <div className="font-medium">{r.title}</div>
                      <div className="text-muted-foreground">{r.description}</div>
                      <Badge tone="neutral">{r.status}</Badge>
                    </div>
                    {r.status !== "completed" && (
                      <form action={completeUpdateRequestAction}>
                        <input type="hidden" name="companyId" value={companyId} />
                        <input type="hidden" name="requestId" value={r.id} />
                        <Button size="sm" variant="outline" type="submit">
                          Mark complete
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
