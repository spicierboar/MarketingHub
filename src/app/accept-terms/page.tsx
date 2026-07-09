import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserRaw } from "@/lib/auth/rbac";
import { currentTerms, hasAcceptedTerms } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { acceptTermsAction } from "./actions";

// Force-re-acceptance gate. The (app) layout redirects here whenever the signed-
// in user hasn't accepted the current terms version (a fresh signup, or after a
// new version is published). Lives OUTSIDE the (app) group so the gate can't loop.
export default async function AcceptTermsPage() {
  const user = await requireUserRaw();
  const terms = await currentTerms();
  // No terms configured, or already accepted → nothing to gate.
  if (!terms) redirect("/dashboard");
  if (await hasAcceptedTerms(user.id, terms.version)) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center p-6">
      <Card>
        <CardContent className="p-6">
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-lg font-semibold">{terms.title}</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">v{terms.version}</span>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Our terms have been updated (effective {formatDate(terms.effectiveDate)}). Please review and
            accept them to continue. You&apos;re signed in as {user.email}.
          </p>
          {terms.summary && (
            <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
              <span className="font-medium">What changed: </span>
              {terms.summary}
            </div>
          )}
          <div className="mb-4 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {terms.body}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Link href="/terms" className="text-xs text-primary hover:underline" target="_blank">
              Open the full terms →
            </Link>
            <form action={acceptTermsAction}>
              <Button type="submit">I have read and accept these terms</Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
