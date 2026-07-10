import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import { getCompany, getLocalProfile } from "@/lib/db";
import {
  displayContent,
  listRagDocuments,
  listRagVersionHistory,
  previewCitation,
  uploadMetaOf,
  statusTone,
} from "@/lib/rag";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatDate, titleCase } from "@/lib/utils";
import {
  addKnowledgeDocAction,
  reviseKnowledgeDocAction,
  saveLocalProfileAction,
  setKnowledgeDocStatusAction,
  uploadRagDocumentAction,
} from "../../brand-actions";
import { LocalIntelFields } from "../../local-intel-fields";

const SOURCE_TYPES = [
  "website_copy",
  "brochure",
  "faq",
  "menu",
  "price_list",
  "brand_guide",
  "past_post",
  "case_study",
  "testimonial",
  "service_list",
  "other",
] as const;

export default async function BrandBrainPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const company = await getCompany(id);
  if (!company || !(await canAccessCompany(user, company.id))) notFound();

  const docs = await listRagDocuments(company.id);
  const local = await getLocalProfile(company.id);
  const approved = docs.filter((d) => d.status === "approved").length;
  const drafts = docs.filter((d) => d.status === "draft").length;
  const archived = docs.filter((d) => d.status === "archived").length;
  const outdated = docs.filter((d) => d.status === "outdated").length;
  const prohibited = docs.filter((d) => d.status === "prohibited").length;
  const versionHistories = await Promise.all(
    docs.map(async (doc) => ({ docId: doc.id, versions: await listRagVersionHistory(doc.id) })),
  );
  const versionsByDoc = new Map(versionHistories.map((v) => [v.docId, v.versions]));

  return (
    <div>
      <PageHeader
        title={`${company.name} — Brand Brain`}
        description="Upload menus, price lists and brand guides. Draft sources must be approved before they ground AI drafts — citations appear on governed outputs."
      >
        <Link href={`/companies/${company.id}`} className="text-sm text-primary hover:underline">
          ← Company profile
        </Link>
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-1 font-semibold">Knowledge documents</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                {approved} approved · {drafts} draft · {archived} archived · {outdated} outdated · {prohibited} prohibited
              </p>
              <div className="space-y-4">
                {docs.map((doc) => {
                  const body = displayContent(doc);
                  const meta = uploadMetaOf(doc);
                  const citePreview = previewCitation(
                    { sourceId: doc.id, title: doc.title, snippet: body.slice(0, 120) },
                  );
                  const versions = versionsByDoc.get(doc.id) ?? [];
                  return (
                    <details
                      key={doc.id}
                      className="rounded-md border border-border p-4"
                    >
                      <summary className="cursor-pointer">
                        <span className="font-medium">{doc.title}</span>{" "}
                        <span className="ml-1 inline-flex flex-wrap gap-1.5 align-middle">
                          <Badge tone="neutral">{titleCase(doc.sourceType)}</Badge>
                          <Badge tone={statusTone(doc.status)}>
                            {titleCase(doc.status)}
                          </Badge>
                          <Badge tone="primary">v{doc.version}</Badge>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Updated {formatDate(doc.updatedAt)}
                          {meta?.fileName && ` · ${meta.fileName}`}
                          {doc.previousVersions.length > 0 &&
                            ` · ${doc.previousVersions.length} prior version(s) retained`}
                        </span>
                      </summary>
                      {doc.status === "approved" && (
                        <p className="mt-3 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                          Cite preview: {citePreview}
                        </p>
                      )}
                      {versions.length > 1 && (
                        <div className="mt-3 rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground">
                          <p className="mb-1 font-medium text-foreground">Version history</p>
                          <ul className="space-y-1">
                            {versions.map((v) => (
                              <li key={v.id}>
                                v{v.versionNumber} · {titleCase(v.status)}
                                {v.fileName ? ` · ${v.fileName}` : ""}
                                {" · "}
                                {formatDate(v.createdAt)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <form action={reviseKnowledgeDocAction} className="mt-3 space-y-3">
                        <input type="hidden" name="docId" value={doc.id} />
                        <Input name="title" defaultValue={doc.title} />
                        <Textarea
                          name="content"
                          defaultValue={body}
                          className="min-h-40 text-[13px]"
                        />
                        <div className="flex gap-2">
                          <Button type="submit" variant="outline" size="sm">
                            Save as v{doc.version + 1}
                            {doc.status === "approved" ? " (→ draft)" : ""}
                          </Button>
                        </div>
                      </form>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {doc.status === "draft" && (
                          <form action={setKnowledgeDocStatusAction}>
                            <input type="hidden" name="docId" value={doc.id} />
                            <input type="hidden" name="status" value="approved" />
                            <Button type="submit" variant="default" size="sm">
                              Approve for AI
                            </Button>
                          </form>
                        )}
                        {doc.status === "approved" && (
                          <>
                            <form action={setKnowledgeDocStatusAction}>
                              <input type="hidden" name="docId" value={doc.id} />
                              <input type="hidden" name="status" value="outdated" />
                              <Button type="submit" variant="ghost" size="sm">
                                Mark outdated
                              </Button>
                            </form>
                            <form action={setKnowledgeDocStatusAction}>
                              <input type="hidden" name="docId" value={doc.id} />
                              <input type="hidden" name="status" value="prohibited" />
                              <Button type="submit" variant="ghost" size="sm">
                                Mark prohibited
                              </Button>
                            </form>
                          </>
                        )}
                        {doc.status !== "archived" && (
                          <form action={setKnowledgeDocStatusAction}>
                            <input type="hidden" name="docId" value={doc.id} />
                            <input type="hidden" name="status" value="archived" />
                            <Button type="submit" variant="ghost" size="sm">
                              Archive
                            </Button>
                          </form>
                        )}
                        {doc.status === "archived" && (
                          <form action={setKnowledgeDocStatusAction}>
                            <input type="hidden" name="docId" value={doc.id} />
                            <input type="hidden" name="status" value="draft" />
                            <Button type="submit" variant="ghost" size="sm">
                              Restore to draft
                            </Button>
                          </form>
                        )}
                      </div>
                    </details>
                  );
                })}
                {docs.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No knowledge documents yet — upload a menu, price list or brand
                    guide below so the AI has approved material to ground drafts in.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 font-semibold">Upload document</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Upload a .txt/.csv menu or price list, or paste extracted text. PDFs
                store metadata until text is pasted. New uploads start as{" "}
                <strong>draft</strong> until approved.
              </p>
              <form action={uploadRagDocumentAction} className="space-y-4">
                <input type="hidden" name="companyId" value={company.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title (optional)" htmlFor="uploadTitle">
                    <Input id="uploadTitle" name="title" placeholder="Winter menu 2026" />
                  </Field>
                  <Field label="Source type" htmlFor="uploadSourceType">
                    <Select id="uploadSourceType" name="sourceType">
                      {SOURCE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {titleCase(t)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field
                  label="File"
                  htmlFor="file"
                  hint="Text files (.txt, .csv, .md) are auto-extracted; PDFs need pasted text below."
                >
                  <Input id="file" name="file" type="file" accept=".txt,.csv,.md,.pdf,text/plain" />
                </Field>
                <Field
                  label="Extracted / pasted text"
                  htmlFor="uploadContent"
                  hint="Required unless uploading a plain-text file."
                >
                  <Textarea
                    id="uploadContent"
                    name="content"
                    className="min-h-32"
                    placeholder="Paste menu items, prices, or brand voice guidelines…"
                  />
                </Field>
                <Button type="submit">Upload as draft</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 font-semibold">Add knowledge (paste)</h2>
              <form action={addKnowledgeDocAction} className="space-y-4">
                <input type="hidden" name="companyId" value={company.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Title" htmlFor="title">
                    <Input id="title" name="title" required />
                  </Field>
                  <Field label="Source type" htmlFor="sourceType">
                    <Select id="sourceType" name="sourceType">
                      {SOURCE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {titleCase(t)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field
                  label="Content"
                  htmlFor="content"
                  hint="Paste approved text — saved as draft until you approve."
                >
                  <Textarea id="content" name="content" required className="min-h-32" />
                </Field>
                <Button type="submit" variant="outline">
                  Add as draft
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Local Area Intelligence Profile</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              The AI uses this to tailor content to the local market instead of
              producing generic copy.
            </p>
            <form action={saveLocalProfileAction} className="space-y-4">
              <input type="hidden" name="companyId" value={company.id} />
              <LocalIntelFields local={local} variant="full" />
              <Button type="submit">Save local profile</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
