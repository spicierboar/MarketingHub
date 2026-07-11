import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { visibleContent } from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default async function ClientApprovalsPage() {
  const { user } = await requirePortalUser();
  const pending = (await visibleContent(user)).filter(
    (c) => c.status === "pending_approval" && c.clientReview?.status === "pending",
  );

  return (
    <div>
      <PageHeader
        title="Ready for your review"
        description="We prepared this for your business. Approve or ask for changes."
      />
      <div className="space-y-4 p-6">
        {pending.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              You&apos;re all caught up — nothing needs your approval right now.
            </CardContent>
          </Card>
        ) : (
          pending.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-6">
                <Link href={`/client/approvals/${c.id}`} className="font-semibold hover:text-primary">
                  {c.title}
                </Link>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{c.body}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
