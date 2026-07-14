import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserRaw } from "@/lib/auth/rbac";
import { pendingLegalDocs } from "@/lib/db";
import { legalDocLabel } from "@/lib/terms";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { acceptTermsAction } from "./actions";

// Force-re-acceptance gate. The (app) layout redirects here whenever the signed-
// in user hasn't accepted the current Terms and/or Privacy Policy (a fresh
// signup, or after a new version is published). Lives OUTSIDE the (app) group
// so the gate can't loop.
export default async function AcceptTermsPage() {
  const user = await requireUserRaw();
  const pending = await pendingLegalDocs(user.id);
  // Nothing pending → nothing to gate.
  if (pending.length === 0) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center p-6">
      <Card>
        <CardContent className="p-6">
          <h1 className="mb-1 text-lg font-semibold">Updated legal documents</h1>
          <p className="mb-4 text-sm text-muted-foreground">
            Please review and accept the following before continuing. You&apos;re signed in as{" "}
            {user.email}.
          </p>
          <div className="mb-4 space-y-4">
            {pending.map((doc) => (
              <div key={doc.id} className="rounded-md border border-border">
                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
                  <h2 className="text-sm font-semibold">{doc.title || legalDocLabel(doc.kind)}</h2>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {legalDocLabel(doc.kind)} v{doc.version}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    effective {formatDate(doc.effectiveDate)}
                  </span>
                </div>
                {doc.summary && (
                  <div className="border-b border-border px-3 py-2 text-sm">
                    <span className="font-medium">What changed: </span>
                    {doc.summary}
                  </div>
                )}
                <div className="max-h-48 overflow-y-auto whitespace-pre-wrap p-3 text-sm text-muted-foreground">
                  {doc.body}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Link href="/terms" className="text-xs text-primary hover:underline" target="_blank">
              Open public terms page →
            </Link>
            <form action={acceptTermsAction}>
              <Button type="submit">I have read and accept</Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
