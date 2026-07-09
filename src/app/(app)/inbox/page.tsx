import { requireUser, accessibleCompanyIds } from "@/lib/auth/rbac";
import { listCompanies, listSocialMentions } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import {
  checkForMentionsAction,
  dismissMentionAction,
  draftReplyFromMentionAction,
} from "./actions";

export default async function InboxPage() {
  const user = await requireUser();
  const allowed = new Set(await accessibleCompanyIds(user));
  const companyById = new Map((await listCompanies(user.tenantId)).map((c) => [c.id, c.name]));
  const all = await listSocialMentions(user.tenantId);
  const scoped = all.filter((m) => allowed.has(m.companyId));
  const newMentions = scoped.filter((m) => m.status === "new");
  const handled = scoped.filter((m) => m.status !== "new").length;

  return (
    <div>
      <PageHeader
        title="Social Inbox"
        description="Incoming mentions, comments and DMs from your connected platforms. Draft a reply and it flows through the same governed approval pipeline."
      >
        <form action={checkForMentionsAction}>
          <Button type="submit" variant="outline">Check for new mentions</Button>
        </form>
      </PageHeader>

      <div className="space-y-4 p-6">
        <div className="flex gap-3 text-sm text-muted-foreground">
          <Badge tone={newMentions.length ? "info" : "neutral"}>{newMentions.length} new</Badge>
          <Badge tone="neutral">{handled} handled</Badge>
        </div>

        {newMentions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              Inbox zero. New mentions from connected platforms appear here.
              <span className="mt-1 block text-xs">
                Live pulling needs connected integrations + <code>PUBLISHING_LIVE</code>; the demo shows seeded mentions.
              </span>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {newMentions.map((m) => (
              <Card key={m.id}>
                <CardContent className="p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{m.authorName}</span>
                      <Badge tone="neutral">{m.platform}</Badge>
                      <span className="text-muted-foreground">{companyById.get(m.companyId)}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(m.receivedAt)}</span>
                  </div>
                  <p className="mb-3 rounded-md bg-muted/40 p-3 text-sm">{m.text}</p>
                  <div className="flex gap-2">
                    <form action={draftReplyFromMentionAction}>
                      <input type="hidden" name="mentionId" value={m.id} />
                      <Button type="submit" size="sm">Draft reply</Button>
                    </form>
                    <form action={dismissMentionAction}>
                      <input type="hidden" name="mentionId" value={m.id} />
                      <Button type="submit" size="sm" variant="ghost">Dismiss</Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
