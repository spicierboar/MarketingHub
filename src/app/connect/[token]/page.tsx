import { loadPublicConnectInvite } from "@/lib/connect-public";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import { connectInviteManualAction, startInviteOAuthAction } from "./actions";

export const metadata = { title: "Connect your account" };

export default async function PublicConnectPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ connected?: string; oauth_error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const view = await loadPublicConnectInvite(token);

  if (!view) {
    return (
      <Shell>
        <Card>
          <CardContent className="p-8 text-center">
            <h1 className="text-lg font-semibold">Link not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This connect link is invalid or has been removed. Contact your marketing team for a new one.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { invite, company, tenantName, oauthAvailable, inviterName } = view;

  if (sp.connected || invite.status === "completed") {
    return (
      <Shell>
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <h1 className="text-xl font-semibold text-green-700">Account connected</h1>
            <p className="text-sm text-muted-foreground">
              <strong>{company.name}</strong> is now connected to {invite.platform}. You can close this window —
              {tenantName} can schedule posts without needing your password.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (invite.status === "revoked") {
    return (
      <Shell>
        <Card>
          <CardContent className="p-8 text-center">
            <h1 className="text-lg font-semibold">Link revoked</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This connect link was cancelled. Ask {tenantName} to send a new invite.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (invite.status === "expired" || Date.parse(invite.expiresAt) <= Date.now()) {
    return (
      <Shell>
        <Card>
          <CardContent className="p-8 text-center">
            <h1 className="text-lg font-semibold">Link expired</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This connect link expired on {formatDate(invite.expiresAt)}. Ask {tenantName} for a fresh link.
            </p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card>
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tenantName}</p>
            <h1 className="mt-1 text-xl font-semibold">Connect {invite.platform}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Grant {tenantName} permission to publish on behalf of <strong>{company.name}</strong>. This is a
              one-time OAuth consent — we never ask for your password or 2FA codes.
            </p>
            {inviterName && (
              <p className="mt-1 text-xs text-muted-foreground">Invited by {inviterName}</p>
            )}
          </div>

          {sp.oauth_error && (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              Connect failed: {sp.oauth_error}. Try again or use the manual token option below.
            </p>
          )}

          {oauthAvailable ? (
            <form action={startInviteOAuthAction} className="space-y-4">
              <input type="hidden" name="token" value={token} />
              <Field
                label="Page / account id"
                htmlFor="oa-account"
                hint="The Facebook Page id, Google location id, or organisation the granted token will post to."
              >
                <Input
                  id="oa-account"
                  name="accountName"
                  required
                  defaultValue={invite.accountNameHint ?? ""}
                  placeholder="e.g. 123456789"
                />
              </Field>
              <Button type="submit">Continue to {invite.platform} consent →</Button>
            </form>
          ) : (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              Live OAuth is not enabled yet — paste an API token below (demo / TikTok) or ask {tenantName} to
              connect from the Publishing Centre.
            </p>
          )}

          <details className="rounded-md border border-dashed border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Connect with a token / API key (manual)
            </summary>
            <form action={connectInviteManualAction} className="mt-4 space-y-3">
              <input type="hidden" name="token" value={token} />
              <Field
                label="Account name"
                htmlFor="mn-account"
                hint="How this connection will appear to your marketing team"
              >
                <Input
                  id="mn-account"
                  name="accountName"
                  required
                  defaultValue={invite.accountNameHint ?? `${company.name} ${invite.platform}`}
                  placeholder={`e.g. ${company.name} ${invite.platform}`}
                />
              </Field>
              <Field
                label="OAuth token / API key"
                htmlFor="mn-token"
                hint="Paste the token from the platform — never your password"
              >
                <Input
                  id="mn-token"
                  name="tokenValue"
                  type="password"
                  required
                  autoComplete="off"
                  placeholder="Paste token or API key"
                />
              </Field>
              <Button type="submit" size="sm" variant="outline">
                Connect
              </Button>
            </form>
          </details>

          <p className="text-xs text-muted-foreground">
            Link expires {formatDate(invite.expiresAt)}. You can revoke access any time from the platform&apos;s
            connected-apps settings.
          </p>
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-lg">{children}</div>
    </div>
  );
}
