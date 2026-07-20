import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canAccessCompany, isAdmin, userHasPermission } from "@/lib/auth/rbac";
import {
  activeSchedulesForContent,
  getAsset,
  getCompany,
  getContent,
  listAssetsForCompany,
  listContent,
  listContentComments,
} from "@/lib/db";
import { assetChannelBlockReason, licenceLabel } from "@/lib/assets";
import { canRepurposeSource } from "@/lib/content-repurposing";
import { now } from "@/lib/utils";
import {
  cancelScheduleAction,
  scheduleAtOptimalWindowAction,
  schedulePostAction,
} from "../../calendar/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, RiskBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatDate, titleCase } from "@/lib/utils";
import { canApproveRoute, ROUTE_LABEL } from "@/lib/routing";
import { CONTENT_PLATFORM_OPTIONS } from "@/lib/promo-catalog";
import {
  approveContentAction,
  attachAssetAction,
  detachAssetAction,
  rejectContentAction,
  recheckComplianceAction,
  repurposeContentAction,
  restoreVersionAction,
  addContentCommentAction,
  saveContentAction,
  saveReuseAction,
  shareForClientApprovalAction,
  submitForApprovalAction,
  submitHeldToClientAction,
} from "../actions";

const REPURPOSE_TYPES: [string, string][] = [
  ["social_post", "Social media post"],
  ["email_newsletter", "Email newsletter"],
  ["blog_article", "Blog article"],
  ["website_copy", "Website copy"],
  ["video_script", "Video script"],
  ["brochure_copy", "Brochure copy"],
  ["seo_meta", "SEO meta set"],
];

export default async function ContentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ scheduleError?: string; scheduledAt?: string }>;
}) {
  const { id } = await params;
  const qs = searchParams ? await searchParams : {};
  const user = await requireUser();
  const content = await getContent(id);
  if (!content || !(await canAccessCompany(user, content.companyId))) notFound();

  const company = (await getCompany(content.companyId))!;
  const comments = await listContentComments(content.id);
  const admin = isAdmin(user);
  const canApprove = userHasPermission(user, "approve_content");
  const waitingOnClient = content.clientReview?.status === "pending";
  const locked = content.status === "approved" || content.status === "scheduled";
  // Terminal content is read-only — the server actions enforce this too.
  const terminal = ["published", "archived", "rejected"].includes(content.status);
  const schedules = await activeSchedulesForContent(content.id);
  const canSubmit = ["ai_draft", "user_edited", "changes_required"].includes(
    content.status,
  );
  const awaitingApproval = content.status === "pending_approval";
  const canScheduleAtBestTime = content.status === "approved";
  const c = content.compliance;
  // Phase 5: draft-comparison variants and repurposing lineage.
  const variants = content.variantGroupId
    ? (await listContent(user.tenantId)).filter((v) => v.variantGroupId === content.variantGroupId)
    : [];
  const repurposedFrom = content.repurposedFromId
    ? await getContent(content.repurposedFromId)
    : undefined;
  const today = now().slice(0, 10);
  const expired = !!content.expiryDate && content.expiryDate < today;

  // Phase 11 — referenced creative assets. Only approved assets can be attached;
  // scheduling/publishing is blocked on any channel a referenced asset's rights
  // don't permit.
  const attachedAssets = (
    await Promise.all((content.assetIds ?? []).map((aid) => getAsset(aid)))
  ).filter((a): a is NonNullable<typeof a> => !!a);
  const attachedIds = new Set(attachedAssets.map((a) => a.id));
  const availableAssets = (
    await listAssetsForCompany(content.companyId, {
      approvedOnly: true,
    })
  ).filter((a) => !attachedIds.has(a.id));
  const canManageAssets = !["published", "archived", "rejected"].includes(
    content.status,
  );
  // Which scheduled platforms an attached asset currently blocks (rights/expiry).
  const assetScheduleWarnings: string[] = [];
  for (const a of attachedAssets) {
    for (const s of schedules) {
      const reason = await assetChannelBlockReason(a, s.platform, today);
      if (reason) {
        assetScheduleWarnings.push(`"${a.name}" blocks ${s.platform}: ${reason}`);
      }
    }
  }

  return (
    <div>
      <PageHeader title={content.title} description={`${company.name} · ${titleCase(content.type)}`} hideExplainer>
        {content.groundingLabel && (
          <Badge tone={content.groundingLabel === "grounded" ? "success" : "warning"}>
            {titleCase(content.groundingLabel)}
          </Badge>
        )}
        {content.routedTo && awaitingApproval && (
          <Badge tone={content.routedTo === "admin" ? "neutral" : "warning"}>
            {ROUTE_LABEL[content.routedTo]}
          </Badge>
        )}
        {content.qualityRouting && (
          <Badge
            tone={
              content.qualityRouting.queue === "in_client_review"
                ? "success"
                : content.qualityRouting.gate === "fail" ||
                    content.qualityRouting.gate === "escalate"
                  ? "danger"
                  : "warning"
            }
          >
            {content.qualityRouting.queue === "in_client_review"
              ? "In client review"
              : "In agency review"}{" "}
            · {content.qualityRouting.gate.toUpperCase()}
          </Badge>
        )}
        <StatusBadge status={content.status} />
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {qs.scheduleError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {qs.scheduleError}
            </div>
          )}
          {qs.scheduledAt && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Scheduled at best time: {qs.scheduledAt}
            </div>
          )}
          {content.qualityRouting && (
            <div
              className={`rounded-md border p-3 text-sm ${
                content.qualityRouting.queue === "in_client_review"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              <p className="font-medium">
                Quality routing · {content.qualityRouting.gate.toUpperCase()} →{" "}
                {content.qualityRouting.queue === "in_client_review"
                  ? "client review"
                  : "agency review"}
              </p>
              <p className="mt-1 text-xs opacity-90">{content.qualityRouting.reason}</p>
              <p className="mt-1 text-xs opacity-80">
                Service level: {content.qualityRouting.serviceLevel.replace(/_/g, " ")}
              </p>
            </div>
          )}
          {content.duplicateWarning && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              ⚠ {content.duplicateWarning}
            </div>
          )}
          {content.aiCritique && content.aiCritique.notes.length > 0 && (
            <div
              className={`rounded-md border p-3 text-sm ${
                content.aiCritique.status === "block"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : content.aiCritique.status === "warn"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-green-200 bg-green-50 text-green-800"
              }`}
            >
              <p className="font-medium">
                Pre-publish critique ({content.aiCritique.status})
                {content.aiCritique.platform ? ` · ${content.aiCritique.platform}` : ""}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {content.aiCritique.notes.map((n, i) => (
                  <li key={i}>
                    [{n.severity}] {n.message}
                    {n.suggestion ? ` — ${n.suggestion}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {variants.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Compare variants:
              </span>
              {variants.map((v) => (
                <Link
                  key={v.id}
                  href={`/content/${v.id}`}
                  className={
                    v.id === content.id
                      ? "rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
                      : "rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-primary"
                  }
                >
                  {v.variantLabel ?? "Variant"}
                  {v.status === "approved" && " ✓"}
                  {v.status === "archived" && " (archived)"}
                </Link>
              ))}
            </div>
          )}
          {repurposedFrom && (
            <div className="rounded-md border border-border bg-card p-3 text-sm">
              Repurposed from{" "}
              <Link
                href={`/content/${repurposedFrom.id}`}
                className="text-primary hover:underline"
              >
                {repurposedFrom.title}
              </Link>
            </div>
          )}
          <Card>
            <CardContent className="p-6">
              {terminal ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Content{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      ({titleCase(content.status)} — read-only; repurpose it to
                      create a new draft)
                    </span>
                  </p>
                  <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-4 font-mono text-[13px] leading-relaxed">
                    {content.body}
                  </pre>
                </div>
              ) : (
                <form action={saveContentAction} className="space-y-4">
                  <input type="hidden" name="contentId" value={content.id} />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">Title</label>
                    <Input name="title" defaultValue={content.title} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">
                      Content{" "}
                      {locked && (
                        <span className="text-xs font-normal text-muted-foreground">
                          (approved &amp; locked — saving edits returns it for re-approval)
                        </span>
                      )}
                    </label>
                    <Textarea
                      name="body"
                      defaultValue={content.body}
                      className="min-h-64 font-mono text-[13px] leading-relaxed"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="outline">
                      Save edits
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            {canSubmit && (
              <form action={submitForApprovalAction}>
                <input type="hidden" name="contentId" value={content.id} />
                <Button type="submit">Submit for approval</Button>
              </form>
            )}
            {locked && (
              <a
                href={`/api/export/content/${content.id}`}
                className={buttonClasses("outline")}
              >
                Export to Word
              </a>
            )}
            <a
              href={`/api/export/compliance/${content.id}`}
              className={buttonClasses("ghost")}
            >
              Compliance report
            </a>
            {canRepurposeSource(content) && (
              <Link
                href={`/studio?repurposeFrom=${content.id}`}
                className={buttonClasses("outline")}
              >
                Repurpose for platforms
              </Link>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {c && (
            <Card>
              <CardContent className="p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Compliance</h2>
                  <RiskBadge level={c.riskLevel} />
                </div>
                {c.issues.length === 0 ? (
                  <p className="text-sm text-emerald-700">
                    No issues detected. Safe to proceed.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {c.issues.map((issue, i) => (
                      <li key={i} className="text-sm">
                        <div className="flex items-center gap-2">
                          <RiskBadge level={issue.severity} />
                        </div>
                        <p className="mt-1">{issue.message}</p>
                        {issue.suggestion && (
                          <p className="text-xs text-muted-foreground">
                            → {issue.suggestion}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {c.requiresEvidence && (
                  <p className="mt-3 text-xs text-amber-700">
                    Evidence required before approval.
                  </p>
                )}
                <form action={recheckComplianceAction} className="mt-4">
                  <input type="hidden" name="contentId" value={content.id} />
                  <Button type="submit" variant="ghost" size="sm">
                    Re-run check
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {canApprove && awaitingApproval && waitingOnClient && (
            <Card className="border-amber-200">
              <CardContent className="p-6">
                <h2 className="mb-1 font-semibold">Waiting on client</h2>
                <p className="text-sm text-muted-foreground">
                  Shared with {content.clientReview?.email}. Agency Approve/Reject
                  is hidden here so an open client review is not overridden — use
                  Approvals → Waiting on client, or re-send the link below if needed.
                </p>
                <Link
                  href="/approvals"
                  className="mt-3 inline-block text-sm text-primary hover:underline"
                >
                  Open Approvals →
                </Link>
              </CardContent>
            </Card>
          )}

          {canApprove && awaitingApproval && !waitingOnClient && (
            <Card className="border-primary/40">
              <CardContent className="p-6">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Approval decision</h2>
                  {content.routedTo && (
                    <Badge tone={content.routedTo === "admin" ? "neutral" : "warning"}>
                      {ROUTE_LABEL[content.routedTo]}
                    </Badge>
                  )}
                </div>
                {c && !c.canProceed && (
                  <p className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
                    Critical compliance issue — resolve before approving.
                  </p>
                )}
                {!canApproveRoute(user, content.routedTo ?? "admin") && (
                  <p className="mb-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                    This item requires the super admin ({ROUTE_LABEL[content.routedTo ?? "admin"]}).
                  </p>
                )}
                <form action={approveContentAction} className="mb-3">
                  <input type="hidden" name="contentId" value={content.id} />
                  <ActionSubmitButton
                    type="submit"
                    className="w-full"
                    pendingLabel="Approving…"
                    disabled={
                      (!!c && !c.canProceed) ||
                      !canApproveRoute(user, content.routedTo ?? "admin")
                    }
                  >
                    Approve
                  </ActionSubmitButton>
                </form>
                <form action={rejectContentAction} className="space-y-2">
                  <input type="hidden" name="contentId" value={content.id} />
                  <label className="sr-only" htmlFor={`detail-reject-note-${content.id}`}>
                    Rejection reason
                  </label>
                  <Textarea
                    id={`detail-reject-note-${content.id}`}
                    name="note"
                    placeholder="Reason / changes needed…"
                    className="min-h-16"
                  />
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" name="changesOnly" className="h-4 w-4" />
                    Request changes (return to editor)
                  </label>
                  <ActionSubmitButton
                    type="submit"
                    variant="destructive"
                    className="w-full"
                    pendingLabel="Rejecting…"
                  >
                    Reject
                  </ActionSubmitButton>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Quality hold — staff submit to client after review */}
          {admin &&
            awaitingApproval &&
            content.qualityRouting?.decision === "hold_agency" &&
            !content.clientReview && (
              <Card className="border-amber-200">
                <CardContent className="p-6">
                  <h2 className="mb-1 font-semibold">Needs attention</h2>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Held for agency review. After you&apos;re satisfied, submit to the client
                    Approvals queue — they get notified. Nothing publishes from here.
                  </p>
                  <form action={submitHeldToClientAction} className="space-y-2">
                    <input type="hidden" name="contentId" value={content.id} />
                    <Input
                      type="email"
                      name="clientEmail"
                      placeholder="client@example.com (optional if profile has email)"
                    />
                    <ActionSubmitButton type="submit" className="w-full" pendingLabel="Submitting…">
                      Submit to client review
                    </ActionSubmitButton>
                  </form>
                </CardContent>
              </Card>
            )}

          {/* Client approval link — status + re-send (durable stamp). Hidden while
              hold_agency still needs the Needs-attention card first. */}
          {admin &&
            awaitingApproval &&
            !(
              content.qualityRouting?.decision === "hold_agency" &&
              !content.clientReview
            ) && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-1 font-semibold">Client approval link</h2>
                <p className="mb-3 text-sm text-muted-foreground">
                  Send or re-send a secure no-login link. Re-sends supersede the prior
                  managed approval request so the new token still ACKs correctly.
                </p>
                {content.clientReview ? (
                  <div className="space-y-2 rounded-md border border-border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{content.clientReview.email}</span>
                      <Badge
                        tone={
                          content.clientReview.status === "approved"
                            ? "success"
                            : content.clientReview.status === "changes_requested"
                              ? "warning"
                              : "info"
                        }
                      >
                        {titleCase(content.clientReview.status)}
                      </Badge>
                    </div>
                    {content.clientReview.note && (
                      <p className="text-muted-foreground">“{content.clientReview.note}”</p>
                    )}
                    <input
                      readOnly
                      value={content.clientReview.link}
                      className="w-full rounded border border-input bg-muted/40 px-2 py-1 text-xs"
                    />
                    <p className="text-xs text-muted-foreground">
                      Expires {content.clientReview.expiresAt.slice(0, 10)}
                    </p>
                  </div>
                ) : null}
                <form action={shareForClientApprovalAction} className="mt-3 space-y-2">
                  <input type="hidden" name="contentId" value={content.id} />
                  <Input type="email" name="clientEmail" placeholder="client@example.com" required />
                  <ActionSubmitButton
                    type="submit"
                    variant="outline"
                    className="w-full"
                    pendingLabel="Sharing…"
                  >
                    {content.clientReview ? "Re-send / update link" : "Share for client approval"}
                  </ActionSubmitButton>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Collaborative comments (internal team + external clients) */}
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Comments ({comments.length})</h2>
              <div className="space-y-3">
                {comments.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No comments yet. Leave a note for your team — clients can comment here too via their approval link.
                  </p>
                )}
                {comments.map((cm) => (
                  <div key={cm.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-medium">{cm.authorName}</span>
                      <Badge tone={cm.authorKind === "client" ? "info" : "neutral"}>
                        {cm.authorKind === "client" ? "Client" : "Team"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(cm.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{cm.body}</p>
                  </div>
                ))}
              </div>
              <form action={addContentCommentAction} className="mt-3 space-y-2">
                <input type="hidden" name="contentId" value={content.id} />
                <Textarea name="body" placeholder="Add a comment…" className="min-h-16" required />
                <Button type="submit" size="sm" variant="outline">Comment</Button>
              </form>
            </CardContent>
          </Card>

          {content.claimAudit && content.claimAudit.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Claims audit</h2>
                <ul className="space-y-2">
                  {content.claimAudit.map((a, i) => (
                    <li key={i} className="text-sm">
                      <Badge
                        tone={
                          a.status === "approved"
                            ? "success"
                            : a.status === "evidence_on_file"
                              ? "info"
                              : "danger"
                        }
                      >
                        {titleCase(a.status)}
                      </Badge>
                      <p className="mt-1">{a.claim}</p>
                      {a.evidenceTitle && (
                        <p className="text-xs text-muted-foreground">
                          Evidence: {a.evidenceTitle}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {content.sourceRefs && content.sourceRefs.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Source references</h2>
                <div className="space-y-3">
                  {content.sourceRefs.map((r, i) => (
                    <div key={i} className="text-sm">
                      <p className="font-medium">
                        [S{i + 1}] {r.title}
                      </p>
                      <blockquote className="mt-1 border-l-2 border-border pl-2 text-xs text-muted-foreground">
                        {r.snippet}
                      </blockquote>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Provenance</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">AI model</dt>
                  <dd className="text-right font-medium">{content.aiModel ?? "—"}</dd>
                </div>
                {content.estCostUsd !== undefined && content.estCostUsd > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Est. AI cost</dt>
                    <dd className="font-medium">${content.estCostUsd.toFixed(4)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Brand fit</dt>
                  <dd className="font-medium">{content.brandFitScore ?? "—"}/100</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium">{formatDate(content.createdAt)}</dd>
                </div>
                {content.approvedAt && (
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Approved</dt>
                    <dd className="font-medium">{formatDate(content.approvedAt)}</dd>
                  </div>
                )}
              </dl>
              {content.sourcesUsed && content.sourcesUsed.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Grounded in
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {content.sourcesUsed.map((s, i) => (
                      <Badge key={i} tone="primary">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {content.requestId && (
                <Link
                  href={`/requests/${content.requestId}`}
                  className="mt-4 inline-block text-sm text-primary hover:underline"
                >
                  ← View source request
                </Link>
              )}
              {content.campaignId && (
                <Link
                  href={`/campaigns/${content.campaignId}`}
                  className="mt-2 block text-sm text-primary hover:underline"
                >
                  ← View campaign
                </Link>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Creative assets</h2>
              {assetScheduleWarnings.length > 0 && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {assetScheduleWarnings.map((w, i) => (
                    <p key={i}>⚠ {w}</p>
                  ))}
                </div>
              )}
              {attachedAssets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No assets referenced. Attach approved creative to control which
                  channels this can publish to.
                </p>
              ) : (
                <ul className="space-y-2">
                  {attachedAssets.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        <Link href={`/assets/${a.id}`} className="text-primary hover:underline">
                          {a.name}
                        </Link>
                        <span className="ml-1 text-xs text-muted-foreground">
                          ·{" "}
                          {a.usageRights.allowedChannels.length === 0
                            ? "all channels"
                            : a.usageRights.allowedChannels.join(", ")}
                          {a.usageRights.expiryDate && a.usageRights.expiryDate < today
                            ? " · expired"
                            : ""}
                        </span>
                      </span>
                      {canManageAssets && (
                        <form action={detachAssetAction}>
                          <input type="hidden" name="contentId" value={content.id} />
                          <input type="hidden" name="assetId" value={a.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Remove
                          </Button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {canManageAssets && availableAssets.length > 0 && (
                <form action={attachAssetAction} className="mt-3 space-y-2">
                  <input type="hidden" name="contentId" value={content.id} />
                  <Select name="assetId" defaultValue={availableAssets[0].id}>
                    {availableAssets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({licenceLabel(a.usageRights.licenceType)})
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" variant="outline" size="sm" className="w-full">
                    Attach asset
                  </Button>
                </form>
              )}
              {canManageAssets && availableAssets.length === 0 && attachedAssets.length === 0 && (
                <Link href="/assets/new" className="mt-3 inline-block text-sm text-primary hover:underline">
                  Register an asset →
                </Link>
              )}
            </CardContent>
          </Card>

          {locked && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Schedule</h2>
                {schedules.length > 0 && (
                  <ul className="mb-3 space-y-1.5">
                    {schedules.map((s) => (
                      <li key={s.id} className="flex items-center justify-between text-sm">
                        <span>
                          {s.platform} · {s.scheduledDate}
                          {s.scheduledTime && ` ${s.scheduledTime}`}
                        </span>
                        <form action={cancelScheduleAction}>
                          <input type="hidden" name="postId" value={s.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Cancel
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                <form action={schedulePostAction} className="space-y-2">
                  <input type="hidden" name="contentId" value={content.id} />
                  <Field label="Platform" htmlFor="sched-platform">
                    <Select
                      id="sched-platform"
                      name="platform"
                      defaultValue="Facebook"
                      required
                    >
                      {CONTENT_PLATFORM_OPTIONS.filter((p) => p.value !== "Paid ads").map(
                        (p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ),
                      )}
                    </Select>
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Input name="date" type="date" required />
                    <Input name="time" type="time" />
                  </div>
                  <Button type="submit" size="sm" className="w-full">
                    Schedule post
                  </Button>
                </form>
                {canScheduleAtBestTime && (
                  <form action={scheduleAtOptimalWindowAction} className="mt-2 space-y-2">
                    <input type="hidden" name="contentId" value={content.id} />
                    <Field
                      label="Platform (optional)"
                      htmlFor="opt-platform"
                      hint="Leave as-is to use the next best window for this channel"
                    >
                      <Select id="opt-platform" name="platform" defaultValue="Facebook">
                        {CONTENT_PLATFORM_OPTIONS.filter((p) => p.value !== "Paid ads").map(
                          (p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ),
                        )}
                      </Select>
                    </Field>
                    <Button type="submit" variant="outline" size="sm" className="w-full">
                      Schedule at best time
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Uses the next analytics-informed optimal window for this company/platform.
                      Pre-publish critique still runs — blocks are shown above.
                    </p>
                  </form>
                )}
                <Link
                  href={`/calendar?company=${content.companyId}`}
                  className="mt-3 inline-block text-sm text-primary hover:underline"
                >
                  View calendar →
                </Link>
              </CardContent>
            </Card>
          )}

          {(locked || content.status === "published") && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Repurpose</h2>
                {expired ? (
                  <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">
                    Expired on {content.expiryDate} — review required before reuse.
                  </p>
                ) : content.reusePermitted !== true ? (
                  <p className="text-sm text-muted-foreground">
                    {content.reusePermitted === false
                      ? "Reuse of this content is not permitted."
                      : "Reuse not enabled yet — an admin must permit it in Reuse settings."}
                  </p>
                ) : (
                  <form action={repurposeContentAction} className="space-y-2">
                    <input type="hidden" name="contentId" value={content.id} />
                    <Select name="targetType" defaultValue="social_post">
                      {REPURPOSE_TYPES.filter(([v]) => v !== content.type).map(
                        ([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ),
                      )}
                    </Select>
                    <Button type="submit" variant="outline" size="sm" className="w-full">
                      Repurpose as new draft
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          )}

          {admin && locked && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Reuse settings</h2>
                <form action={saveReuseAction} className="space-y-3">
                  <input type="hidden" name="contentId" value={content.id} />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="reusePermitted"
                      defaultChecked={content.reusePermitted ?? false}
                      className="h-4 w-4"
                    />
                    Reuse permitted
                  </label>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Allowed channels (one per line; blank = all)
                    </label>
                    <Textarea
                      name="reuseChannels"
                      defaultValue={content.reuseChannels?.join("\n")}
                      className="min-h-14"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        Review date
                      </label>
                      <Input name="reviewDate" type="date" defaultValue={content.reviewDate} />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        Expiry date
                      </label>
                      <Input name="expiryDate" type="date" defaultValue={content.expiryDate} />
                    </div>
                  </div>
                  <Button type="submit" variant="outline" size="sm" className="w-full">
                    Save reuse settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {content.versions.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Version history</h2>
                <ol className="space-y-2">
                  {content.versions.map((v, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="text-muted-foreground">
                        v{i + 1} · {formatDate(v.editedAt)}
                        {v.note ? ` · ${v.note}` : ""}
                      </span>
                      {!terminal && (
                        <form action={restoreVersionAction}>
                          <input type="hidden" name="contentId" value={content.id} />
                          <input type="hidden" name="versionIndex" value={i} />
                          <Button type="submit" variant="ghost" size="sm">
                            Restore
                          </Button>
                        </form>
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
