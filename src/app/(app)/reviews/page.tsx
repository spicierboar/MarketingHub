import { requireUser, isAdmin } from "@/lib/auth/rbac";
import { visibleCompanies, visibleReviewCampaigns, visibleReviews } from "@/lib/scope";
import { getCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select, Input } from "@/components/ui/form";
import { LockedCompanyField } from "@/components/locked-company-field";
import { formatDate, titleCase } from "@/lib/utils";
import { computeReputationScore } from "@/lib/reviews";
import { reviewsConfigured } from "@/lib/reviews-connectors";
import { activateReviewCampaignAction, createReviewCampaignAction, draftReviewResponseAction, importReviewsAction, publishReviewResponseAction } from "./actions";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireUser();
  const admin = isAdmin(user);
  const companies = (await visibleCompanies(user)).filter((c) => c.status === "ai_ready" || c.status === "approved");
  const { company: companyParam } = await searchParams;
  const companyDefault =
    companyParam && companies.some((c) => c.id === companyParam)
      ? companyParam
      : undefined;
  const formCompanies = companyDefault
    ? companies.filter((c) => c.id === companyDefault)
    : companies;
  const reviews = (await visibleReviews(user)).filter(
    (r) => !companyDefault || r.companyId === companyDefault,
  );
  const campaigns = (await visibleReviewCampaigns(user)).filter(
    (c) => !companyDefault || c.companyId === companyDefault,
  );
  const reputation = computeReputationScore(reviews);
  const names = new Map((await Promise.all([...new Set(reviews.map((r) => r.companyId))].map(async (id) => [id, (await getCompany(id))?.name] as const))));

  const companyLocked = Boolean(companyDefault);
  const scopedCompany = companyDefault
    ? formCompanies.find((c) => c.id === companyDefault)
    : undefined;
  const formCompanyOpts = formCompanies.map((c) => ({ id: c.id, name: c.name }));

  return (
    <div>
      <PageHeader
        title={scopedCompany ? `Reviews · ${scopedCompany.name}` : "Review management"}
        description="Import reviews, AI-draft responses, and run review-request campaigns. Simulated until REVIEWS_LIVE is on."
      />
      <div className="grid gap-4 p-6 md:grid-cols-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Reputation</p><p className="text-2xl font-semibold">{reputation.score}/100</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Avg rating</p><p className="text-2xl font-semibold">{reputation.averageRating || "—"}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Mode</p><p className="text-sm font-medium">{reviewsConfigured() ? "Live gate on" : "Simulated"}</p></CardContent></Card>
      </div>
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <Card><CardContent className="p-6">
          <h2 className="mb-4 font-semibold">Import reviews</h2>
          <form action={importReviewsAction} className="space-y-4">
            <LockedCompanyField id="companyId" companies={formCompanyOpts} companyId={companyDefault} locked={companyLocked} />
            <Field label="Platform" htmlFor="platform"><Select id="platform" name="platform" defaultValue="google"><option value="google">Google</option><option value="facebook">Facebook</option><option value="yelp">Yelp</option><option value="tripadvisor">TripAdvisor</option></Select></Field>
            <Button type="submit">Import reviews</Button>
          </form>
        </CardContent></Card>
        <Card><CardContent className="p-6">
          <h2 className="mb-4 font-semibold">Review-request campaign</h2>
          <form action={createReviewCampaignAction} className="space-y-4">
            <LockedCompanyField id="cc" companies={formCompanyOpts} companyId={companyDefault} locked={companyLocked} />
            <Field label="Name" htmlFor="name" hint="Internal label for the campaign">
              <Input
                id="name"
                name="name"
                required
                placeholder="e.g. Post-stay Google review ask"
              />
            </Field>
            <Field label="Channel" htmlFor="channel"><Select id="channel" name="channel" defaultValue="email"><option value="email">Email</option><option value="sms">SMS</option><option value="qr">QR</option><option value="receipt">Receipt</option><option value="post_stay">Post-stay</option></Select></Field>
            <Button type="submit">Create campaign</Button>
          </form>
        </CardContent></Card>
      </div>
      <div className="space-y-4 p-6">{reviews.map((review) => (
        <Card key={review.id}><CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap gap-2"><span className="font-medium">{names.get(review.companyId)}</span><Badge tone="neutral">{titleCase(review.platform)}</Badge><Badge tone="primary">{review.rating}/5</Badge><StatusBadge status={review.status} /></div>
          <p className="text-sm">{review.authorName} · {formatDate(review.reviewedAt)}</p><p className="text-sm">{review.body}</p>
          {review.draftResponse && <p className="rounded border bg-muted/40 p-3 text-sm">{review.draftResponse}</p>}
          <div className="flex gap-2"><form action={draftReviewResponseAction}><input type="hidden" name="reviewId" value={review.id} /><Button size="sm" variant="outline" type="submit">AI draft</Button></form>{admin && review.draftResponse && <form action={publishReviewResponseAction}><input type="hidden" name="reviewId" value={review.id} /><Button size="sm" type="submit">Publish</Button></form>}</div>
        </CardContent></Card>
      ))}</div>
      <div className="space-y-4 p-6">{campaigns.map((c) => (
        <Card key={c.id}><CardContent className="p-4"><div className="flex gap-2"><span className="font-medium">{c.name}</span><StatusBadge status={c.status} /></div><p className="text-sm whitespace-pre-wrap">{c.messageTemplate}</p><p className="text-xs text-muted-foreground">Sent {c.sentCount} · Reviews {c.reviewCount}</p>{admin && c.status === "draft" && <form action={activateReviewCampaignAction}><input type="hidden" name="campaignId" value={c.id} /><Button size="sm" type="submit">Activate</Button></form>}</CardContent></Card>
      ))}</div>
    </div>
  );
}