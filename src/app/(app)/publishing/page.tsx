import { isTenantOwner, requireAdmin } from "@/lib/auth/rbac";
import { headers } from "next/headers";
import {
  getContent,
  getPublishingControls,
  getTenant,
  listCampaigns,
  listCompanies,
  listConnectInvites,
  listIntegrations,
  listPublishLogs,
  listScheduledPosts,
} from "@/lib/db";
import { connectInviteUrl } from "@/lib/connect-invites";
import { resolveOrigin } from "@/lib/origin";
import { V1_CONNECT_PLATFORMS } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { formatDate, titleCase } from "@/lib/utils";
import { configuredOAuthPlatforms } from "@/lib/oauth";
import {
  attemptsSinceRequeue,
  ceilingUsage,
  isDue,
  MAX_PUBLISH_ATTEMPTS,
  retryEligibleAt,
} from "@/lib/publish-queue";
import { CEILING_WINDOW_HOURS, platformCeiling } from "@/lib/platform-limits";
import { resolveQueueClock, SCHEDULE_TIMEZONE_OPTIONS } from "@/lib/tenant-timezone";
import {
  cancelScheduleAction,
} from "@/app/(app)/calendar/actions";
import {
  connectIntegrationAction,
  disconnectIntegrationAction,
  freezeScopeAction,
  publishDueAction,
  publishNowAction,
  requeueDeadPostAction,
  saveScheduleTimezoneAction,
  startOAuthConnectAction,
  toggleControlAction,
  createBulkConnectInvitesAction,
  revokeConnectInviteAction,
} from "./actions";
import { ConnectorCapabilityPanel } from "@/components/connector-capability-panel";

// v1 platform set (owner decision 2026-07-06): Facebook Pages, Instagram
// Business, Google Business Profile, TikTok — NOT X/LinkedIn — plus Email as
// the owned channel. Existing LinkedIn integrations still render and publish;
// they just can't be newly created from the picker.
const PLATFORMS = ["Facebook", "Instagram", "Google Business Profile", "TikTok", "Email"];

export default async function PublishingPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; oauth_error?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const tenant = await getTenant(user.tenantId);
  const oauthPlatforms = configuredOAuthPlatforms();
  const allCompanies = await listCompanies(user.tenantId);
  const companyById = new Map(allCompanies.map((c) => [c.id, c]));
  const companies = allCompanies.filter((c) => c.status !== "archived");
  const integrations = await listIntegrations(user.tenantId);
  const connectInvites = await listConnectInvites(user.tenantId);
  const pendingInvites = connectInvites.filter((i) => i.status === "pending");
  const h = await headers();
  const origin = resolveOrigin((k) => h.get(k));
  const controls = await getPublishingControls(user.tenantId);
  const logs = await listPublishLogs(user.tenantId);
  const posts = await listScheduledPosts(user.tenantId);
  const queueClock = resolveQueueClock(tenant);
  const { nowIso, today, hhmm } = queueClock;
  const failed = posts.filter((p) => p.status === "failed");
  const dead = posts.filter((p) => p.status === "dead");
  const inFlight = posts.filter((p) => p.status === "publishing");
  const failedContent = await Promise.all(failed.map((p) => getContent(p.contentId)));
  const deadContent = await Promise.all(dead.map((p) => getContent(p.contentId)));
  const campaigns = await listCampaigns(user.tenantId);

  // Queue state derived from the append-only log: per-post attempt budgets and
  // per-account trailing-24h platform-ceiling usage.
  const logsByPost = new Map<string, typeof logs>();
  for (const l of logs) {
    if (!l.scheduledPostId) continue;
    const list = logsByPost.get(l.scheduledPostId);
    if (list) list.push(l);
    else logsByPost.set(l.scheduledPostId, [l]);
  }
  const windowStart = new Date(
    Date.parse(nowIso) - CEILING_WINDOW_HOURS * 3_600_000,
  ).toISOString();
  const used = ceilingUsage(logs.filter((l) => l.createdAt >= windowStart));

  // The button promises EXACTLY what the queue tick will attempt: due
  // scheduled posts (same date+time gate) plus failed posts whose backoff has
  // elapsed. A count that ignored the time gate looked broken (click → nothing
  // happens), and retry-only ticks used to be unreachable from the UI.
  const dueNow = posts.filter((p) => p.status === "scheduled" && isDue(p, today, hhmm));
  const retryableNow = failed.filter((p) => {
    const { attempts, lastFailedAt } = attemptsSinceRequeue(logsByPost.get(p.id) ?? []);
    if (attempts >= MAX_PUBLISH_ATTEMPTS) return false;
    if (!isDue(p, today, hhmm)) return false;
    return !lastFailedAt || retryEligibleAt(attempts, lastFailedAt) <= nowIso;
  });
  const queueRunnable = dueNow.length + retryableNow.length > 0;

  const toggles: {
    control: string;
    label: string;
    on: boolean;
    danger?: boolean;
  }[] = [
    { control: "freezeAll", label: "FREEZE ALL publishing", on: controls.freezeAll, danger: true },
    {
      control: "automatedPublishingDisabled",
      label: "Disable automated publishing",
      on: controls.automatedPublishingDisabled,
    },
    {
      control: "socialRepliesDisabled",
      label: "Disable social replies",
      on: controls.socialRepliesDisabled,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Publishing Centre"
        description="Integrations, the publishing run, failure monitor and the kill switch. The system never publishes unapproved content."
      >
        <div className="text-right">
          <form action={publishDueAction}>
            <Button
              type="submit"
              disabled={!queueRunnable || controls.freezeAll || controls.automatedPublishingDisabled}
            >
              Run publish queue now ({dueNow.length} due
              {retryableNow.length > 0 ? ` · ${retryableNow.length} retryable` : ""})
            </Button>
          </form>
          {controls.automatedPublishingDisabled && (
            <p className="mt-1 text-xs text-muted-foreground">
              Automated publishing is disabled — the queue won&apos;t run until it&apos;s re-enabled.
            </p>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <ConnectorCapabilityPanel />
        </div>
        {/* Bulk client connect invites */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Bulk client connect (one-time links)</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Generate single-use links for clients to OAuth-connect their accounts — no Command Centre
              login. Skips companies already connected or with a pending invite.
            </p>
            <form action={createBulkConnectInvitesAction} className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Companies
                  </p>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-3">
                    {companies.map((c) => (
                      <label key={c.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="companyId" value={c.id} className="rounded" />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Platforms (v1)
                  </p>
                  <div className="space-y-1 rounded-md border border-border p-3">
                    {V1_CONNECT_PLATFORMS.map((p) => (
                      <label key={p} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="platform" value={p} className="rounded" />
                        {p}
                      </label>
                    ))}
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <input type="checkbox" name="sendEmail" value="true" className="rounded" />
                    Email links to each company&apos;s approval contact (when set)
                  </label>
                </div>
              </div>
              <Button type="submit" size="sm">
                Generate invite links
              </Button>
            </form>

            {pendingInvites.length > 0 && (
              <div className="mt-6 border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Pending invites ({pendingInvites.length})
                </p>
                <div className="max-h-56 space-y-2 overflow-y-auto">
                  {pendingInvites.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">
                          {companyById.get(inv.companyId)?.name} · {inv.platform}
                        </span>
                        <p className="truncate font-mono text-xs text-muted-foreground">
                          {connectInviteUrl(origin, inv.token)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Expires {formatDate(inv.expiresAt)}
                        </p>
                      </div>
                      <form action={revokeConnectInviteAction}>
                        <input type="hidden" name="inviteId" value={inv.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Revoke
                        </Button>
                      </form>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Kill switch */}
        <Card className={controls.freezeAll ? "border-red-300" : ""}>
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Publishing freeze &amp; kill switch</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Emergency controls (§32). Every change is audited.
            </p>
            <div className="space-y-2">
              {toggles.map((t) => (
                <form key={t.control} action={toggleControlAction} className="flex items-center justify-between gap-2">
                  <input type="hidden" name="control" value={t.control} />
                  <span className="text-sm">{t.label}</span>
                  <Button
                    type="submit"
                    size="sm"
                    variant={t.on ? (t.danger ? "destructive" : "default") : "outline"}
                  >
                    {t.on ? "ON — click to lift" : "OFF"}
                  </Button>
                </form>
              ))}
            </div>

            <div className="mt-5 space-y-4 border-t border-border pt-4">
              {(
                [
                  ["company", "Pause a company", companies.map((c) => [c.id, c.name] as [string, string]), controls.frozenCompanyIds, (v: string) => companyById.get(v)?.name ?? v],
                  // Freezable platforms = the v1 picker PLUS anything actually
                  // connected (legacy LinkedIn etc.) — the scoped kill switch
                  // must cover every platform that can still publish.
                  ["platform", "Pause a platform", [...new Set([...PLATFORMS, ...integrations.map((i) => i.platform)])].map((p) => [p, p] as [string, string]), controls.frozenPlatforms, (v: string) => v],
                  ["campaign", "Pause a campaign", campaigns.map((c) => [c.id, c.name.slice(0, 40)] as [string, string]), controls.frozenCampaignIds, (v: string) => campaigns.find((c) => c.id === v)?.name.slice(0, 30) ?? v],
                ] as const
              ).map(([scope, label, options, frozen, nameOf]) => (
                <div key={scope}>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {label}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {frozen.map((v) => (
                      <form key={v} action={freezeScopeAction}>
                        <input type="hidden" name="scope" value={scope} />
                        <input type="hidden" name="value" value={v} />
                        <input type="hidden" name="remove" value="true" />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100"
                          title="Click to unfreeze"
                        >
                          {nameOf(v)} ✕
                        </button>
                      </form>
                    ))}
                    <form action={freezeScopeAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="scope" value={scope} />
                      <Select name="value" defaultValue="" className="h-8 w-44 py-0 text-xs">
                        <option value="" disabled>
                          + Pause…
                        </option>
                        {options
                          .filter(([v]) => !frozen.includes(v))
                          .map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                      </Select>
                      <Button type="submit" variant="outline" size="sm">
                        Pause
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Schedule timezone — owner sets per-tenant IANA zone for due-ness */}
        {isTenantOwner(user) && (
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-1 font-semibold">Schedule timezone</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Calendar dates and times are local intent. The publish queue uses this
                zone to decide when posts are due. Currently:{" "}
                <span className="font-medium text-foreground">{queueClock.clockLabel}</span>
                {" · "}
                local now {today} {hhmm}
              </p>
              <form action={saveScheduleTimezoneAction} className="space-y-3">
                <Field label="Timezone">
                  <Select name="timezone" defaultValue={tenant?.timezone ?? ""}>
                    <option value="">Platform fallback (CC_TZ_OFFSET_MINUTES or UTC)</option>
                    {SCHEDULE_TIMEZONE_OPTIONS.map((z) => (
                      <option key={z.value} value={z.value}>
                        {z.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button type="submit" size="sm">
                  Save timezone
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Integrations */}
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Publishing integrations</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Tokens are encrypted at rest — only the last four characters are ever shown.
            </p>
            {params.connected && (
              <p className="mb-4 rounded-md bg-emerald-50 p-2 text-sm text-emerald-700">
                Connected {params.connected} via OAuth — the token is stored encrypted.
              </p>
            )}
            {params.oauth_error && (
              <p className="mb-4 rounded-md bg-red-50 p-2 text-sm text-red-700">
                OAuth connect failed: {params.oauth_error}.
              </p>
            )}
            {oauthPlatforms.length > 0 && (
              <details className="mb-3 rounded-md border border-dashed border-indigo-200 bg-indigo-50/40 p-4">
                <summary className="cursor-pointer text-sm font-medium text-indigo-800">
                  Connect via OAuth (shared platform app)
                </summary>
                <p className="mt-2 text-xs text-muted-foreground">
                  Redirects to the platform&apos;s consent screen. The granted token is
                  stored encrypted against the selected company — scoped to this
                  workspace only.
                </p>
                <form action={startOAuthConnectAction} className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Company" htmlFor="oa-company">
                      <Select id="oa-company" name="companyId" required>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Platform" htmlFor="oa-platform">
                      <Select id="oa-platform" name="platform">
                        {oauthPlatforms.map((p) => (
                          <option key={p.platform} value={p.platform}>
                            {p.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field
                    label="Account / page id"
                    htmlFor="oa-account"
                    hint="The page, organisation URN or location the granted token will post to."
                  >
                    <Input id="oa-account" name="accountName" required placeholder="e.g. 123456789 (Facebook page id)" />
                  </Field>
                  <Button type="submit" size="sm">
                    Continue to consent →
                  </Button>
                </form>
              </details>
            )}
            <div className="mb-5 space-y-2">
              {integrations.map((i) => (
                <div key={i.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                  <div>
                    <span className="font-medium">{i.accountName}</span>
                    <p className="text-xs text-muted-foreground">
                      {companyById.get(i.companyId)?.name} · {i.platform} · token ••••{i.tokenLastFour}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={i.status === "connected" ? "success" : "neutral"}>
                      {titleCase(i.status)}
                    </Badge>
                    {i.status === "connected" && (
                      <form action={disconnectIntegrationAction}>
                        <input type="hidden" name="integrationId" value={i.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Disconnect
                        </Button>
                      </form>
                    )}
                  </div>
                </div>
              ))}
              {integrations.length === 0 && (
                <p className="text-sm text-muted-foreground">No integrations connected.</p>
              )}
            </div>
            <details className="rounded-md border border-dashed border-border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Connect with a token / API key (manual)
              </summary>
              <form action={connectIntegrationAction} className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Company" htmlFor="pi-company">
                    <Select id="pi-company" name="companyId" required>
                      {companies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Platform" htmlFor="pi-platform">
                    <Select id="pi-platform" name="platform">
                      {PLATFORMS.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Field label="Account name" htmlFor="pi-account">
                  <Input id="pi-account" name="accountName" required placeholder="e.g. Millbrook IGA Instagram" />
                </Field>
                <Field
                  label="OAuth token / API key"
                  htmlFor="pi-token"
                  hint="Encrypted at rest (AES-256-GCM). Simulated connector in this build — real platform OAuth is the production drop-in."
                >
                  <Input id="pi-token" name="token" type="password" required />
                </Field>
                <Button type="submit" size="sm">
                  Connect
                </Button>
              </form>
            </details>
          </CardContent>
        </Card>

        {/* Queue health: platform ceilings + in-flight */}
        <Card>
          <CardContent className="p-6">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-semibold">Publish queue &amp; platform limits</h2>
              {inFlight.length > 0 && <Badge tone="info">{inFlight.length} in flight</Badge>}
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Each connected account&apos;s trailing-{CEILING_WINDOW_HOURS}h usage against its
              platform&apos;s publish ceiling. Posts over a ceiling are deferred — they stay
              queued and go out automatically when capacity frees.
            </p>
            <div className="space-y-2">
              {integrations
                .filter((i) => i.status === "connected")
                .map((i) => {
                  const ceiling = platformCeiling(i.platform);
                  const usage = used.get(i.id) ?? 0;
                  const atCap = ceiling !== null && usage >= ceiling;
                  return (
                    <div
                      key={i.id}
                      className="flex items-center justify-between rounded-md border border-border p-3 text-sm"
                    >
                      <div>
                        <span className="font-medium">{i.accountName}</span>
                        <p className="text-xs text-muted-foreground">
                          {companyById.get(i.companyId)?.name} · {i.platform}
                        </p>
                      </div>
                      <Badge tone={atCap ? "warning" : ceiling === null ? "neutral" : "success"}>
                        {ceiling === null
                          ? `${usage} / no ceiling`
                          : `${usage} / ${ceiling} per ${CEILING_WINDOW_HOURS}h${atCap ? " — at capacity" : ""}`}
                      </Badge>
                    </div>
                  );
                })}
              {integrations.filter((i) => i.status === "connected").length === 0 && (
                <p className="text-sm text-muted-foreground">No connected accounts yet.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Failure monitor (retrying) */}
        <Card className={failed.length ? "border-red-300" : ""}>
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="font-semibold">Publishing failure monitor</h2>
              <Badge tone={failed.length ? "danger" : "success"}>{failed.length}</Badge>
            </div>
            {failed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No failed posts. 🎉</p>
            ) : (
              <div className="space-y-3">
                {failed.map((p, idx) => {
                  const content = failedContent[idx];
                  const history = logsByPost.get(p.id) ?? [];
                  const lastLog = history[0];
                  const { attempts, lastFailedAt } = attemptsSinceRequeue(history);
                  const nextRetry =
                    attempts > 0 && attempts < MAX_PUBLISH_ATTEMPTS && lastFailedAt
                      ? retryEligibleAt(attempts, lastFailedAt)
                      : undefined;
                  return (
                    <div key={p.id} className="rounded-md border border-red-200 bg-red-50/40 p-3 text-sm">
                      <p className="font-medium">{content?.title ?? p.contentId}</p>
                      <p className="text-xs text-muted-foreground">
                        {companyById.get(p.companyId)?.name} · {p.platform} · {p.scheduledDate}
                        {lastLog && ` · ${lastLog.detail}`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Attempt {attempts} of {MAX_PUBLISH_ATTEMPTS}
                        {nextRetry &&
                          ` · auto-retries ${nextRetry <= nowIso ? "on the next queue tick" : `after ${formatDate(nextRetry)}`}`}
                      </p>
                      <form action={publishNowAction} className="mt-2">
                        <input type="hidden" name="postId" value={p.id} />
                        <Button type="submit" size="sm" variant="outline">
                          Retry now (attempt {attempts + 1})
                        </Button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dead-letter queue */}
        <Card className={dead.length ? "border-red-400" : ""}>
          <CardContent className="p-6">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="font-semibold">Dead-letter queue</h2>
              <Badge tone={dead.length ? "danger" : "success"}>{dead.length}</Badge>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              Posts that failed {MAX_PUBLISH_ATTEMPTS} times. The scheduler never retries
              them — requeue one to reset its retry budget, or cancel it.
            </p>
            {dead.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing in the dead-letter queue. 🎉</p>
            ) : (
              <div className="space-y-3">
                {dead.map((p, idx) => {
                  const content = deadContent[idx];
                  const lastLog = logsByPost.get(p.id)?.[0];
                  return (
                    <div key={p.id} className="rounded-md border border-red-300 bg-red-50/60 p-3 text-sm">
                      <p className="font-medium">{content?.title ?? p.contentId}</p>
                      <p className="text-xs text-muted-foreground">
                        {companyById.get(p.companyId)?.name} · {p.platform} · {p.scheduledDate}
                        {lastLog && ` · last error: ${lastLog.detail}`}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <form action={requeueDeadPostAction}>
                          <input type="hidden" name="postId" value={p.id} />
                          <Button type="submit" size="sm" variant="outline">
                            Requeue
                          </Button>
                        </form>
                        <form action={cancelScheduleAction}>
                          <input type="hidden" name="postId" value={p.id} />
                          <Button type="submit" size="sm" variant="ghost">
                            Cancel post
                          </Button>
                        </form>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Publishing log */}
        <Card>
          <CardContent className="p-0">
            <h2 className="border-b border-border p-5 font-semibold">Publishing log</h2>
            {logs.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No publish attempts yet. Schedule approved content, then run the publish queue.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">When</th>
                      <th className="px-4 py-2 font-medium">Company</th>
                      <th className="px-4 py-2 font-medium">Platform</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {logs.slice(0, 50).map((l) => (
                      <tr key={l.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                          {formatDate(l.createdAt)}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {companyById.get(l.companyId)?.name}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{l.platform}</td>
                        <td className="px-4 py-2">
                          <Badge
                            tone={
                              l.status === "published"
                                ? "success"
                                : l.status === "failed"
                                  ? "danger"
                                  : l.status === "requeued"
                                    ? "info"
                                    : "warning"
                            }
                          >
                            {titleCase(l.status)}
                            {l.attempt > 1 ? ` (retry ${l.attempt})` : ""}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{l.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
