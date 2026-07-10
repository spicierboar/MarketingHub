import { requireAdmin } from "@/lib/auth/rbac";
import { listCompanies, listCrmContacts, listCrmInteractions, listCrmSegments } from "@/lib/db";
import { consentLabel, contactDisplayName, crmLive, resolveSegmentMembers } from "@/lib/crm";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { createContactAction, createSegmentAction, importContactsAction } from "./actions";
export default async function CrmPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter((c) => c.status !== "archived");
  const companyId = params.company ?? companies[0]?.id;
  const [contacts, segments] = companyId ? await Promise.all([listCrmContacts(user.tenantId, companyId), listCrmSegments(user.tenantId, companyId)]) : [[], []];
  return (
    <div className="space-y-6 p-6">
      <PageHeader title="CRM" description="Contacts, segments, interaction history." />
      <Badge tone={crmLive() ? "success" : "neutral"}>{crmLive() ? "CRM_LIVE on" : "Simulated import"}</Badge>
      <Card><CardContent className="p-4"><form method="get"><Select name="company" defaultValue={companyId}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select><Button type="submit">View</Button></form></CardContent></Card>
      {companyId && (<>
        <form action={createContactAction}><input type="hidden" name="companyId" value={companyId} /><Input name="firstName" required placeholder="First name" /><Input name="email" placeholder="Email" /><Button type="submit">Add contact</Button></form>
        <form action={createSegmentAction}><input type="hidden" name="companyId" value={companyId} /><Input name="name" required placeholder="Segment name" /><Button type="submit">Add segment</Button></form>
        <ul>{contacts.map((c) => <li key={c.id}>{contactDisplayName(c)} · {consentLabel(c.consentStatus)}</li>)}</ul>
        <ul>{segments.map((s) => <li key={s.id}>{s.name}: {resolveSegmentMembers(s, contacts).length}</li>)}</ul>
      </>)}
    </div>
  );
}
