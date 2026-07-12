import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import {
  getCompany,
  listClaims,
  listConsents,
  listEvidence,
  listResponses,
} from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { titleCase } from "@/lib/utils";
import {
  addClaimAction,
  addConsentAction,
  addEvidenceAction,
  addResponseAction,
  setClaimActiveAction,
  setResponseActiveAction,
  withdrawConsentAction,
} from "../../brand-actions";
import { CONTENT_PLATFORM_OPTIONS } from "@/lib/promo-catalog";

const EVIDENCE_TYPES = [
  "licence", "certification", "award", "pricing", "guarantee_terms",
  "customer_outcome", "comparison", "safety", "other",
] as const;

const CHANNEL_OPTIONS = [
  ...CONTENT_PLATFORM_OPTIONS,
  { value: "Website", label: "Website" },
  { value: "In-store", label: "In-store" },
];

const RESPONSE_CATEGORIES = [
  "compliment_thanks", "complaint_acknowledgement", "review_response",
  "booking_reply", "pricing_reply", "apology", "escalation", "moderation",
] as const;

function consentUsable(c: { consentObtained: boolean; withdrawn: boolean; expiryDate?: string }) {
  if (!c.consentObtained || c.withdrawn) return false;
  if (c.expiryDate && c.expiryDate < new Date().toISOString().slice(0, 10)) return false;
  return true;
}

export default async function GovernancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const company = await getCompany(id);
  if (!company || !(await canAccessCompany(user, company.id))) notFound();

  const consents = await listConsents(company.id);
  const evidence = await listEvidence(company.id);
  const claims = await listClaims(company.id, false);
  const responses = await listResponses(user.tenantId, company.id, false);

  return (
    <div>
      <PageHeader
        title={`${company.name} — Governance`}
        description="Consent Register · Evidence Locker · Claims Library · Approved Responses"
      >
        <Link href={`/companies/${company.id}`} className="text-sm text-primary hover:underline">
          ← Company profile
        </Link>
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        {/* Consent Register */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Consent Register</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Customer photos, names and testimonials are blocked unless a valid
              consent record exists.
            </p>
            <div className="mb-5 space-y-3">
              {consents.map((c) => (
                <div key={c.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.personShown}</span>
                    {consentUsable(c) ? (
                      <Badge tone="success">Valid</Badge>
                    ) : (
                      <Badge tone="danger">
                        {c.withdrawn ? "Withdrawn" : !c.consentObtained ? "Not obtained" : "Expired"}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.permittedChannels.length > 0 && `Channels: ${c.permittedChannels.join(", ")} · `}
                    {c.expiryDate && `Expires ${c.expiryDate} · `}
                    {c.documentName ?? "No document"}
                    {c.restrictions && ` · ${c.restrictions}`}
                  </p>
                  {!c.withdrawn && (
                    <form action={withdrawConsentAction} className="mt-2">
                      <input type="hidden" name="consentId" value={c.id} />
                      <input type="hidden" name="companyId" value={company.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Withdraw
                      </Button>
                    </form>
                  )}
                </div>
              ))}
              {consents.length === 0 && (
                <p className="text-sm text-muted-foreground">No consent records.</p>
              )}
            </div>
            <details className="rounded-md border border-dashed border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Add consent record</summary>
              <form action={addConsentAction} className="mt-3 space-y-3">
                <input type="hidden" name="companyId" value={company.id} />
                <Field
                  label="Person / customer shown"
                  htmlFor="personShown"
                  hint="Name as it appears in the asset"
                >
                  <Input
                    id="personShown"
                    name="personShown"
                    required
                    placeholder="e.g. Dave Chen"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Consent document" htmlFor="documentName">
                    <Input
                      id="documentName"
                      name="documentName"
                      placeholder="e.g. model-release-dave.pdf"
                    />
                  </Field>
                  <Field label="Expiry date" htmlFor="expiryDate" hint="Optional">
                    <Input id="expiryDate" name="expiryDate" type="date" />
                  </Field>
                </div>
                <Field
                  label="Permitted channels"
                  htmlFor="permittedChannels"
                  hint="Leave all unchecked to permit every channel"
                >
                  <div
                    id="permittedChannels"
                    className="flex flex-wrap gap-x-4 gap-y-2"
                  >
                    {CHANNEL_OPTIONS.map((ch) => (
                      <label
                        key={ch.value}
                        className="inline-flex items-center gap-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="permittedChannels"
                          value={ch.value}
                          className="h-4 w-4"
                        />
                        {ch.label}
                      </label>
                    ))}
                  </div>
                </Field>
                <Field label="Restrictions" htmlFor="restrictions">
                  <Input
                    id="restrictions"
                    name="restrictions"
                    placeholder="e.g. No paid ads; face may not be cropped"
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" name="consentObtained" className="h-4 w-4" defaultChecked />
                  Consent has been obtained
                </label>
                <Button type="submit" size="sm">Add record</Button>
              </form>
            </details>
          </CardContent>
        </Card>

        {/* Evidence Locker */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Evidence Locker</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Proof backing claims: licences, awards, pricing, comparisons, outcomes.
            </p>
            <div className="mb-5 space-y-3">
              {evidence.map((e) => (
                <div key={e.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{e.title}</span>
                    <Badge tone="info">{titleCase(e.evidenceType)}</Badge>
                    {e.validUntil && (
                      <Badge tone={e.validUntil >= new Date().toISOString().slice(0, 10) ? "success" : "danger"}>
                        {e.validUntil >= new Date().toISOString().slice(0, 10)
                          ? `Valid until ${e.validUntil}`
                          : `EXPIRED ${e.validUntil}`}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{e.detail}</p>
                </div>
              ))}
              {evidence.length === 0 && (
                <p className="text-sm text-muted-foreground">No evidence on file.</p>
              )}
            </div>
            <details className="rounded-md border border-dashed border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Add evidence</summary>
              <form action={addEvidenceAction} className="mt-3 space-y-3">
                <input type="hidden" name="companyId" value={company.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Title" htmlFor="ev-title" hint="What this proof is">
                    <Input
                      id="ev-title"
                      name="title"
                      required
                      placeholder="e.g. Liquor licence 2026"
                    />
                  </Field>
                  <Field label="Type" htmlFor="evidenceType">
                    <Select id="evidenceType" name="evidenceType">
                      {EVIDENCE_TYPES.map((t) => (
                        <option key={t} value={t}>{titleCase(t)}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Detail" htmlFor="detail" hint="Key facts an approver should know">
                  <Textarea
                    id="detail"
                    name="detail"
                    className="min-h-16"
                    placeholder="e.g. Issued by NSW Fair Trading — covers on-premise only"
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Document" htmlFor="ev-doc">
                    <Input id="ev-doc" name="documentName" placeholder="licence-2026.pdf" />
                  </Field>
                  <Field label="Valid until" htmlFor="validUntil">
                    <Input id="validUntil" name="validUntil" type="date" />
                  </Field>
                </div>
                <Button type="submit" size="sm">Add evidence</Button>
              </form>
            </details>
          </CardContent>
        </Card>

        {/* Claims Library */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Claims Library</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              The only claims the AI may make, word-for-word, linked to evidence.
            </p>
            <div className="mb-5 space-y-3">
              {claims.map((c) => {
                const ev = evidence.find((e) => e.id === c.evidenceId);
                return (
                  <div key={c.id} className={`rounded-md border border-border p-3 text-sm ${c.active ? "" : "opacity-60"}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">“{c.claimText}”</span>
                      <Badge tone={c.active ? "success" : "neutral"}>
                        {c.active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ev ? `Evidence: ${ev.title}` : "No evidence linked"}
                      {c.allowedChannels.length > 0 && ` · Channels: ${c.allowedChannels.join(", ")}`}
                    </p>
                    <form action={setClaimActiveAction} className="mt-2">
                      <input type="hidden" name="claimId" value={c.id} />
                      <input type="hidden" name="companyId" value={company.id} />
                      <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                      <Button type="submit" variant="ghost" size="sm">
                        {c.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </form>
                  </div>
                );
              })}
              {claims.length === 0 && (
                <p className="text-sm text-muted-foreground">No approved claims yet.</p>
              )}
            </div>
            <details className="rounded-md border border-dashed border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Add approved claim</summary>
              <form action={addClaimAction} className="mt-3 space-y-3">
                <input type="hidden" name="companyId" value={company.id} />
                <Field
                  label="Approved claim wording"
                  htmlFor="claimText"
                  hint="Exact phrase AI may use — word for word"
                >
                  <Input
                    id="claimText"
                    name="claimText"
                    required
                    placeholder='e.g. "Award-winning coffee since 2014"'
                  />
                </Field>
                <Field label="Link evidence" htmlFor="evidenceId">
                  <Select id="evidenceId" name="evidenceId" defaultValue="">
                    <option value="">— none —</option>
                    {evidence.map((e) => (
                      <option key={e.id} value={e.id}>{e.title}</option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Allowed channels"
                  htmlFor="allowedChannels"
                  hint="Leave all unchecked to permit every channel"
                >
                  <div
                    id="allowedChannels"
                    className="flex flex-wrap gap-x-4 gap-y-2"
                  >
                    {CHANNEL_OPTIONS.map((ch) => (
                      <label
                        key={ch.value}
                        className="inline-flex items-center gap-1.5 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="allowedChannels"
                          value={ch.value}
                          className="h-4 w-4"
                        />
                        {ch.label}
                      </label>
                    ))}
                  </div>
                </Field>
                <Button type="submit" size="sm">Add claim</Button>
              </form>
            </details>
          </CardContent>
        </Card>

        {/* Approved Response Library */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Approved Response Library</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Pre-approved social reply wording. Group-wide entries apply to every company.
            </p>
            <div className="mb-5 space-y-3">
              {responses.map((r) => (
                <div key={r.id} className={`rounded-md border border-border p-3 text-sm ${r.active ? "" : "opacity-60"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.title}</span>
                    <Badge tone="info">{titleCase(r.category)}</Badge>
                    <Badge tone={r.companyId ? "primary" : "neutral"}>
                      {r.companyId ? company.name : "Group-wide"}
                    </Badge>
                    {!r.active && <Badge tone="neutral">Inactive</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.responseText}</p>
                  <form action={setResponseActiveAction} className="mt-2">
                    <input type="hidden" name="responseId" value={r.id} />
                    <input type="hidden" name="companyId" value={company.id} />
                    <input type="hidden" name="active" value={r.active ? "false" : "true"} />
                    <Button type="submit" variant="ghost" size="sm">
                      {r.active ? "Deactivate" : "Reactivate"}
                    </Button>
                  </form>
                </div>
              ))}
            </div>
            <details className="rounded-md border border-dashed border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">Add approved response</summary>
              <form action={addResponseAction} className="mt-3 space-y-3">
                <input type="hidden" name="companyId" value={company.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Title" htmlFor="resp-title" hint="Internal label">
                    <Input
                      id="resp-title"
                      name="title"
                      required
                      placeholder="e.g. Thanks for the review"
                    />
                  </Field>
                  <Field label="Category" htmlFor="category">
                    <Select id="category" name="category">
                      {RESPONSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{titleCase(c)}</option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field
                  label="Response text"
                  htmlFor="responseText"
                  hint="Use {company} as a placeholder for the company name."
                >
                  <Textarea
                    id="responseText"
                    name="responseText"
                    required
                    className="min-h-20"
                    placeholder="Thanks for visiting {company} — we'd love to welcome you back soon."
                  />
                </Field>
                <Button type="submit" size="sm">Add response</Button>
              </form>
            </details>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
