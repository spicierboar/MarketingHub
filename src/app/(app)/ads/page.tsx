import { requireAdmin } from "@/lib/auth/rbac";
import {
  getAdBudget,
  listAdAccounts,
  listAdBudgets,
  listAdCampaigns,
  listAiCampaignRecommendations,
  listAudienceSegments,
  listCompanies,
  listLeads,
} from "@/lib/db";
import { companyPaidSummary, campaignMetrics, resolveCampaignMetrics, sumPaid, type PaidMetrics } from "@/lib/paid";
import { recommendAllocation } from "@/lib/ai/allocation";
import { targetingSummary, estimateReach } from "@/lib/targeting";
import { adsLive } from "@/lib/ad-connectors";
import { isTenantOwner } from "@/lib/auth/rbac";
import {
  MIN_CREDIT_FLOOR_USD,
  getCreditBalance,
} from "@/lib/credit-wallet";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { LockedCompanyFilter } from "@/components/locked-company-field";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatMoney } from "@/lib/utils";
import { AD_PLATFORMS } from "@/lib/types";
import type { AdAccount, AdBudget, AdCampaign, AdPlatform, AudienceSegment, Company, Lead } from "@/lib/types";
import { AudienceForm } from "./audience-form";
import {
  applyAllocationAction,
  applySpendChangeAction,
  connectAdAccountAction,
  createAdCampaignAction,
  deleteAudienceSegmentAction,
  disconnectAdAccountAction,
  invoiceManagementFeeAction,
  proposeAllocationAction,
  recordLeadAction,
  saveBudgetAction,
  setCampaignAudienceAction,
  suggestAudienceAction,
  updateAdCampaignStatusAction,
} from "./actions";
import { decideAiCampaignRecommendationAction } from "@/app/(app)/campaigns/ai-layer-actions";
import { scanCalendarAssistAction } from "@/app/(app)/calendar/actions";

const money = (x: number) => formatMoney(x);
const money2 = (x: number | null) => (x === null ? "—" : formatMoney(x, { fractionDigits: 2 }));
const pct = (x: number) => `${Math.round(x * 100)}%`;
const roasFmt = (x: number | null) => (x === null ? "—" : `${x.toFixed(1)}×`);

function connectedSet(accounts: AdAccount[]): Set<AdPlatform> {
  const s = new Set<AdPlatform>();
  for (const a of accounts) if (a.status === "connected") s.add(a.platform);
  return s;
}

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; editAudience?: string }>;
}) {
  const user = await requireAdmin();
  const owner = isTenantOwner(user);
  const params = await searchParams;
  const allCompanies = await listCompanies(user.tenantId);
  const companies = allCompanies.filter((c) => c.status !== "archived");
  const companyById = new Map(allCompanies.map((c) => [c.id, c] as const));

  const companyOpts = companies.map((c) => ({ id: c.id, name: c.name }));
  const companyLocked = Boolean(
    params.company && companies.some((c) => c.id === params.company),
  );

  const [accounts, campaigns, leads, budgets, segments] = await Promise.all([
    listAdAccounts(user.tenantId),
    listAdCampaigns(user.tenantId),
    listLeads(user.tenantId),
    listAdBudgets(user.tenantId),
    listAudienceSegments(user.tenantId),
  ]);
  const budgetByCompany = new Map(budgets.map((b) => [b.companyId, b] as const));
  const segmentById = new Map(segments.map((s) => [s.id, s] as const));
  const accountsByCompany = new Map<string, AdAccount[]>();
  const campaignsByCompany = new Map<string, AdCampaign[]>();
  const leadsByCompany = new Map<string, Lead[]>();
  const segmentsByCompany = new Map<string, AudienceSegment[]>();
  for (const a of accounts) (accountsByCompany.get(a.companyId) ?? accountsByCompany.set(a.companyId, []).get(a.companyId)!).push(a);
  for (const c of campaigns) (campaignsByCompany.get(c.companyId) ?? campaignsByCompany.set(c.companyId, []).get(c.companyId)!).push(c);
  for (const l of leads) (leadsByCompany.get(l.companyId) ?? leadsByCompany.set(l.companyId, []).get(l.companyId)!).push(l);
  for (const s of segments) (segmentsByCompany.get(s.companyId) ?? segmentsByCompany.set(s.companyId, []).get(s.companyId)!).push(s);

  const contextCompanyId =
    params.company && companies.some((c) => c.id === params.company)
      ? params.company
      : undefined;
  const pickerCompanies = contextCompanyId
    ? companies.filter((c) => c.id === contextCompanyId)
    : companies;

  // Band: when ?company= is set, only that client; otherwise tenant-wide
  // (managed spend is the CLIENTS' spend; the fee is OUR revenue).
  const bandCompanies = contextCompanyId ? pickerCompanies : companies;
  const summaries = bandCompanies.map((company) =>
    companyPaidSummary({
      company,
      campaigns: campaignsByCompany.get(company.id) ?? [],
      leads: leadsByCompany.get(company.id) ?? [],
      budget: budgetByCompany.get(company.id),
      connectedPlatforms: connectedSet(accountsByCompany.get(company.id) ?? []),
    }),
  );
  const bandTotals: PaidMetrics = sumPaid(summaries.map((s) => s.totals));
  const feeTotal = summaries.reduce((s, x) => s + x.managementFeeUsd, 0);
  const leadsTotal = summaries.reduce((s, x) => s + x.leadsCaptured, 0);

  // Selected company detail.
  const selected =
    (contextCompanyId
      ? companies.find((c) => c.id === contextCompanyId)
      : companies.find((c) => c.id === params.company) ?? companies[0]) ??
    undefined;
  const sel = selected
    ? {
        company: selected as Company,
        accounts: accountsByCompany.get(selected.id) ?? [],
        campaigns: campaignsByCompany.get(selected.id) ?? [],
        leads: leadsByCompany.get(selected.id) ?? [],
        budget: budgetByCompany.get(selected.id) as AdBudget | undefined,
        segments: segmentsByCompany.get(selected.id) ?? [],
      }
    : undefined;
  // Audience being edited (must belong to the selected company).
  const editSegment =
    sel && params.editAudience
      ? sel.segments.find((s) => s.id === params.editAudience)
      : undefined;
  const selConnected = sel ? connectedSet(sel.accounts) : new Set<AdPlatform>();
  const connectablePlatforms = AD_PLATFORMS.filter((p) => selConnected.has(p.key));
  const guidance = sel
    ? recommendAllocation({
        company: sel.company,
        budget: sel.budget,
        campaigns: sel.campaigns,
        connectedPlatforms: selConnected,
      })
    : undefined;

  const spendRecs = sel
    ? (await listAiCampaignRecommendations(sel.company.id)).filter(
        (r) => r.recommendationType === "budget_allocation",
      )
    : [];
  const pendingSpendRecs = spendRecs.filter(
    (r) => !r.humanDecision || r.humanDecision === "pending",
  );
  const acceptedSpendRecs = spendRecs.filter(
    (r) => r.humanDecision === "accepted" && r.actionTaken !== "allocation_applied",
  );

  const accountById = new Map((sel?.accounts ?? []).map((a) => [a.id, a]));
  const metricsByCampaignId = new Map<string, PaidMetrics>();
  if (sel) {
    await Promise.all(
      sel.campaigns.map(async (c) => {
        const account = accountById.get(c.adAccountId);
        metricsByCampaignId.set(c.id, await resolveCampaignMetrics(c, sel.company, account));
      }),
    );
  }

  const scopedCompany = contextCompanyId ? selected : undefined;
  const creditBalanceUsd = sel ? await getCreditBalance(sel.company.id) : null;
  const creditBelowFloor =
    creditBalanceUsd != null && creditBalanceUsd < MIN_CREDIT_FLOOR_USD;

  return (
    <div>
      <PageHeader
        title={scopedCompany ? `Paid ads · ${scopedCompany.name}` : "Paid advertising"}
        description="Delegated ad accounts + AI budget allocation. The client's own card pays the platform for ad spend — we manage the campaigns and charge a management fee. We never front spend or store a card. Package flag “ads management included” is informational until full entitlement gating ships — media spend is always extra."
      >
        <div className="flex items-center gap-2">
          <Badge tone={adsLive() ? "success" : "neutral"}>
            {adsLive() ? "Live campaign execution ON" : "Simulated (pending ad-API approval)"}
          </Badge>
          {owner && feeTotal > 0 && !contextCompanyId && (
            <form action={invoiceManagementFeeAction}>
              <Button type="submit" size="sm" variant="outline" disabled={feeTotal <= 0}>
                Invoice management fee ({money(feeTotal)})
              </Button>
            </form>
          )}
        </div>
      </PageHeader>

      <div className="space-y-6 p-6">
        {/* Unified band: closed-loop money view */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Managed spend (client)</p><p className="mt-1 text-2xl font-bold">{money(bandTotals.spendUsd)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Leads</p><p className="mt-1 text-2xl font-bold">{bandTotals.leads.toLocaleString("en-AU")}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Cost / lead</p><p className="mt-1 text-2xl font-bold">{money2(bandTotals.cplUsd)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Est. revenue</p><p className="mt-1 text-2xl font-bold">{money(bandTotals.revenueUsd)}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Return on spend</p><p className="mt-1 text-2xl font-bold">{roasFmt(bandTotals.roas)}</p></CardContent></Card>
          <Card className="border-primary/40"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Our fee (revenue)</p><p className="mt-1 text-2xl font-bold text-primary">{money(feeTotal)}</p></CardContent></Card>
        </div>

        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">Align organic calendar with ads</p>
              <p className="text-sm text-muted-foreground">
                Suggest flanking social posts for active / upcoming paid campaigns (ai_draft only —
                no spend, no auto-schedule).
              </p>
            </div>
            <form action={scanCalendarAssistAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="companyId" value={selected?.id ?? ""} />
              <Button type="submit" size="sm" variant="secondary" disabled={!selected}>
                Suggest calendar posts
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Company selector — locked when opened from client workspace */}
        <Card>
          <CardContent className="p-4">
            <form className="flex flex-wrap items-end gap-3">
              <LockedCompanyFilter
                companies={companyOpts}
                companyId={selected?.id}
                locked={companyLocked}
                name="company"
              />
              {!companyLocked && (
                <Button type="submit" variant="outline" size="sm">View</Button>
              )}
              <span className="text-xs text-muted-foreground">
                {leadsTotal} lead(s) captured
                {contextCompanyId ? " for this client" : " across the workspace"}
              </span>
            </form>
          </CardContent>
        </Card>

        {!sel && <p className="text-sm text-muted-foreground">Add a client to manage paid advertising.</p>}

        {sel && guidance && (
          <>
            {/* AI budget allocation guidance */}
            <Card>
              <CardContent className="p-6">
                <div className="mb-1 flex items-center gap-2">
                  <h2 className="font-semibold">AI budget allocation — {sel.company.name}</h2>
                  <Badge tone="info">{guidance.model}</Badge>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  Recommended split of the {money(guidance.monthlyBudgetUsd)}/mo budget across connected platforms, from cost-per-lead and return on spend.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Platform</th>
                        <th className="px-3 py-2 font-medium">Connected</th>
                        <th className="px-3 py-2 text-right font-medium">Spend</th>
                        <th className="px-3 py-2 text-right font-medium">Leads</th>
                        <th className="px-3 py-2 text-right font-medium">CPL</th>
                        <th className="px-3 py-2 text-right font-medium">ROAS</th>
                        <th className="px-3 py-2 text-right font-medium">Current</th>
                        <th className="px-3 py-2 text-right font-medium">Recommended</th>
                        <th className="px-3 py-2 text-right font-medium">→ Monthly</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {guidance.perPlatform.map((p) => (
                        <tr key={p.platform} className={p.connected ? "" : "opacity-50"}>
                          <td className="px-3 py-2 font-medium">{p.label}</td>
                          <td className="px-3 py-2">{p.connected ? <Badge tone="success">connected</Badge> : <Badge tone="neutral">not connected</Badge>}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{money(p.spendUsd)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{p.leads}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{money2(p.cplUsd)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{roasFmt(p.roas)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{pct(p.currentShare)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{p.connected ? pct(p.recommendedShare) : "—"}</td>
                          <td className="px-3 py-2 text-right">{p.connected ? money(p.recommendedMonthlyUsd) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                  {guidance.rationale.map((r, i) => (
                    <li key={i} className="flex gap-2"><span className="text-primary">•</span><span>{r}</span></li>
                  ))}
                </ul>
                <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  AI cannot move budget without approval. Propose a change, accept it as an admin
                  (or finance reviewer with <code className="text-xs">manage_budgets</code>), then apply —
                  or use dual confirmation for a manual override.
                </p>
                {guidance.hasConnected && guidance.monthlyBudgetUsd > 0 && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <form action={proposeAllocationAction}>
                      <input type="hidden" name="companyId" value={sel.company.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        Propose allocation (needs approval)
                      </Button>
                    </form>
                    <form action={applyAllocationAction} className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
                      <input type="hidden" name="companyId" value={sel.company.id} />
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" name="dualConfirm" value="yes" />
                        Confirm spend change
                      </label>
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" name="dualConfirmAck" value="yes" />
                        I understand AI cannot move budget without approval
                      </label>
                      <Button type="submit" size="sm" variant="outline">
                        Apply with dual confirm
                      </Button>
                    </form>
                  </div>
                )}
                {pendingSpendRecs.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h3 className="text-sm font-medium">Pending allocation approvals</h3>
                    {pendingSpendRecs.map((rec) => (
                      <div key={rec.id} className="flex flex-wrap items-center gap-2 rounded border border-border px-3 py-2 text-sm">
                        <span className="text-muted-foreground">{rec.summary}</span>
                        <form action={decideAiCampaignRecommendationAction}>
                          <input type="hidden" name="recommendationId" value={rec.id} />
                          <input type="hidden" name="decision" value="accepted" />
                          <Button type="submit" size="sm">Accept</Button>
                        </form>
                        <form action={decideAiCampaignRecommendationAction}>
                          <input type="hidden" name="recommendationId" value={rec.id} />
                          <input type="hidden" name="decision" value="rejected" />
                          <Button type="submit" size="sm" variant="outline">Reject</Button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
                {acceptedSpendRecs.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h3 className="text-sm font-medium">Accepted — ready to apply</h3>
                    {acceptedSpendRecs.map((rec) => (
                      <form key={rec.id} action={applySpendChangeAction} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="companyId" value={sel.company.id} />
                        <input type="hidden" name="recommendationId" value={rec.id} />
                        <span className="text-sm text-muted-foreground">{rec.summary}</span>
                        <Button type="submit" size="sm">Apply approved allocation</Button>
                      </form>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {creditBalanceUsd != null && (
              <Card className={creditBelowFloor ? "border-amber-300" : undefined}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Account credit</p>
                    <p className="mt-0.5 text-xl font-semibold">{money2(creditBalanceUsd)}</p>
                  </div>
                  <div className="text-right">
                    <Badge tone={creditBelowFloor ? "warning" : "success"}>
                      {creditBelowFloor
                        ? `Below $${MIN_CREDIT_FLOOR_USD} minimum`
                        : "At or above floor"}
                    </Badge>
                    {creditBelowFloor ? (
                      <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                        Paid ads stay paused until the client tops up in portal Billing
                        (/client/payments).
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Budget + fee terms */}
              <Card>
                <CardContent className="p-6">
                  <h2 className="mb-4 font-semibold">Budget &amp; management fee</h2>
                  <form action={saveBudgetAction} className="space-y-4">
                    <input type="hidden" name="companyId" value={sel.company.id} />
                    <Field
                      label="Monthly ad budget (client's spend, AUD)"
                      htmlFor="mb"
                      hint="What the client authorises platforms to spend"
                    >
                      <Input
                        id="mb"
                        name="monthlyBudgetUsd"
                        type="number"
                        min="0"
                        step="50"
                        defaultValue={sel.budget?.monthlyBudgetUsd ?? 0}
                        placeholder="e.g. 1500"
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Fee model" htmlFor="fm">
                        <Select id="fm" name="feeModel" defaultValue={sel.budget?.feeModel ?? "percent_of_spend"}>
                          <option value="percent_of_spend">% of spend</option>
                          <option value="flat_monthly">Flat monthly</option>
                        </Select>
                      </Field>
                      <Field label="Fee %" htmlFor="fp" hint="Typical 10–20%">
                        <Input
                          id="fp"
                          name="feePercentPct"
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          defaultValue={Math.round((sel.budget?.feePercent ?? 0.15) * 100)}
                          placeholder="15"
                        />
                      </Field>
                      <Field label="Flat $/mo" htmlFor="ff" hint="Used when fee model is flat">
                        <Input
                          id="ff"
                          name="feeFlatUsd"
                          type="number"
                          min="0"
                          step="10"
                          defaultValue={sel.budget?.feeFlatUsd ?? 0}
                          placeholder="e.g. 500"
                        />
                      </Field>
                    </div>
                    <Button type="submit" size="sm">Save budget</Button>
                  </form>
                  <p className="mt-3 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                    We invoice the management fee via Stripe. Prepaid account credit gates paid
                    activation; platforms may still bill connected ad accounts for delivery.
                  </p>
                </CardContent>
              </Card>

              {/* Delegated ad accounts */}
              <Card>
                <CardContent className="p-6">
                  <h2 className="mb-1 font-semibold">Delegated ad accounts</h2>
                  <p className="mb-4 text-sm text-muted-foreground">
                    The client grants scoped, revocable access to their OWN ad account — never a password, never a card.
                  </p>
                  <div className="mb-4 space-y-2">
                    {sel.accounts.map((a) => (
                      <div key={a.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                        <div>
                          <span className="font-medium">{a.accountName}</span>
                          <p className="text-xs text-muted-foreground">
                            {AD_PLATFORMS.find((p) => p.key === a.platform)?.label} · {a.externalAccountId} · token ••••{a.tokenLastFour}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge tone={a.status === "connected" ? "success" : "neutral"}>{a.status}</Badge>
                          {a.status === "connected" && (
                            <form action={disconnectAdAccountAction}>
                              <input type="hidden" name="adAccountId" value={a.id} />
                              <Button type="submit" variant="ghost" size="sm">Disconnect</Button>
                            </form>
                          )}
                        </div>
                      </div>
                    ))}
                    {sel.accounts.length === 0 && (
                      <p className="text-sm text-muted-foreground">No ad accounts connected.</p>
                    )}
                  </div>
                  <details className="rounded-md border border-dashed border-border p-4">
                    <summary className="cursor-pointer text-sm font-medium">Connect a delegated ad account</summary>
                    <form action={connectAdAccountAction} className="mt-3 space-y-3">
                      <input type="hidden" name="companyId" value={sel.company.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Platform" htmlFor="ap">
                          <Select id="ap" name="platform">
                            {AD_PLATFORMS.map((p) => (
                              <option key={p.key} value={p.key}>{p.label}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Account name" htmlFor="an">
                          <Input id="an" name="accountName" required placeholder="e.g. Client Meta Ads" />
                        </Field>
                      </div>
                      <Field label="External account id" htmlFor="ex" hint="Google Ads customer id / Meta ad-account id — the account the PLATFORM bills.">
                        <Input id="ex" name="externalAccountId" required placeholder="e.g. act_1234567890" />
                      </Field>
                      <Field label="Delegated grant token" htmlFor="tk" hint="Encrypted at rest. Live OAuth delegated-connect is the production drop-in once the ad-API approvals land.">
                        <Input
                          id="tk"
                          name="token"
                          type="password"
                          required
                          placeholder="Paste delegated grant token"
                          autoComplete="off"
                        />
                      </Field>
                      <Button type="submit" size="sm">Connect</Button>
                    </form>
                  </details>
                </CardContent>
              </Card>
            </div>

            {/* Audiences (targeting) */}
            <Card>
              <CardContent className="p-6">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <h2 className="font-semibold">Audiences &amp; targeting</h2>
                  <form action={suggestAudienceAction}>
                    <input type="hidden" name="companyId" value={sel.company.id} />
                    <Button type="submit" size="sm" variant="outline">✨ Suggest from Brand Brain</Button>
                  </form>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  Reusable targeting — geography, demographics, interests, custom/lookalike audiences, exclusions,
                  devices and placements. Attach an audience to a campaign below. Reach is an estimate (the platform&apos;s
                  real estimator applies once live).
                </p>
                <div className="mb-5 space-y-2">
                  {sel.segments.map((s) => (
                    <div key={s.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.name}</span>
                          <Badge tone="neutral">{s.platform === "all" ? "all platforms" : AD_PLATFORMS.find((p) => p.key === s.platform)?.label}</Badge>
                          <Badge tone="info">~{estimateReach(s.targeting).toLocaleString("en-AU")} reach</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <a href={`/ads?company=${sel.company.id}&editAudience=${s.id}`} className="text-xs text-primary hover:underline">Edit</a>
                          <form action={deleteAudienceSegmentAction}>
                            <input type="hidden" name="segmentId" value={s.id} />
                            <button type="submit" className="text-xs text-muted-foreground hover:text-red-600">Delete</button>
                          </form>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{targetingSummary(s.targeting)}</p>
                    </div>
                  ))}
                  {sel.segments.length === 0 && (
                    <p className="text-sm text-muted-foreground">No audiences yet. Create one below, or use ✨ Suggest.</p>
                  )}
                </div>
                <details className="rounded-md border border-dashed border-border p-4" open={!!editSegment}>
                  <summary className="cursor-pointer text-sm font-medium">
                    {editSegment ? `Editing: ${editSegment.name}` : "New audience"}
                  </summary>
                  <div className="mt-3">
                    <AudienceForm
                      key={editSegment?.id ?? "new"}
                      companyId={sel.company.id}
                      segmentId={editSegment?.id}
                      name={editSegment?.name}
                      platform={editSegment?.platform}
                      targeting={editSegment?.targeting}
                      onCancelHref={editSegment ? `/ads?company=${sel.company.id}` : undefined}
                    />
                  </div>
                </details>
              </CardContent>
            </Card>

            {/* Campaigns */}
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-4 font-semibold">Managed campaigns</h2>
                <div className="mb-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Campaign</th>
                        <th className="px-3 py-2 font-medium">Platform</th>
                        <th className="px-3 py-2 font-medium">Objective</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Audience</th>
                        <th className="px-3 py-2 text-right font-medium">Daily</th>
                        <th className="px-3 py-2 text-right font-medium">Spend (30d)</th>
                        <th className="px-3 py-2 text-right font-medium">Leads</th>
                        <th className="px-3 py-2 text-right font-medium">CPL</th>
                        <th className="px-3 py-2 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sel.campaigns.map((c) => {
                        const m = metricsByCampaignId.get(c.id) ?? campaignMetrics(c, sel.company);
                        const matched = sel.segments.filter((s) => s.platform === "all" || s.platform === c.platform);
                        const current = c.audienceSegmentId ? segmentById.get(c.audienceSegmentId) : undefined;
                        // Always show the CURRENT audience as an option even if it's
                        // no longer platform-compatible (e.g. its platform was edited),
                        // so the row never silently reads "Broad" and an untouched Set
                        // can't wipe a real link. A mismatch is flagged inline.
                        const currentIncompatible = !!current && !matched.some((s) => s.id === current.id);
                        const rowOptions = currentIncompatible ? [current, ...matched] : matched;
                        return (
                          <tr key={c.id}>
                            <td className="px-3 py-2 font-medium">{c.name}</td>
                            <td className="px-3 py-2 text-muted-foreground">{AD_PLATFORMS.find((p) => p.key === c.platform)?.label}</td>
                            <td className="px-3 py-2 text-muted-foreground">{c.objective}</td>
                            <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                            <td className="px-3 py-2">
                              <form action={setCampaignAudienceAction} className="flex items-center gap-1">
                                <input type="hidden" name="campaignId" value={c.id} />
                                <select
                                  name="audienceSegmentId"
                                  defaultValue={current?.id ?? ""}
                                  className="h-7 max-w-[9rem] rounded-md border border-input bg-card px-1.5 text-xs"
                                >
                                  <option value="">Broad / none</option>
                                  {rowOptions.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.name}{currentIncompatible && s.id === current?.id ? " (platform mismatch)" : ""}
                                    </option>
                                  ))}
                                </select>
                                <button type="submit" className="text-xs text-primary hover:underline">Set</button>
                              </form>
                            </td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{money(c.dailyBudgetUsd)}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{money(m.spendUsd)}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{m.leads}</td>
                            <td className="px-3 py-2 text-right text-muted-foreground">{money2(m.cplUsd)}</td>
                            <td className="px-3 py-2">
                              <div className="flex gap-1">
                                {c.status !== "active" && (
                                  <form action={updateAdCampaignStatusAction}>
                                    <input type="hidden" name="campaignId" value={c.id} />
                                    <input type="hidden" name="status" value="active" />
                                    <button type="submit" className="text-xs text-primary hover:underline">Activate</button>
                                  </form>
                                )}
                                {c.status === "active" && (
                                  <form action={updateAdCampaignStatusAction}>
                                    <input type="hidden" name="campaignId" value={c.id} />
                                    <input type="hidden" name="status" value="paused" />
                                    <button type="submit" className="text-xs text-amber-600 hover:underline">Pause</button>
                                  </form>
                                )}
                                {c.status !== "ended" && (
                                  <form action={updateAdCampaignStatusAction}>
                                    <input type="hidden" name="campaignId" value={c.id} />
                                    <input type="hidden" name="status" value="ended" />
                                    <button type="submit" className="text-xs text-muted-foreground hover:underline">End</button>
                                  </form>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {sel.campaigns.length === 0 && (
                        <tr><td colSpan={10} className="px-3 py-3 text-muted-foreground">No campaigns yet.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <details className="rounded-md border border-dashed border-border p-4">
                  <summary className="cursor-pointer text-sm font-medium">New campaign</summary>
                  {connectablePlatforms.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Connect a delegated ad account first — a campaign needs the client&apos;s own ad account to run on.
                    </p>
                  ) : (
                    <>
                      <form action={createAdCampaignAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="companyId" value={sel.company.id} />
                        <Field label="Name" htmlFor="cn"><Input id="cn" name="name" required placeholder="e.g. Spring lead-gen" /></Field>
                        <Field label="Platform" htmlFor="cp">
                          <Select id="cp" name="platform">
                            {connectablePlatforms.map((p) => (<option key={p.key} value={p.key}>{p.label}</option>))}
                          </Select>
                        </Field>
                        <Field label="Objective" htmlFor="co">
                          <Select id="co" name="objective" defaultValue="leads">
                            {["leads", "traffic", "awareness", "sales"].map((o) => (<option key={o} value={o}>{o}</option>))}
                          </Select>
                        </Field>
                        <Field label="Daily budget (AUD)" htmlFor="cd" hint="Platform daily cap">
                          <Input
                            id="cd"
                            name="dailyBudgetUsd"
                            type="number"
                            min="0"
                            step="5"
                            defaultValue={20}
                            placeholder="20"
                          />
                        </Field>
                        <Field label="Start date" htmlFor="cs" hint="When the campaign may go live">
                          <Input id="cs" name="startDate" type="date" required />
                        </Field>
                        <Field label="Audience (optional)" htmlFor="ca" hint="Platform-mismatched picks fall back to broad.">
                          <Select id="ca" name="audienceSegmentId" defaultValue="">
                            <option value="">Broad / none</option>
                            {sel.segments.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name} ({s.platform === "all" ? "all" : AD_PLATFORMS.find((p) => p.key === s.platform)?.label})
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <div className="flex items-end"><Button type="submit" size="sm">Create (draft)</Button></div>
                      </form>
                      <p className="mt-2 text-xs text-muted-foreground">Ad COPY still runs through the governed pipeline (paid copy routes to senior/compliance approval). This sets up the media plan; performance is simulated until the ad-API approvals land.</p>
                    </>
                  )}
                </details>
              </CardContent>
            </Card>

            {/* Leads */}
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-1 font-semibold">Captured leads</h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  Live capture via <code className="text-xs">/api/ads/leads/webhook</code> when <code className="text-xs">ADS_LIVE</code> is on (Meta + Google signatures). Until then, record leads manually.
                </p>
                <div className="mb-4 space-y-2">
                  {sel.leads.map((l) => (
                    <div key={l.id} className="flex items-center justify-between rounded-md border border-border p-3 text-sm">
                      <div>
                        <span className="font-medium">{l.contact}</span>
                        <p className="text-xs text-muted-foreground">
                          {AD_PLATFORMS.find((p) => p.key === l.platform)?.label} · {l.source}{l.valueUsd ? ` · ${money(l.valueUsd)}` : ""} · {formatDate(l.capturedAt)}
                        </p>
                      </div>
                      <StatusBadge status={l.status} />
                    </div>
                  ))}
                  {sel.leads.length === 0 && <p className="text-sm text-muted-foreground">No leads captured yet.</p>}
                </div>
                <details className="rounded-md border border-dashed border-border p-4">
                  <summary className="cursor-pointer text-sm font-medium">Record a lead</summary>
                  <form action={recordLeadAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="companyId" value={sel.company.id} />
                    <Field label="Contact" htmlFor="lc" hint="Name, email, or phone">
                      <Input id="lc" name="contact" required placeholder="e.g. Jamie Lee / jamie@…" />
                    </Field>
                    <Field label="Platform" htmlFor="lp">
                      <Select id="lp" name="platform">
                        {AD_PLATFORMS.map((p) => (<option key={p.key} value={p.key}>{p.label}</option>))}
                      </Select>
                    </Field>
                    <Field label="Source" htmlFor="ls" hint="Where the lead came from">
                      <Select id="ls" name="source" defaultValue="meta_lead_ad">
                        <option value="meta_lead_ad">Meta lead ad</option>
                        <option value="google_lead_form">Google lead form</option>
                        <option value="manual">Manual</option>
                      </Select>
                    </Field>
                    <Field label="Value (AUD, optional)" htmlFor="lv" hint="Estimated deal value">
                      <Input id="lv" name="valueUsd" type="number" min="0" step="1" placeholder="e.g. 250" />
                    </Field>
                    <div className="flex items-end"><Button type="submit" size="sm">Record lead</Button></div>
                  </form>
                </details>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
