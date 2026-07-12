import { notFound } from "next/navigation";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getAsset, getContent } from "@/lib/db";
import { canClientApproveRoute } from "@/lib/routing";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import { titleCase } from "@/lib/utils";
import { ShieldCheck } from "lucide-react";
import { portalApproveContentAction, portalRequestChangesAction } from "../../../actions";

export default async function ClientApprovalDetailPage({ params }: { params: Promise<{ contentId: string }> }) {
  const { contentId } = await params;
  const { user, companyId } = await requirePortalUser();
  const content = await getContent(contentId);
  if (!content || content.companyId !== companyId) notFound();

  const review = content.clientReview;
  const pending = content.status === "pending_approval" && review?.status === "pending";
  const routedTo = content.routedTo ?? "admin";
  const canApprove = canClientApproveRoute(routedTo) && (content.compliance?.canProceed ?? true);
  const mediaAssets = (await Promise.all((content.assetIds ?? []).map((id) => getAsset(id)))).filter(
    (a): a is NonNullable<typeof a> => !!a && a.status === "approved" && !!a.storedFile && a.storedFile.mimeType.startsWith("image/"),
  );

  return (
    <div>
      <PageHeader
        title={content.title}
        description="Does this look right? Approve and we’ll schedule it after our usual checks — it won’t go live without them."
        hideExplainer
      />
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <Badge tone="neutral">{titleCase(content.type)}</Badge>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-primary">
                <ShieldCheck className="h-3.5 w-3.5" /> We&apos;ve checked this against your guidelines
              </span>
            </div>
            <article className="whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm">{content.body}</article>
            {mediaAssets.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {mediaAssets.map((a) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={a.id} src={`/api/media/${a.id}`} alt={a.name} className="w-full rounded-md border border-border object-cover" />
                ))}
              </div>
            )}
            {!pending && (
              <div className="mt-6 rounded-md border border-border p-4 text-sm">
                {content.status === "approved" || review?.status === "approved" ? (
                  <p className="font-medium text-emerald-700">You said this looks good — we&apos;ll take it from here.</p>
                ) : review?.status === "changes_requested" ? (
                  <p className="font-medium text-amber-700">
                    You asked for changes{review.note ? `: “${review.note}”` : "."} We&apos;ll update it and send it back.
                  </p>
                ) : (
                  <p className="text-muted-foreground">This one doesn&apos;t need your review anymore.</p>
                )}
              </div>
            )}
            {pending && canApprove && (
              <div className="mt-6 space-y-4">
                <form action={portalApproveContentAction}>
                  <input type="hidden" name="contentId" value={content.id} />
                  <Button type="submit" className="w-full">Looks good — approve</Button>
                </form>
                <form action={portalRequestChangesAction} className="space-y-2">
                  <input type="hidden" name="contentId" value={content.id} />
                  <Field
                    label="What should we change?"
                    htmlFor="change-note"
                    hint="Be specific — tone, offer, photo, spelling, or timing"
                  >
                    <Textarea
                      id="change-note"
                      name="note"
                      placeholder="e.g. Soften the discount line and swap the hero photo for the shopfront shot"
                      className="min-h-20"
                      required
                    />
                  </Field>
                  <Button type="submit" variant="outline" className="w-full">Ask for changes</Button>
                </form>
              </div>
            )}
            {pending && !canApprove && (
              <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Your team is still reviewing this internally — we&apos;ll ask you to approve when it&apos;s ready.
              </div>
            )}
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">Signed in as {user.email}</p>
      </div>
    </div>
  );
}
