import { requireAdmin } from "@/lib/auth/rbac";
import { listCompanies, listEmailCampaigns, listEmailSubscribers, listEmailTemplates } from "@/lib/db";
import { emailMarketingConfigured, previewCampaignAudience, resolveCampaignStats } from "@/lib/email-marketing";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import {
  createEmailSubscriberAction,
  createEmailTemplateAction,
  sendEmailCampaignAction,
  unsubscribeSubscriberAction,
} from "./actions";
import { EmailCampaignAiDraft } from "./email-ai-draft";

export default async function EmailMarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter((c) => c.status !== "archived");
  const companyId =
    params.company && companies.some((c) => c.id === params.company) ? params.company : companies[0]?.id;
  const [templates, subscribers, campaigns] = companyId
    ? await Promise.all([
        listEmailTemplates(user.tenantId, companyId),
        listEmailSubscribers(companyId),
        listEmailCampaigns(user.tenantId, companyId),
      ])
    : [[], [], []];
  const audience = companyId ? await previewCampaignAudience(user.tenantId, companyId, "newsletter") : null;
  const configured = emailMarketingConfigured();

  return (
    <div>
      <PageHeader
        title="Email Marketing"
        description="Owned-audience campaigns with templates, consent checks, and env-gated Resend delivery."
      >
        <Badge tone={configured ? "success" : "neutral"}>
          {configured ? "Resend configured" : "Simulated (no RESEND_API_KEY)"}
        </Badge>
      </PageHeader>

      {!configured && (
        <div className="mx-6 mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Sends are audit-logged only until RESEND_API_KEY is set.
        </div>
      )}

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <Card className="lg:col-span-3">
          <CardContent className="flex flex-wrap items-end gap-4 p-6">
            <form method="get" className="flex gap-3">
              <Field label="Company" htmlFor="company">
                <Select id="company" name="company" defaultValue={companyId ?? ""}>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="secondary">
                Switch
              </Button>
            </form>
            {audience && (
              <p className="text-sm text-muted-foreground">
                Newsletter segment: {audience.eligible} eligible / {audience.total} total
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Templates</h2>
            {templates.map((t) => (
              <div key={t.id} className="mb-2 rounded border p-2 text-sm">
                <div className="font-medium">{t.name}</div>
                <div className="text-muted-foreground">{t.kind}</div>
              </div>
            ))}
            {companyId && (
              <form action={createEmailTemplateAction} className="space-y-3 border-t pt-4">
                <input type="hidden" name="companyId" value={companyId} />
                <Field label="Name" htmlFor="tpl-name">
                  <Input id="tpl-name" name="name" required />
                </Field>
                <Field label="Kind" htmlFor="tpl-kind">
                  <Select id="tpl-kind" name="kind" defaultValue="newsletter">
                    <option value="newsletter">Newsletter</option>
                    <option value="promotion">Promotion</option>
                  </Select>
                </Field>
                <Field label="Subject" htmlFor="tpl-subject">
                  <Input id="tpl-subject" name="subject" required />
                </Field>
                <Field label="HTML" htmlFor="tpl-body">
                  <Textarea id="tpl-body" name="htmlBody" required rows={3} placeholder="<p>Hi {{name}}</p>" />
                </Field>
                <Button type="submit">Add template</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Subscribers</h2>
            {subscribers.map((s) => (
              <div key={s.id} className="mb-2 rounded border p-2 text-sm">
                <div>{s.email}</div>
                <div className="text-muted-foreground">
                  consent={String(s.marketingConsent)}
                  {s.unsubscribedAt ? " · unsubscribed" : ""}
                </div>
                {!s.unsubscribedAt && (
                  <form action={unsubscribeSubscriberAction}>
                    <input type="hidden" name="subscriberId" value={s.id} />
                    <Button type="submit" variant="secondary" className="mt-1 h-7 text-xs">
                      Unsubscribe
                    </Button>
                  </form>
                )}
              </div>
            ))}
            {companyId && (
              <form action={createEmailSubscriberAction} className="space-y-3 border-t pt-4">
                <input type="hidden" name="companyId" value={companyId} />
                <Field label="Email" htmlFor="sub-email">
                  <Input id="sub-email" name="email" type="email" required />
                </Field>
                <Field label="Tags" htmlFor="sub-tags">
                  <Input id="sub-tags" name="tags" placeholder="newsletter" />
                </Field>
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="marketingConsent" /> Marketing consent
                </label>
                <Button type="submit">Add subscriber</Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Campaigns</h2>
            {campaigns.map((c) => {
              const stats = resolveCampaignStats(c);
              return (
                <div key={c.id} className="mb-2 rounded border p-2 text-sm">
                  <div className="font-medium">{c.name}</div>
                  <div>
                    {c.status}
                    {c.status === "sent" ? ` · opens ${stats.opens}` : ""}
                  </div>
                  {c.status !== "sent" && (
                    <form action={sendEmailCampaignAction}>
                      <input type="hidden" name="campaignId" value={c.id} />
                      <Button type="submit" className="mt-1 h-7 text-xs">
                        Send
                      </Button>
                    </form>
                  )}
                </div>
              );
            })}
            {companyId && (
              <EmailCampaignAiDraft
                companyId={companyId}
                fallbackTemplateId={templates[0]?.id}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
