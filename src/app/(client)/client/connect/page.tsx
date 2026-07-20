import Link from "next/link";
import { headers } from "next/headers";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, listIntegrations } from "@/lib/db";
import {
  connectInviteUrl,
  oauthAvailableForPlatform,
} from "@/lib/connect-invites";
import { listPendingSocialConnectInvites } from "@/lib/onboarding-social-connect";
import { resolveOrigin } from "@/lib/origin";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Connect social accounts" };

/**
 * Post-onboarding (and anytime) client setup: open the same OAuth invite links
 * Publishing uses. Never asks for social passwords.
 */
export default async function ClientConnectSocialsPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string; checkout?: string }>;
}) {
  const { user, companyId } = await requirePortalUser();
  const params = await searchParams;
  const isSetup = params.setup === "1" || params.checkout === "success";

  const [company, pending, integrations] = await Promise.all([
    getCompany(companyId),
    listPendingSocialConnectInvites(user.tenantId, companyId),
    listIntegrations(user.tenantId, companyId),
  ]);

  const connected = integrations.filter((i) => i.status === "connected");
  const h = await headers();
  const origin = resolveOrigin((key) => h.get(key));

  return (
    <div>
      <PageHeader
        title="Connect your social accounts"
        explainerId="client-connect-socials"
        explainer="Authorize Facebook, Instagram, and other channels with a one-time secure link. We never ask for your password."
      />

      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        {isSetup ? (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Payment is sorted for{" "}
            <span className="font-medium text-foreground">
              {company?.name ?? "your business"}
            </span>
            . Connect the channels in your package so we can publish when content
            is approved. You can skip and finish this later from Account.
          </p>
        ) : null}

        {connected.length > 0 ? (
          <section aria-labelledby="connected-accounts">
            <h2 id="connected-accounts" className="mb-2 text-base font-semibold">
              Already connected
            </h2>
            <Card>
              <CardContent className="divide-y divide-border p-0">
                {connected.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <span className="font-medium">{row.platform}</span>
                    <span className="text-muted-foreground">
                      {row.accountName || `…${row.tokenLastFour}`}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        ) : null}

        <section aria-labelledby="pending-connect">
          <h2 id="pending-connect" className="mb-2 text-base font-semibold">
            Connect now
          </h2>
          <Card>
            <CardContent className="divide-y divide-border p-0">
              {pending.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  No pending connect links. If you expected channels here, ask
                  your marketing team to send invites from Publishing — or your
                  package may not include social posting.
                </p>
              ) : (
                pending.map((invite) => {
                  const href = connectInviteUrl(origin, invite.token);
                  const oauth = oauthAvailableForPlatform(invite.platform);
                  return (
                    <div
                      key={invite.id}
                      className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{invite.platform}</p>
                        <p className="text-xs text-muted-foreground">
                          {oauth
                            ? "Opens the platform sign-in (OAuth)."
                            : "Opens the connect page for this channel."}{" "}
                          Expires {formatDate(invite.expiresAt)}.
                        </p>
                      </div>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClasses("default", "sm")}
                      >
                        Connect {invite.platform}
                      </a>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/client" className={buttonClasses("default", "md")}>
            {pending.length === 0 ? "Continue to home" : "Skip for now"}
          </Link>
          <Link
            href="/client/account"
            className={buttonClasses("outline", "md")}
          >
            Account
          </Link>
        </div>
      </div>
    </div>
  );
}
