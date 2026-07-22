import Link from "next/link";
import { headers } from "next/headers";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany, getTenant, listIntegrations } from "@/lib/db";
import {
  connectInviteUrl,
  oauthAvailableForPlatform,
} from "@/lib/connect-invites";
import {
  connectPlatformsAllowedForCompany,
  listPendingSocialConnectInvites,
  partitionConnectPlatformsByEntitlement,
  V1_CONNECT_PLATFORMS,
} from "@/lib/onboarding-social-connect";
import { resolveOrigin } from "@/lib/origin";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { requestClientSocialConnectAction } from "./actions";

export const metadata = { title: "Connect social accounts" };

export default async function ClientConnectSocialsPage({
  searchParams,
}: {
  searchParams: Promise<{
    setup?: string;
    checkout?: string;
    err?: string;
    sent?: string;
  }>;
}) {
  const { user, companyId } = await requirePortalUser();
  const params = await searchParams;
  const isSetup = params.setup === "1" || params.checkout === "success";

  const [company, tenant, pending, integrations] = await Promise.all([
    getCompany(companyId),
    getTenant(user.tenantId),
    listPendingSocialConnectInvites(user.tenantId, companyId),
    listIntegrations(user.tenantId, companyId),
  ]);

  const connected = integrations.filter((i) => i.status === "connected");
  const connectedPlatforms = new Set(connected.map((i) => i.platform));
  const pendingPlatforms = new Set(pending.map((i) => i.platform));
  const notConnected = V1_CONNECT_PLATFORMS.filter(
    (p) => !connectedPlatforms.has(p) && !pendingPlatforms.has(p),
  );
  const { entitled: entitledAddable, upgradeRequired: upgradePlatforms } =
    company
      ? partitionConnectPlatformsByEntitlement(company, tenant, notConnected)
      : { entitled: [], upgradeRequired: notConnected };
  const planPlatforms = company
    ? connectPlatformsAllowedForCompany(company, tenant)
    : [];

  const h = await headers();
  const origin = resolveOrigin((key) => h.get(key));
  const defaultEmail =
    company?.profile.approvalContact?.trim() || user.email || "";

  return (
    <div>
      <PageHeader
        title="Connect your social accounts"
        explainerId="client-connect-socials"
        explainer="Authorize Facebook, Instagram, and other channels with a one-time secure link. We never ask for your password."
        parent={{ href: "/client/account", label: "Overview" }}
      />

      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        {params.err ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {params.err}
          </p>
        ) : null}
        {params.sent === "1" ? (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            Connect link(s) sent. Check your email or use the buttons below.
          </p>
        ) : null}

        {isSetup ? (
          <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            At signup we only asked for channels on your plan
            {company ? (
              <>
                {" "}
                for <span className="font-medium text-foreground">{company.name}</span>
              </>
            ) : null}
            . Connect those below. Other platforms need a plan upgrade first.
          </p>
        ) : null}

        {planPlatforms.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Your plan includes:{" "}
            <span className="font-medium text-foreground">
              {planPlatforms.join(", ")}
            </span>
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
                  No pending links. Pick entitled platforms below or ask us to
                  upgrade for others.
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

        {entitledAddable.length > 0 ? (
          <section aria-labelledby="add-entitled">
            <h2 id="add-entitled" className="mb-2 text-base font-semibold">
              Request connect link (on your plan)
            </h2>
            <Card>
              <CardContent className="p-4">
                <form action={requestClientSocialConnectAction} className="space-y-3">
                  <fieldset className="space-y-2">
                    <legend className="text-xs font-medium text-muted-foreground">
                      Platforms included in your package
                    </legend>
                    {entitledAddable.map((platform) => (
                      <label
                        key={platform}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="platform"
                          value={platform}
                          className="rounded border-border"
                        />
                        {platform}
                      </label>
                    ))}
                  </fieldset>
                  <label className="block text-sm">
                    <span className="text-xs font-medium text-muted-foreground">
                      Email for connect link
                    </span>
                    <input
                      type="email"
                      name="email"
                      defaultValue={defaultEmail}
                      required
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <button type="submit" className={buttonClasses("default", "sm")}>
                    Email OAuth connect link(s)
                  </button>
                </form>
              </CardContent>
            </Card>
          </section>
        ) : null}

        {upgradePlatforms.length > 0 ? (
          <section aria-labelledby="upgrade-required">
            <h2 id="upgrade-required" className="mb-2 text-base font-semibold">
              Need another platform?
            </h2>
            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="text-sm text-muted-foreground">
                  These channels are not on your current marketing package. You
                  can add them after we upgrade your plan:
                </p>
                <ul className="list-inside list-disc text-sm">
                  {upgradePlatforms.map((platform) => (
                    <li key={platform}>{platform}</li>
                  ))}
                </ul>
                <Link
                  href="/client/requests/new"
                  className={buttonClasses("outline", "sm")}
                >
                  Ask us to upgrade →
                </Link>
              </CardContent>
            </Card>
          </section>
        ) : null}

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
