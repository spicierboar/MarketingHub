import Link from "next/link";
import { requireUser } from "@/lib/auth/rbac";
import { visibleCompanies } from "@/lib/scope";
import {
  getCampaign,
  getCompany,
  getContent,
  getOffer,
  getTenant,
  listCampaignItems,
  listCampaigns,
  listScheduledPosts,
} from "@/lib/db";
import {
  AU_HOLIDAYS,
  addDaysIso,
  dayConflicts,
  monthGrid,
  type CalendarEntry,
} from "@/lib/calendar-utils";
import {
  buildCalendarIntelligence,
  businessTypeLabel,
  distinctBusinessTypes,
  filterPortfolioEntries,
  portfolioSummary,
  scheduleTimingHint,
  type EnrichedCalendarEntry,
} from "@/lib/calendar-intelligence";
import { PageHeader } from "@/components/page-header";
import { CalendarGrid } from "@/components/calendar-grid";
import {
  CalendarIntelligencePanel,
  PortfolioCalendarTable,
} from "@/components/calendar-intelligence-panel";
import { CalendarAssistPanel } from "@/components/calendar-assist-panel";
import {
  listAssistReadyToSchedule,
  listOpenCalendarAssistForTenant,
} from "@/lib/ai/calendar-assist";
import { Select, Input } from "@/components/ui/form";
import { Button, buttonClasses } from "@/components/ui/button";
import { now, titleCase } from "@/lib/utils";

// Central social & content calendar (Phase 6, §34) + V1 module 4 intelligence:
// seasonal prompts, optimal-time hints, agency portfolio view.
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "")
    ? params.month!
    : now().slice(0, 7);
  const view = params.view === "portfolio" ? "portfolio" : "month";
  const grid = monthGrid(month);

  const companies = await visibleCompanies(user);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const companyIds = new Set(companies.map((c) => c.id));
  const fCompany = params.company || "";
  const fPlatform = (params.platform || "").toLowerCase();
  const fStatus = params.status || "";
  const fCampaign = params.campaign || "";
  const fRequest = (params.request || "").trim();
  const fBusinessType = params.businessType || "";

  const entries: EnrichedCalendarEntry[] = [];

  // Scheduled posts.
  for (const post of await listScheduledPosts(user.tenantId)) {
    if (!companyIds.has(post.companyId)) continue;
    if (post.status === "cancelled") continue;
    if (post.scheduledDate.slice(0, 7) !== month) continue;
    const content = await getContent(post.contentId);
    if (!content) continue;
    const company = companyById.get(post.companyId) ?? (await getCompany(post.companyId));

    const warnings: string[] = [];
    if (content.expiryDate && post.scheduledDate > content.expiryDate) {
      warnings.push(`Scheduled after content expiry (${content.expiryDate})`);
    }
    const campaign = content.campaignId ? await getCampaign(content.campaignId) : undefined;
    const offer = campaign?.offerId ? await getOffer(campaign.offerId) : undefined;
    if (offer?.endDate && post.scheduledDate > offer.endDate) {
      warnings.push(`After offer expiry (${offer.endDate})`);
    }
    if (campaign?.eventDate && post.scheduledDate > campaign.eventDate) {
      warnings.push(`After the event (${campaign.eventName} on ${campaign.eventDate})`);
    }
    if (AU_HOLIDAYS[post.scheduledDate]) {
      warnings.push(`Public holiday: ${AU_HOLIDAYS[post.scheduledDate]}`);
    }

    entries.push({
      id: post.id,
      kind: "post",
      date: post.scheduledDate,
      time: post.scheduledTime,
      title: content.title,
      status: post.status,
      platform: post.platform,
      companyId: post.companyId,
      companyName: company?.name ?? post.companyId,
      businessType: businessTypeLabel(company),
      campaignId: content.campaignId,
      requestId: content.requestId,
      href: `/content/${content.id}`,
      preview: content.body.slice(0, 320),
      warnings,
      scheduledPostId: post.id,
    });
  }

  // Planned campaign items (not yet scheduled/skipped) of active campaigns.
  for (const campaign of await listCampaigns(user.tenantId)) {
    if (!companyIds.has(campaign.companyId)) continue;
    if (!["approved", "completed", "pending_approval", "draft"].includes(campaign.status)) continue;
    for (const item of await listCampaignItems(campaign.id)) {
      if (item.status === "scheduled" || item.status === "skipped") continue;
      const date = addDaysIso(campaign.startDate, item.dayOffset - 1);
      if (date.slice(0, 7) !== month) continue;
      const content = item.contentId ? await getContent(item.contentId) : undefined;
      const company = companyById.get(campaign.companyId) ?? (await getCompany(campaign.companyId));
      entries.push({
        id: item.id,
        kind: "item",
        date,
        title: item.title,
        status: item.status,
        platform: item.channel,
        companyId: campaign.companyId,
        companyName: company?.name ?? campaign.companyId,
        businessType: businessTypeLabel(company),
        campaignId: campaign.id,
        requestId: campaign.requestId,
        href: content ? `/content/${content.id}` : `/campaigns/${campaign.id}`,
        preview: content ? content.body.slice(0, 320) : item.brief,
        warnings: [],
      });
    }
  }

  const tenant = await getTenant(user.tenantId);
  const industries = companies.map((c) => c.profile.industry ?? "").filter(Boolean);
  const intelligence = await buildCalendarIntelligence(tenant, user.tenantId, month, {
    companyIds: [...companyIds],
    industries,
    platform: fPlatform || undefined,
  });

  // Attach optimal-timing hints to scheduled posts (soft advisory).
  for (const e of entries) {
    if (e.kind !== "post" || !e.scheduledPostId) continue;
    const hint = scheduleTimingHint(
      {
        scheduledDate: e.date,
        scheduledTime: e.time,
        platform: e.platform,
        companyId: e.companyId,
      },
      intelligence.optimalWindows,
    );
    if (hint) e.warnings.push(hint);
  }

  const filtered = filterPortfolioEntries(entries, {
    companyId: fCompany || undefined,
    status: fStatus || undefined,
    channel: fPlatform || undefined,
    businessType: fBusinessType || undefined,
    campaignId: fCampaign || undefined,
    requestId: fRequest || undefined,
  });

  const entriesByDay: Record<string, CalendarEntry[]> = {};
  for (const e of filtered) {
    (entriesByDay[e.date] ??= []).push(e);
  }
  for (const day of Object.keys(entriesByDay)) {
    entriesByDay[day].sort((a, b) => (a.time ?? "99").localeCompare(b.time ?? "99"));
  }
  const conflictsByDay: Record<string, string[]> = {};
  for (const [day, dayEntries] of Object.entries(entriesByDay)) {
    const conflicts = dayConflicts(dayEntries);
    if (conflicts.length) conflictsByDay[day] = conflicts;
  }

  const campaigns = (await listCampaigns(user.tenantId)).filter((c) => companyIds.has(c.companyId));
  const businessTypes = distinctBusinessTypes(companies);
  const scheduledCount = filtered.filter((e) => e.kind === "post").length;
  const summary = portfolioSummary(filtered);
  const assistSuggestions = await listOpenCalendarAssistForTenant(
    user.tenantId,
    [...companyIds],
    12,
  );
  const assistReadyToSchedule = await listAssistReadyToSchedule(
    user.tenantId,
    [...companyIds],
    8,
  );

  const filterQs = (extra?: Record<string, string>) =>
    new URLSearchParams({ ...params, month, ...extra } as Record<string, string>);

  return (
    <div>
      <PageHeader
        title="Social & content calendar"
        explainerId="calendar"
        explainer="Plan and schedule posts across channels. Nothing goes live until it has been approved."
        description={`${scheduledCount} scheduled · ${filtered.length - scheduledCount} planned · ${intelligence.clock.clockLabel}`}
      >
        <Link
          href={`/calendar?${filterQs({ month: grid.prev })}`}
          className={buttonClasses("outline", "sm")}
        >
          ←
        </Link>
        <span className="min-w-36 text-center font-semibold">{grid.label}</span>
        <Link
          href={`/calendar?${filterQs({ month: grid.next })}`}
          className={buttonClasses("outline", "sm")}
        >
          →
        </Link>
        <Link
          href={`/calendar?${filterQs({ view: view === "month" ? "portfolio" : "month" })}`}
          className={buttonClasses(view === "portfolio" ? "default" : "outline", "sm")}
        >
          {view === "portfolio" ? "Portfolio" : "Portfolio view"}
        </Link>
      </PageHeader>

      <div className="space-y-4 p-6">
        <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
          <input type="hidden" name="month" value={month} />
          {view === "portfolio" && <input type="hidden" name="view" value="portfolio" />}
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Client</label>
            <Select name="company" defaultValue={fCompany} className="h-9 w-44">
              <option value="">All clients</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Business type</label>
            <Select name="businessType" defaultValue={fBusinessType} className="h-9 w-48">
              <option value="">All types</option>
              {businessTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Channel</label>
            <Input name="platform" defaultValue={params.platform} placeholder="e.g. Facebook" className="h-9 w-36" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Status</label>
            <Select name="status" defaultValue={fStatus} className="h-9 w-36">
              <option value="">All statuses</option>
              {["scheduled", "publishing", "approved", "drafted", "planned", "published", "failed", "dead"].map((s) => (
                <option key={s} value={s}>
                  {titleCase(s)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Campaign</label>
            <Select name="campaign" defaultValue={fCampaign} className="h-9 w-48">
              <option value="">All campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name.slice(0, 40)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Request ID</label>
            <Input name="request" defaultValue={params.request} placeholder="r_…" className="h-9 w-28" />
          </div>
          <Button type="submit" size="sm">
            Filter
          </Button>
          <Link href={`/calendar?month=${month}`} className="text-sm text-muted-foreground hover:text-foreground">
            Reset
          </Link>
        </form>

        <CalendarAssistPanel
          suggestions={assistSuggestions}
          readyToSchedule={assistReadyToSchedule}
          companies={companies}
          filterCompanyId={fCompany}
        />

        <CalendarIntelligencePanel
          clock={intelligence.clock}
          prompts={intelligence.seasonalPrompts}
          windows={intelligence.optimalWindows}
          monthLabel={grid.label}
        />

        {view === "portfolio" ? (
          <PortfolioCalendarTable
            entries={filtered}
            summary={summary}
            month={month}
            params={params}
          />
        ) : (
          <CalendarGrid
            weeks={grid.weeks}
            entriesByDay={entriesByDay}
            conflictsByDay={conflictsByDay}
            holidays={AU_HOLIDAYS}
            optimalWindows={intelligence.optimalWindows}
          />
        )}
      </div>
    </div>
  );
}
