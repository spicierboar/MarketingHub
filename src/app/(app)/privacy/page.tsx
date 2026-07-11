import { requireAdmin } from "@/lib/auth/rbac";
import { listCompanies, listPrivacyRequests } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import {
  createPrivacyRequestAction,
  updatePrivacyRequestStatusAction,
} from "./actions";

const REQUEST_TYPES = [
  "access",
  "deletion",
  "rectification",
  "restriction",
  "portability",
] as const;

export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter((c) => c.status !== "archived");
  const companyId = params.company ?? companies[0]?.id;
  const requests = companyId
    ? await listPrivacyRequests(user.tenantId, companyId)
    : await listPrivacyRequests(user.tenantId);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Privacy"
        description="Data-subject requests (access, deletion, rectification, restriction, portability). Active restrictions block marketing use."
      />

      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field label="Company" htmlFor="company">
              <Select id="company" name="company" defaultValue={companyId}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              View
            </Button>
          </form>
        </CardContent>
      </Card>

      {companyId && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="font-semibold">Create request</h2>
            <form action={createPrivacyRequestAction} className="grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="companyId" value={companyId} />
              <Field label="Subject (contact id or email)" htmlFor="subjectRef">
                <Input id="subjectRef" name="subjectRef" required placeholder="crm_… or email@" />
              </Field>
              <Field label="Request type" htmlFor="requestType">
                <Select id="requestType" name="requestType" defaultValue="access">
                  {REQUEST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Jurisdiction" htmlFor="jurisdiction">
                <Input id="jurisdiction" name="jurisdiction" defaultValue="AU" />
              </Field>
              <Field label="Lawful basis" htmlFor="lawfulBasis">
                <Input id="lawfulBasis" name="lawfulBasis" placeholder="consent / legitimate interest" />
              </Field>
              <Field label="Due in (days)" htmlFor="dueDays">
                <Input id="dueDays" name="dueDays" type="number" min="1" defaultValue="30" />
              </Field>
              <Field label="Notes" htmlFor="notes">
                <Input id="notes" name="notes" placeholder="Optional" />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit">Create privacy request</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-semibold">Requests</h2>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No privacy requests yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Subject</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2">Created</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 font-medium">{r.subjectRef}</td>
                      <td className="px-3 py-2">
                        <Badge tone="info">{r.requestType}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.dueAt ? formatDate(r.dueAt) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {formatDate(r.createdAt)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.status === "pending" && (
                            <form action={updatePrivacyRequestStatusAction}>
                              <input type="hidden" name="requestId" value={r.id} />
                              <input type="hidden" name="status" value="in_progress" />
                              <Button size="sm" variant="secondary" type="submit">
                                Start
                              </Button>
                            </form>
                          )}
                          {(r.status === "pending" || r.status === "in_progress") && (
                            <>
                              <form action={updatePrivacyRequestStatusAction}>
                                <input type="hidden" name="requestId" value={r.id} />
                                <input type="hidden" name="status" value="completed" />
                                <Button size="sm" type="submit">
                                  Complete
                                </Button>
                              </form>
                              <form action={updatePrivacyRequestStatusAction}>
                                <input type="hidden" name="requestId" value={r.id} />
                                <input type="hidden" name="status" value="rejected" />
                                <Button size="sm" variant="outline" type="submit">
                                  Reject
                                </Button>
                              </form>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
