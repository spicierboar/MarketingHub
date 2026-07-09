import { notFound } from "next/navigation";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getAsset, getContent } from "@/lib/db";
import { canClientApproveRoute } from "@/lib/routing";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
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
      <PageHeader title={content.title} description="Review before approving" />
      <div className="mx-auto max-w-3xl p-6">
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <Badge tone="neutral">{titleCase(content.type)}</Badge>
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-primary">
                <ShieldCheck className="h-3.5 w-3.5" /> Compliance-checked
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
                  <p className="font-medium text-emerald-700">You approved this content.</p>
                ) : review?.status === "changes_requested" ? (
                  <p className="font-medium text-amber-700">Changes requested.{review.note && ` “${review.note}”`}</p>
                ) : (
                  <p className="text-muted-foreground">No longer awaiting approval.</p>
                )}
              </div>
            )}
            {pending && canApprove && (
              <div className="mt-6 space-y-4">
                <form action={portalApproveContentAction}>
                  <input type="hidden" name="contentId" value={content.id} />
                  <Button type="submit" className="w-full">Approve this content</Button>
                </form>
                <form action={portalRequestChangesAction} className="space-y-2">
                  <input type="hidden" name="contentId" value={content.id} />
                  <Textarea name="note" placeholder="Request changes…" className="min-h-20" />
                  <Button type="submit" variant="outline" className="w-full">Request changes</Button>
                </form>
              </div>
            )}
            {pending && !canApprove && (
              <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Undergoing internal review — you&apos;ll be asked to approve when ready.
              </div>
            )}
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">Signed in as {user.email}</p>
      </div>
    </div>
  );
}
