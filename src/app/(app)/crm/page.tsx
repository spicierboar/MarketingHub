import { requireAdmin } from "@/lib/auth/rbac";
import { listCompanies, listCrmContacts, listCrmSegments } from "@/lib/db";
import { consentLabel, contactDisplayName, crmLive, resolveSegmentMembers } from "@/lib/crm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { createContactAction, createSegmentAction } from "./actions";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter((c) => c.status !== "archived");
  const companyId = params.company ?? companies[0]?.id;
  const [contacts, segments] = companyId
    ? await Promise.all([
        listCrmContacts(user.tenantId, companyId),
        listCrmSegments(user.tenantId, companyId),
      ])
    : [[], []];
  return (
    <div className="space-y-6 p-6">
      <PageHeader title="CRM" description="Contacts, segments, interaction history." />
      <Badge tone={crmLive() ? "success" : "neutral"}>
        {crmLive() ? "CRM_LIVE on" : "Simulated import"}
      </Badge>
      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field label="Client" htmlFor="crm-company">
              <Select id="crm-company" name="company" defaultValue={companyId}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">View</Button>
          </form>
        </CardContent>
      </Card>
      {companyId && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-medium">Add contact</h3>
                <form action={createContactAction} className="space-y-3">
                  <input type="hidden" name="companyId" value={companyId} />
                  <Field label="First name" htmlFor="crm-first" hint="Required">
                    <Input
                      id="crm-first"
                      name="firstName"
                      required
                      placeholder="e.g. Jamie"
                    />
                  </Field>
                  <Field label="Email" htmlFor="crm-email" hint="Optional — used for dedupe">
                    <Input
                      id="crm-email"
                      name="email"
                      type="email"
                      placeholder="e.g. jamie@example.com"
                    />
                  </Field>
                  <Button type="submit">Add contact</Button>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3 p-4">
                <h3 className="font-medium">Add segment</h3>
                <form action={createSegmentAction} className="space-y-3">
                  <input type="hidden" name="companyId" value={companyId} />
                  <Field
                    label="Segment name"
                    htmlFor="crm-seg"
                    hint="Defaults to subscribed contacts"
                  >
                    <Input
                      id="crm-seg"
                      name="name"
                      required
                      placeholder="e.g. Newsletter opted-in"
                    />
                  </Field>
                  <Button type="submit">Add segment</Button>
                </form>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="space-y-4 p-4">
              <div>
                <h3 className="mb-2 font-medium">Contacts ({contacts.length})</h3>
                <ul className="space-y-1 text-sm">
                  {contacts.map((c) => (
                    <li key={c.id}>
                      {contactDisplayName(c)} · {consentLabel(c.consentStatus)}
                    </li>
                  ))}
                  {contacts.length === 0 && (
                    <li className="text-muted-foreground">No contacts yet.</li>
                  )}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium">Segments ({segments.length})</h3>
                <ul className="space-y-1 text-sm">
                  {segments.map((s) => (
                    <li key={s.id}>
                      {s.name}: {resolveSegmentMembers(s, contacts).length}
                    </li>
                  ))}
                  {segments.length === 0 && (
                    <li className="text-muted-foreground">No segments yet.</li>
                  )}
                </ul>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
