import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, canAccessCompany, isAdmin } from "@/lib/auth/rbac";
import {
  getCampaign,
  getCompany,
  getOffer,
  listAiCampaignRecommendations,
  listCampaignBuilderRuns,
  listCampaignDraftScheduleItems,
  listCampaignItems,
  listCampaignPlanVersions,
  listCampaignExperiments,
} from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button, buttonClasses } from "@/components/ui/button";
import { formatDate, titleCase } from "@/lib/utils";
import {
  approveCampaignAction,
  cancelCampaignAction,
  generateItemDraftAction,
  shareCampaignPackAction,
  skipItemAction,
  submitCampaignAction,
} from "../actions";
import { Input } from "@/components/ui/form";
import { optimiseCampaignAction } from "../ai-layer-actions";
import { bulkScheduleCampaignAction } from "../../calendar/actions";
import { unpackKeyMessage } from "@/lib/ai/campaign-builder";
import { AiCampaignPlanReviewSections } from "@/components/campaign-builder-panel";
import { AiCampaignRecommendationsPanel } from "@/components/ai-campaign-recommendations-panel";
import { CampaignExperimentsPanel } from "@/components/campaign-experiments-panel";
import type { StructuredCampaignDraft } from "@/lib/ai-campaign-orchestrator";

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const campaign = await getCampaign(id);
  if (!campaign || !(await canAccessCompany(user, campaign.companyId))) notFound();

  const company = (await getCompany(campaign.companyId))!;
  const admin = isAdmin(user);
  const items = await listCampaignItems(campaign.id);
  const offer = campaign.offerId ? await getOffer(campaign.offerId) : undefined;
  const approved = campaign.status === "approved";
  const drafted = items.filter((i) => ["drafted", "approved"].includes(i.status)).length;
  const builderMeta = unpackKeyMessage(campaign.keyMessage);
  const planVersions = await listCampaignPlanVersions(campaign.id);
  const builderRuns = (await listCampaignBuilderRuns(campaign.companyId)).filter(
    (r) => r.campaignId === campaign.id,
  );
  const draftSchedule = await listCampaignDraftScheduleItems(campaign.id);
  const latestPlan = planVersions[planVersions.length - 1];
  const latestRun = builderRuns[0];
  const aiRecommendations = await listAiCampaignRecommendations(
    campaign.companyId,
    campaign.id,
  );
  const experiments = await listCampaignExperiments(user.tenantId, {
    campaignId: campaign.id,
  });
  const layerDraft = (campaign.layerMeta?.structuredDraft ??
    (campaign.layerMeta
      ? {
          userFacts: (campaign.layerMeta.userFacts as string[] | undefined) ?? [],
          systemData: (campaign.layerMeta.systemData as string[] | undefined) ?? [],
          assumptions: campaign.layerMeta.assumptions ?? [],
          recommendations: [],
          risks: campaign.layerMeta.risks ?? [],
          missingInfo: campaign.layerMeta.missingInfo ?? [],
          requiredApprovals: [],
        }
      : null)) as StructuredCampaignDraft | null;

  // Group items by week of the plan.
  const weeks = new Map<number, typeof items>();
  for (const item of items) {
    const week = Math.ceil(item.dayOffset / 7);
    if (!weeks.has(week)) weeks.set(week, []);
    weeks.get(week)!.push(item);
  }

  return (
    <div>
      <PageHeader
        title={campaign.name}
        description={`${company.name} · ${campaign.durationDays}-day plan · starts ${campaign.startDate}`}
        hideExplainer
      >
        <StatusBadge status={campaign.status} />
      </PageHeader>

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {[...weeks.entries()].map(([week, weekItems]) => (
            <Card key={week}>
              <CardContent className="p-6">
                <h2 className="mb-4 font-semibold">Week {week}</h2>
                <div className="space-y-4">
                  {weekItems.map((item) => {
                    const itemDate = addDays(campaign.startDate, item.dayOffset - 1);
                    const afterOfferEnd =
                      !!offer?.endDate && itemDate > offer.endDate;
                    const generate = generateItemDraftAction.bind(null, item.id);
                    return (
                      <div key={item.id} className="rounded-md border border-border p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="neutral">Day {item.dayOffset}</Badge>
                          <span className="text-xs text-muted-foreground">{itemDate}</span>
                          <Badge tone="info">{item.channel}</Badge>
                          <Badge tone="neutral">{titleCase(item.contentType)}</Badge>
                          <StatusBadge status={item.status} />
                          {afterOfferEnd && (
                            <Badge tone="danger">After offer expiry ({offer!.endDate})</Badge>
                          )}
                        </div>
                        <p className="mt-2 text-sm font-medium">{item.title}</p>
                        <p className="text-sm text-muted-foreground">{item.brief}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.contentId ? (
                            <Link
                              href={`/content/${item.contentId}`}
                              className={buttonClasses("outline", "sm")}
                            >
                              View draft
                            </Link>
                          ) : item.status === "planned" ? (
                            approved ? (
                              <form action={generate}>
                                <Button type="submit" size="sm">
                                  Generate draft
                                </Button>
                              </form>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                Approve the campaign to draft this item.
                              </span>
                            )
                          ) : null}
                          {item.status === "planned" && (
                            <form action={skipItemAction}>
                              <input type="hidden" name="itemId" value={item.id} />
                              <Button type="submit" variant="ghost" size="sm">
                                Skip
                              </Button>
                            </form>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-3 p-6">
              <h2 className="font-semibold">Campaign actions</h2>
              {campaign.status === "draft" && (
                <form action={submitCampaignAction}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <Button type="submit" className="w-full">
                    Submit for approval
                  </Button>
                </form>
              )}
              {items.some((i) => i.contentId) && (
                <form action={shareCampaignPackAction} className="space-y-2">
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <Input
                    name="clientEmail"
                    type="email"
                    placeholder="Client email (optional if approval contact is an email)"
                    className="text-sm"
                  />
                  <Button type="submit" variant="subtle" className="w-full">
                    Send pack to client Approvals
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Submits drafted items for client review — nothing publishes or spends.
                  </p>
                </form>
              )}
              {admin && campaign.status === "pending_approval" && (
                <form action={approveCampaignAction}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <Button type="submit" className="w-full">
                    Approve campaign
                  </Button>
                </form>
              )}
              {["approved", "completed"].includes(campaign.status) &&
                items.some((i) => i.status === "approved" && i.contentId) && (
                  <form action={bulkScheduleCampaignAction}>
                    <input type="hidden" name="campaignId" value={campaign.id} />
                    <Button type="submit" variant="subtle" className="w-full">
                      Schedule all approved items
                    </Button>
                  </form>
                )}
              {admin && !["cancelled", "completed"].includes(campaign.status) && (
                <form action={optimiseCampaignAction}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <Button type="submit" variant="subtle" className="w-full">
                    Run AI optimisation
                  </Button>
                </form>
              )}
              <a
                href={`/api/export/campaign/${campaign.id}`}
                className={buttonClasses("outline") + " w-full"}
              >
                Export campaign pack (Word)
              </a>
              {!["cancelled", "completed"].includes(campaign.status) && (
                <form action={cancelCampaignAction}>
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <Button type="submit" variant="ghost" className="w-full">
                    Cancel campaign
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          {(aiRecommendations.length > 0 || admin) && (
            <Card>
              <CardContent className="p-6">
                <AiCampaignRecommendationsPanel
                  recommendations={aiRecommendations}
                  emptyMessage="No pending AI recommendations — run AI optimisation to analyse this campaign."
                />
              </CardContent>
            </Card>
          )}

          {layerDraft && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">AI layer plan review</h2>
                <p className="mb-3 text-xs text-muted-foreground">
                  Structured output from the AI campaign layer — facts separated from
                  assumptions. Nothing here is live until you approve through existing gates.
                </p>
                <AiCampaignPlanReviewSections draft={layerDraft} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-3 font-semibold">Plan</h2>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">Objective</dt>
                  <dd className="font-medium">{campaign.objective}</dd>
                </div>
                {campaign.keyMessage && (
                  <div>
                    <dt className="text-muted-foreground">Strategy</dt>
                    <dd className="font-medium">
                      {builderMeta.strategy || campaign.keyMessage}
                    </dd>
                  </div>
                )}
                {builderMeta.meta?.channelPlan && (
                  <div>
                    <dt className="text-muted-foreground">Channel plan</dt>
                    <dd className="font-medium">{builderMeta.meta.channelPlan}</dd>
                  </div>
                )}
                {builderMeta.meta?.kpis && builderMeta.meta.kpis.length > 0 && (
                  <div>
                    <dt className="text-muted-foreground">KPIs</dt>
                    <dd>
                      <ul className="mt-1 list-inside list-disc text-sm">
                        {builderMeta.meta.kpis.map((k) => (
                          <li key={k}>{k}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
                {builderMeta.meta?.riskWarnings &&
                  builderMeta.meta.riskWarnings.length > 0 && (
                    <div>
                      <dt className="text-muted-foreground">Risk notes</dt>
                      <dd>
                        <ul className="mt-1 list-inside list-disc text-sm text-amber-700 dark:text-amber-400">
                          {builderMeta.meta.riskWarnings.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                  )}
                {!builderMeta.meta && campaign.keyMessage && (
                  <div>
                    <dt className="text-muted-foreground">Key message</dt>
                    <dd className="font-medium">{campaign.keyMessage}</dd>
                  </div>
                )}
                {campaign.audience && (
                  <div>
                    <dt className="text-muted-foreground">Audience</dt>
                    <dd className="font-medium">{campaign.audience}</dd>
                  </div>
                )}
                {campaign.serviceFocus && (
                  <div>
                    <dt className="text-muted-foreground">Focus</dt>
                    <dd className="font-medium">{campaign.serviceFocus}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Channels</dt>
                  <dd className="font-medium">
                    {campaign.channels.length ? campaign.channels.join(", ") : "Default"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Progress</dt>
                  <dd className="font-medium">
                    {drafted}/{items.length} items drafted
                  </dd>
                </div>
                {campaign.approvedAt && (
                  <div>
                    <dt className="text-muted-foreground">Approved</dt>
                    <dd className="font-medium">{formatDate(campaign.approvedAt)}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {(latestRun || latestPlan) && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Builder run</h2>
                <dl className="space-y-2 text-sm">
                  {latestPlan && (
                    <>
                      <div>
                        <dt className="text-muted-foreground">Goal</dt>
                        <dd className="font-medium">{latestPlan.goal}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Plan version</dt>
                        <dd className="font-medium">v{latestPlan.versionNumber} · {latestPlan.model}</dd>
                      </div>
                    </>
                  )}
                  {latestRun && (
                    <>
                      <div>
                        <dt className="text-muted-foreground">Mode</dt>
                        <dd className="font-medium capitalize">{latestRun.mode}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Draft assets spawned</dt>
                        <dd className="font-medium">{latestRun.spawnedContentCount}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Draft schedule slots</dt>
                        <dd className="font-medium">{latestRun.draftScheduleCount}</dd>
                      </div>
                    </>
                  )}
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Draft schedule proposals are not live-published until campaign and content approval gates pass.
                </p>
              </CardContent>
            </Card>
          )}

          {draftSchedule.length > 0 && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-3 font-semibold">Draft schedule (proposals)</h2>
                <ul className="space-y-2 text-sm">
                  {draftSchedule.map((slot) => (
                    <li key={slot.id} className="rounded-md border border-border p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{slot.scheduledDate}</Badge>
                        {slot.scheduledTime && (
                          <span className="text-xs text-muted-foreground">{slot.scheduledTime}</span>
                        )}
                        <Badge tone="info">{slot.platform}</Badge>
                        <Badge tone="neutral">draft</Badge>
                      </div>
                      <p className="mt-1 font-medium">{slot.title}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {offer && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-2 font-semibold">Offer in this campaign</h2>
                <p className="text-sm font-medium">{offer.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  “{offer.approvedWording}”
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {offer.startDate && `From ${offer.startDate} `}
                  {offer.endDate && `until ${offer.endDate}.`}
                </p>
                {offer.endDate &&
                  addDays(campaign.startDate, campaign.durationDays - 1) >
                    offer.endDate && (
                    <p className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-700">
                      This campaign runs past the offer&apos;s end date — items after{" "}
                      {offer.endDate} are flagged in the plan.
                    </p>
                  )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-6">
              <CampaignExperimentsPanel
                campaignId={campaign.id}
                experiments={experiments}
              />
            </CardContent>
          </Card>

          {campaign.eventName && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-2 font-semibold">Local event</h2>
                <p className="text-sm font-medium">{campaign.eventName}</p>
                {campaign.eventDate && (
                  <p className="text-sm text-muted-foreground">{campaign.eventDate}</p>
                )}
              </CardContent>
            </Card>
          )}

          {campaign.requestId && (
            <Card>
              <CardContent className="p-6">
                <h2 className="mb-2 font-semibold">Origin</h2>
                <Link
                  href={`/requests/${campaign.requestId}`}
                  className="text-sm text-primary hover:underline"
                >
                  Converted from a marketing support request →
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
