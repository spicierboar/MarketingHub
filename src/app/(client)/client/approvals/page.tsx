import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { visibleContent } from "@/lib/scope";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { titleCase } from "@/lib/utils";

export default async function ClientApprovalsPage() {
  const { user } = await requirePortalUser();
  const pending = (await visibleContent(user)).filter(
    (c) => c.status === "pending_approval" && c.clientReview?.status === "pending",
  );

  return (
    <div>
      <PageHeader title="Content approvals" description="Review marketing content prepared for your business." />
      <div className="space-y-4 p-6">
        {pending.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nothing awaiting approval.</CardContent></Card>
        ) : (
          pending.map((c) => (
            <Card key={c.id}>
              <CardContent className="p-6">
                <Link href={`/client/approvals/${c.id}`} className="font-semibold hover:text-primary">{c.title}</Link>
                <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{c.body}</p>
                {c.groundingLabel && (
                  <Badge tone={c.groundingLabel === "grounded" ? "success" : "warning"} className="mt-2">
                    {titleCase(c.groundingLabel)}
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
