import Link from "next/link";
import { accessibleCompanyIds, requirePermission } from "@/lib/auth/rbac";
import { visibleContent, visibleCompanies } from "@/lib/scope";
import {
  getCompany,
  getContent,
  getTenant,
  listCampaignItems,
  listCampaigns,
  listScheduledPosts,
} from "@/lib/db";
import { addDaysIso, isoDayRange } from "@/lib/calendar-utils";
import { resolveQueueClock } from "@/lib/tenant-timezone";
import { isInClientReview } from "@/lib/managed-service/quality-routing";
import { canApproveRoute, ROUTE_LABEL } from "@/lib/routing";
import { buildApprovalAssist } from "@/lib/ai/approval-assist";
import { PageHeader } from "@/components/page-header";
import {
  ApprovalsLookahead,
  type LookaheadItem,
  type LookaheadStatus,
} from "@/components/approvals-lookahead";
import { ApprovalAssistNotes } from "@/components/approval-assist-notes";
import { RiskBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { titleCase } from "@/lib/utils";
import { approveContentAction, rejectContentAction } from "../content/actions";
import type { ContentItem, User } from "@/lib/types";

async function ApprovalCard({ c, user }: { c: ContentItem; user: User }) {
  const blocked = !!c.compliance && !c.compliance.canProceed;
  const route = c.routedTo ?? "admin";
  const mayApprove = canApproveRoute(user, route) && !blocked;
  const company = await getCompany(c.companyId);
  const companyName = company?.name;
  const assist = company ? await buildApprovalAssist(c, company) : null;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/content/${c.id}`} className="font-semibold hover:text-primary">
              {c.title}
            </Link>
            <p className="text-xs text-muted-foreground">
              {companyName} · {titleCase(c.type)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {c.groundingLabel && (
              <Badge tone={c.groundingLabel === "grounded" ? "success" : "warning"}>
                {titleCase(c.groundingLabel)}
              </Badge>
            )}
            {c.compliance && <RiskBadge level={c.compliance.riskLevel} />}
          </div>
        </div>

        <p className="mt-3 line-clamp-3 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
          {c.body}
        </p>

        {assist && <ApprovalAssistNotes assist={assist} />}

        {blocked && (
          <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">
            Critical compliance issue — resolve in the editor before approving.
          </p>
        )}
        {!blocked && !canApproveRoute(user, route) && (
          <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
            Routed to {ROUTE_LABEL[route]} — requires the super admin.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <form action={approveContentAction}>
            <input type="hidden" name="contentId" value={c.id} />
            <Button type="submit" disabled={!mayApprove}>
              Approve
            </Button>
          </form>
          <form action={rejectContentAction} className="flex flex-1 items-end gap-2">
            <input type="hidden" name="contentId" value={c.id} />
            <div className="flex-1">
              <Textarea name="note" placeholder="Reason (optional)" className="min-h-10" />
            </div>
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
              <input type="checkbox" name="changesOnly" className="h-4 w-4" />
              Changes only
            </label>
            <Button type="submit" variant="destructive">
              Reject
            </Button>
          </form>
          <Link href={`/content/${c.id}`} className="text-sm text-primary hover:underline">
            Open
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function clampDate(date: string, start: string, end: string, fallback: string): string | null {
  if (date >= start && date <= end) return date;
  // Still-open queue items older than the window stay visible on today.
  if (date < start) return fallback;
  return null;
}

function sortLookahead(a: LookaheadItem, b: LookaheadItem): number {
  const order: Record<LookaheadStatus, number> = {
    pending_approval: 0,
    client_review: 1,
    planned: 2,
    scheduled: 3,
    published: 4,
  };
  return (
    order[a.status] - order[b.status] ||
    (a.time ?? "99").localeCompare(b.time ?? "99") ||
    a.companyName.localeCompare(b.companyName) ||
    a.title.localeCompare(b.title)
  );
}

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requirePermission("approve_content");
  const allowed = new Set(await accessibleCompanyIds(user));
  const { company: companyParam } = await searchParams;
  const companyId =
    companyParam && allowed.has(companyParam) ? companyParam : undefined;
  const focusCompany = companyId ? await getCompany(companyId) : null;
  const allContent = await visibleContent(user);
  const pending = allContent.filter(
    (c) =>
      c.status === "pending_approval" &&
      (!companyId || c.companyId === companyId),
  );
  // Phase 3: content is routed to the right queue (§26).
  const standard = pending.filter(
    (c) => (c.routedTo ?? "admin") === "admin" || c.routedTo === "company_admin",
  );
  const elevated = pending.filter(
    (c) => c.routedTo === "senior" || c.routedTo === "compliance",
  );

  const [companies, tenant, posts, campaigns] = await Promise.all([
    visibleCompanies(user),
    getTenant(user.tenantId),
    listScheduledPosts(user.tenantId),
    listCampaigns(user.tenantId),
  ]);
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const scopedCompanyIds = new Set(
    companyId ? [companyId] : companies.map((c) => c.id),
  );
  const contentById = new Map(allContent.map((c) => [c.id, c]));

  const clock = resolveQueueClock(tenant);
  const today = clock.today;
  const days = isoDayRange(today, 7, 21);
  const windowStart = days[0]!;
  const windowEnd = days[days.length - 1]!;

  const lookahead: LookaheadItem[] = [];
  const seenContentIds = new Set<string>();
  const seenCampaignItemIds = new Set<string>();

  // 1) Scheduled / published posts in the window.
  for (const post of posts) {
    if (!scopedCompanyIds.has(post.companyId)) continue;
    if (post.status === "cancelled" || post.status === "failed" || post.status === "dead") {
      continue;
    }
    if (post.scheduledDate < windowStart || post.scheduledDate > windowEnd) continue;
    const content = contentById.get(post.contentId) ?? (await getContent(post.contentId));
    if (!content) continue;
    const company =
      companyById.get(post.companyId) ?? (await getCompany(post.companyId));
    const status: LookaheadStatus =
      post.status === "published" ? "published" : "scheduled";
    lookahead.push({
      id: `post-${post.id}`,
      date: post.scheduledDate,
      companyId: post.companyId,
      companyName: company?.name ?? post.companyId,
      title: content.title,
      status,
      href: `/content/${content.id}`,
      time: post.scheduledTime,
    });
    seenContentIds.add(content.id);
  }

  // 2) Pending approval + client review (queue items).
  for (const c of allContent) {
    if (!scopedCompanyIds.has(c.companyId)) continue;
    if (c.status !== "pending_approval") continue;
    if (seenContentIds.has(c.id)) continue;

    const clientReview = isInClientReview(c) || c.clientReview?.status === "pending";
    const status: LookaheadStatus = clientReview
      ? "client_review"
      : "pending_approval";
    const rawDate = (
      clientReview && c.clientReview?.sharedAt
        ? c.clientReview.sharedAt
        : c.updatedAt
    ).slice(0, 10);
    const date = clampDate(rawDate, windowStart, windowEnd, today);
    if (!date) continue;

    const company = companyById.get(c.companyId) ?? (await getCompany(c.companyId));
    lookahead.push({
      id: `content-${c.id}`,
      date,
      companyId: c.companyId,
      companyName: company?.name ?? c.companyId,
      title: c.title,
      status,
      href: `/content/${c.id}`,
    });
    seenContentIds.add(c.id);
  }

  // 3) Planned campaign items with dates in the window (not yet live posts).
  const activeCampaigns = campaigns.filter(
    (campaign) =>
      scopedCompanyIds.has(campaign.companyId) &&
      ["approved", "completed", "pending_approval", "draft"].includes(campaign.status),
  );
  const campaignBundles = await Promise.all(
    activeCampaigns.map(async (campaign) => ({
      campaign,
      items: await listCampaignItems(campaign.id),
    })),
  );
  for (const { campaign, items } of campaignBundles) {
    for (const item of items) {
      if (item.status === "scheduled" || item.status === "skipped" || item.status === "published") {
        continue;
      }
      if (seenCampaignItemIds.has(item.id)) continue;
      if (item.contentId && seenContentIds.has(item.contentId)) continue;

      const date = addDaysIso(campaign.startDate, item.dayOffset - 1);
      if (date < windowStart || date > windowEnd) continue;

      const content = item.contentId
        ? (contentById.get(item.contentId) ?? (await getContent(item.contentId)))
        : undefined;
      // Linked content still in approval queues is already covered above.
      if (
        content &&
        content.status === "pending_approval" &&
        seenContentIds.has(content.id)
      ) {
        continue;
      }

      const company =
        companyById.get(campaign.companyId) ?? (await getCompany(campaign.companyId));
      lookahead.push({
        id: `item-${item.id}`,
        date,
        companyId: campaign.companyId,
        companyName: company?.name ?? campaign.companyId,
        title: item.title || content?.title || "Planned post",
        status: "planned",
        href: content ? `/content/${content.id}` : `/campaigns/${campaign.id}`,
      });
      seenCampaignItemIds.add(item.id);
      if (content) seenContentIds.add(content.id);
    }
  }

  const itemsByDay: Record<string, LookaheadItem[]> = {};
  for (const day of days) itemsByDay[day] = [];
  for (const item of lookahead) {
    (itemsByDay[item.date] ??= []).push(item);
  }
  for (const day of Object.keys(itemsByDay)) {
    itemsByDay[day].sort(sortLookahead);
  }

  return (
    <div>
      <PageHeader
        title={
          focusCompany
            ? `Approvals · ${focusCompany.name}`
            : "Approval inbox"
        }
        explainerId="approvals"
        explainer={
          focusCompany
            ? `Pending approvals for ${focusCompany.name}. Content routes by risk and type — nothing publishes until someone here approves.`
            : "Agency approval inbox. Content routes by risk and type — nothing publishes until someone here approves."
        }
      />
      <div className="space-y-8 p-6">
        <ApprovalsLookahead
          days={days}
          today={today}
          itemsByDay={itemsByDay}
          companyFilterName={focusCompany?.name}
        />

        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-semibold">Compliance &amp; senior queue</h2>
            <Badge tone={elevated.length ? "danger" : "neutral"}>{elevated.length}</Badge>
          </div>
          <div className="space-y-4">
            {elevated.map((c) => (
              <ApprovalCard key={c.id} c={c} user={user} />
            ))}
            {elevated.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Nothing needs compliance or senior review.
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-semibold">Standard queue</h2>
            <Badge tone={standard.length ? "primary" : "neutral"}>{standard.length}</Badge>
          </div>
          <div className="space-y-4">
            {standard.map((c) => (
              <ApprovalCard key={c.id} c={c} user={user} />
            ))}
            {standard.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Nothing awaiting standard approval. 🎉
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
