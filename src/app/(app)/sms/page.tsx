import { requireAdmin } from "@/lib/auth/rbac";
import {
  getSmsCompanySettings,
  listCompanies,
  listSmsCampaigns,
  listSmsSubscribers,
} from "@/lib/db";
import { smsLive, smsPlatformConfigured } from "@/lib/sms-connectors";
import { defaultSmsSettings, kindLabel, previewSmsCost, smsCountryRule } from "@/lib/sms";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import {
  addSmsSubscriberAction,
  createSmsCampaignAction,
  saveSmsSettingsAction,
  sendSmsCampaignAction,
  setSmsConsentAction,
} from "./actions";

const money = (x: number) => `$${x.toFixed(2)}`;

export default async function SmsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter((c) => c.status !== "archived");
  const selectedId =
    params.company && companies.some((c) => c.id === params.company)
      ? params.company
      : companies[0]?.id;

  const settingsRows = await Promise.all(
    companies.map(async (c) => [c.id, (await getSmsCompanySettings(c.id)) ?? defaultSmsSettings(c.id)] as const),
  );
  const settingsByCompany = new Map(settingsRows);
  const [subs, camps] = selectedId
    ? await Promise.all([listSmsSubscribers(selectedId), listSmsCampaigns(user.tenantId, selectedId)])
    : [[], []];
  const settings = selectedId ? settingsByCompany.get(selectedId) ?? defaultSmsSettings(selectedId) : null;
  const company = companies.find((c) => c.id === selectedId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="SMS Marketing"
        description="Consent-based SMS with quiet hours, country rules, and cost preview. Simulated until Twilio keys are set."
      />
      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4 text-sm">
          <Badge tone={smsLive() ? "success" : "neutral"}>SMS_LIVE: {smsLive() ? "on" : "off"}</Badge>
          <Badge tone={smsPlatformConfigured() ? "success" : "neutral"}>
            Twilio: {smsPlatformConfigured() ? "configured" : "not configured"}
          </Badge>
          <span className="text-muted-foreground">PUBLISHING_LIVE / ADS_LIVE / ANALYTICS_LIVE remain OFF.</span>
        </CardContent>
      </Card>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <Field label="Company">
          <Select name="company" defaultValue={selectedId ?? ""}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary">View</Button>
      </form>
      {company && settings && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><CardContent className="space-y-4 p-6">
              <h2 className="text-lg font-semibold">Settings</h2>
              <form action={saveSmsSettingsAction} className="space-y-3">
                <input type="hidden" name="companyId" value={company.id} />
                <Field label="Country"><Select name="countryCode" defaultValue={settings.countryCode}>{["AU","NZ","US","GB"].map((cc)=><option key={cc} value={cc}>{cc}</option>)}</Select></Field>
                <Field label="Sender ID" hint={`Max ${smsCountryRule(settings.countryCode).maxSenderIdLen} chars`}><Input name="senderId" defaultValue={settings.senderId} required /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quiet start"><Input name="quietHoursStart" type="time" defaultValue={settings.quietHoursStart} /></Field>
                  <Field label="Quiet end"><Input name="quietHoursEnd" type="time" defaultValue={settings.quietHoursEnd} /></Field>
                </div>
                <Field label="Monthly cap USD"><Input name="monthlySpendCapUsd" type="number" min={0} defaultValue={settings.monthlySpendCapUsd ?? ""} /></Field>
                <Button type="submit">Save settings</Button>
              </form>
            </CardContent></Card>
            <Card><CardContent className="space-y-4 p-6">
              <h2 className="text-lg font-semibold">Add subscriber</h2>
              <form action={addSmsSubscriberAction} className="space-y-3">
                <input type="hidden" name="companyId" value={company.id} />
                <Field label="Phone"><Input name="phone" required /></Field>
                <Field label="Name"><Input name="name" /></Field>
                <Field label="Tags"><Input name="tags" placeholder="loyalty" /></Field>
                <label className="flex gap-2 text-sm"><input type="checkbox" name="consent" defaultChecked />Consent on file</label>
                <Button type="submit">Add</Button>
              </form>
            </CardContent></Card>
          </div>
          <Card><CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">Subscribers ({subs.length})</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-2">Phone</th><th>Name</th><th>Consent</th><th>Tags</th><th /></tr></thead>
              <tbody>
                {subs.map((sub) => (
                  <tr key={sub.id} className="border-b">
                    <td className="py-2 font-mono text-xs">{sub.phoneE164}</td>
                    <td>{sub.name ?? "—"}</td>
                    <td><StatusBadge status={sub.consentStatus} /></td>
                    <td>{sub.tags.join(", ") || "—"}</td>
                    <td className="flex gap-2">
                      {sub.consentStatus !== "opted_in" && <form action={setSmsConsentAction}><input type="hidden" name="subscriberId" value={sub.id} /><input type="hidden" name="status" value="opted_in" /><Button size="sm" variant="secondary" type="submit">Opt in</Button></form>}
                      {sub.consentStatus !== "opted_out" && <form action={setSmsConsentAction}><input type="hidden" name="subscriberId" value={sub.id} /><input type="hidden" name="status" value="opted_out" /><Button size="sm" variant="outline" type="submit">Opt out</Button></form>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent></Card>
          <Card><CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">New campaign</h2>
            <form action={createSmsCampaignAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="companyId" value={company.id} />
              <Field label="Name"><Input name="name" required /></Field>
              <Field label="Kind"><Select name="kind" defaultValue="promotional"><option value="promotional">Promotional</option><option value="transactional">Transactional</option></Select></Field>
              <Field label="Segment tag"><Input name="segmentTag" /></Field>
              <Field label="UTM campaign"><Input name="utmCampaign" /></Field>
              <Field label="Short link" className="md:col-span-2"><Input name="shortLink" type="url" /></Field>
              <Field label="Message" className="md:col-span-2" hint="Include STOP for promotional">
                <Textarea name="body" rows={4} required defaultValue="Hi {{name}} — offer at {{company}}. Reply STOP to opt out." />
              </Field>
              <div className="md:col-span-2"><Button type="submit">Save draft</Button></div>
            </form>
          </CardContent></Card>
          <Card><CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold">Campaigns</h2>
            {camps.map((camp) => {
              const cost = previewSmsCost(camp.body, camp.stats.recipients, settings.countryCode);
              return (
                <div key={camp.id} className="rounded-lg border p-4">
                  <div className="flex justify-between gap-2"><div><p className="font-medium">{camp.name}</p><p className="text-xs text-muted-foreground">{kindLabel(camp.kind)}{camp.sentAt ? ` · ${formatDate(camp.sentAt)}` : ""}</p></div><StatusBadge status={camp.status} /></div>
                  <p className="mt-2 text-sm whitespace-pre-wrap">{camp.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">Est. {money(camp.stats.estimatedCostUsd || cost.estimatedCostUsd)} · {cost.segmentsPerMessage} seg/msg · {camp.stats.recipients} recipients</p>
                  {(camp.status === "draft" || camp.status === "scheduled") && (
                    <form action={sendSmsCampaignAction} className="mt-3"><input type="hidden" name="campaignId" value={camp.id} /><Button size="sm" type="submit">Send now (simulated)</Button></form>
                  )}
                </div>
              );
            })}
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
