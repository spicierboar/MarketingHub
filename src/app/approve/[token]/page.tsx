import {
  getAsset,
  getTenant,
  listContentComments,
  listManagedApprovalRequests,
  listScheduledPosts,
} from "@/lib/db";
import { canClientApproveRoute } from "@/lib/routing";
import { Button } from "@/components/ui/button";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { ShieldCheck } from "lucide-react";
import { ClientApprovalSummaryPanel } from "@/components/client-approval-summary";
import { clientApprovalSummary } from "@/lib/managed-service/client-ux";
import {
  resolveApprovalToken,
  clientApproveAction,
  clientCommentAction,
  clientRequestChangesAction,
} from "./actions";

export const metadata = { title: "Content approval" };

function Shell({ accent, logoUrl, brand, children }: { accent: string; logoUrl?: string; brand: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30" style={{ ["--primary" as string]: accent }}>
      <div className="mx-auto max-w-2xl px-4 py-5 sm:py-10">
        <div className="mb-6 flex items-center gap-2.5">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-9 w-9 rounded-lg object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              {brand.slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="text-base font-semibold">{brand}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function ClientApprovalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: raw } = await params;
  const resolved = await resolveApprovalToken(raw);

  if (!resolved) {
    return (
      <Shell accent="#4f46e5" brand="Content approval">
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold">This link is invalid or has expired</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Approval links expire after 7 days. Please ask your agency to send a fresh one.
          </p>
        </div>
      </Shell>
    );
  }

  const { token, content, company } = resolved;
  const tenant = await getTenant(token.tenantId);
  const [comments, posts, approvalRequests] = await Promise.all([
    listContentComments(content.id),
    listScheduledPosts(token.tenantId),
    listManagedApprovalRequests(token.tenantId, company.id),
  ]);
  // Attached approved assets with real media — served through the token-scoped,
  // consent-gated media route (a withdrawn-consent image simply won't load).
  const mediaAssets = (
    await Promise.all((content.assetIds ?? []).map((id) => getAsset(id)))
  ).filter(
    (a): a is NonNullable<typeof a> =>
      !!a && a.status === "approved" && !!a.storedFile && a.storedFile.mimeType.startsWith("image/"),
  );
  const b = tenant?.branding ?? {};
  const accent = b.accentColor || "#4f46e5";
  const brand = b.emailFromName || tenant?.name || company.name;

  const review = content.clientReview;
  // Mirror the server guard (assertShareIsLive): only an un-answered share for
  // THIS client is actionable. A cleared review (after an internal edit) is not
  // pending — the client sees a neutral state, not a button that would error.
  const pending =
    content.status === "pending_approval" &&
    review?.status === "pending" &&
    review.email === token.clientEmail;
  const routedTo = content.routedTo ?? "admin";
  const canApprove = canClientApproveRoute(routedTo) && (content.compliance?.canProceed ?? true);
  const managedRequest = approvalRequests
    .filter((request) => request.contentId === content.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const summary = clientApprovalSummary({ content, posts, request: managedRequest });

  return (
    <Shell accent={accent} logoUrl={b.logoUrl} brand={brand}>
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              For {company.name}
            </p>
            <h1 className="text-lg font-semibold">{content.title}</h1>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Compliance-checked
          </span>
        </div>

        {b.approvalMessage && (
          <p className="mb-4 rounded-md bg-muted/50 p-3 text-sm">{b.approvalMessage}</p>
        )}

        <ClientApprovalSummaryPanel
          summary={summary}
          hasVisual={mediaAssets.length > 0}
        />

        <article className="mt-4 whitespace-pre-wrap rounded-md border border-border bg-background p-4 text-sm leading-relaxed">
          {content.body}
        </article>

        {mediaAssets.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {mediaAssets.map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={a.id}
                src={`/api/media/${a.id}?t=${encodeURIComponent(raw)}`}
                alt={a.name}
                className="w-full rounded-md border border-border object-cover"
              />
            ))}
          </div>
        )}

        {/* Already responded */}
        {!pending && (
          <div className="mt-6 rounded-md border border-border p-4 text-sm">
            {content.status === "approved" || review?.status === "approved" ? (
              <p className="font-medium text-emerald-700">✓ You approved this content. Thank you!</p>
            ) : review?.status === "changes_requested" ? (
              <>
                <p className="font-medium text-amber-700">Changes requested.</p>
                {review.note && <p className="mt-1 text-muted-foreground">“{review.note}”</p>}
                <p className="mt-1 text-muted-foreground">Your agency has been notified.</p>
              </>
            ) : (
              <p className="text-muted-foreground">This content is no longer awaiting your approval.</p>
            )}
          </div>
        )}

        {/* Pending — action forms */}
        {pending && canApprove && (
          <div className="mt-6 space-y-4">
            <form action={clientApproveAction}>
              <input type="hidden" name="token" value={raw} />
              <ActionSubmitButton
                type="submit"
                className="h-12 w-full text-base"
                pendingLabel="Approving…"
              >
                Approve
              </ActionSubmitButton>
            </form>
            <form action={clientRequestChangesAction} className="space-y-2">
              <input type="hidden" name="token" value={raw} />
              <textarea
                name="note"
                rows={3}
                placeholder="Or request changes — tell your agency what to adjust…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <ActionSubmitButton
                type="submit"
                variant="outline"
                className="h-12 w-full text-base"
                pendingLabel="Sending request…"
              >
                Request changes
              </ActionSubmitButton>
            </form>
          </div>
        )}

        {pending && !canApprove && (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            This content is undergoing your agency&apos;s internal review.
            You&apos;ll be asked to approve once it&apos;s ready.
          </div>
        )}

        {/* Comment thread — shared with the agency team */}
        <div className="mt-6 border-t border-border pt-5">
          <h2 className="mb-3 text-sm font-semibold">Comments</h2>
          <div className="space-y-3">
            {comments.length === 0 && (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            )}
            {comments.map((cm) => (
              <div key={cm.id} className="rounded-md border border-border p-3 text-sm">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-medium">{cm.authorName}</span>
                  {cm.authorKind === "client" && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-primary">You</span>
                  )}
                </div>
                <p className="whitespace-pre-wrap">{cm.body}</p>
              </div>
            ))}
          </div>
          {pending && (
            <form action={clientCommentAction} className="mt-3 space-y-2">
              <input type="hidden" name="token" value={raw} />
              <textarea
                name="body"
                rows={2}
                required
                placeholder="Add a comment for your agency…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button type="submit" variant="outline" size="sm">Comment</Button>
            </form>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Secure approval link · no account required · every action is recorded for the audit trail.
      </p>
    </Shell>
  );
}
