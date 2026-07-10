import { requireUser, accessibleCompanyIds } from "@/lib/auth/rbac";
import { visibleCompanies } from "@/lib/scope";
import { getCompany, listTasks } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { createTaskAction, toggleTaskAction } from "../recommendations/actions";
import { AddTaskForm } from "@/components/add-task-form";

export default async function TasksPage() {
  const user = await requireUser();
  const companies = (await visibleCompanies(user)).filter(
    (c) => c.status !== "archived",
  );
  const scope = await accessibleCompanyIds(user);
  const tasks = await listTasks(user.tenantId, scope);
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");
  // Precompute company names for the task list (getCompany is async).
  const taskCompanyIds = Array.from(new Set(tasks.map((t) => t.companyId)));
  const taskCompanies = await Promise.all(
    taskCompanyIds.map((id) => getCompany(id)),
  );
  const companyNameById = new Map(
    taskCompanyIds.map((id, i) => [id, taskCompanies[i]?.name]),
  );

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Actions from recommendations and ad-hoc to-dos, scoped to your companies."
      />

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <h2 className="border-b border-border p-4 font-semibold">
                Open tasks ({open.length})
              </h2>
              {open.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  Nothing open. Generate recommendations and turn them into tasks.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {open.map((t) => (
                    <li key={t.id} className="flex items-start justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{t.title}</span>
                          <Badge tone="neutral">{companyNameById.get(t.companyId)}</Badge>
                          {t.sourceRecommendationId && <Badge tone="info">From recommendation</Badge>}
                        </div>
                        {t.detail && (
                          <p className="mt-0.5 text-sm text-muted-foreground">{t.detail}</p>
                        )}
                      </div>
                      <form action={toggleTaskAction}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <Button type="submit" size="sm">Mark done</Button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {done.length > 0 && (
            <details className="rounded-lg border border-border bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium">
                Completed ({done.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {done.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground line-through">{t.title}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatDate(t.doneAt)}</span>
                      <form action={toggleTaskAction}>
                        <input type="hidden" name="taskId" value={t.id} />
                        <Button type="submit" variant="ghost" size="sm">Reopen</Button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <Card className="h-fit">
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Add a task</h2>
            {companies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No companies assigned.</p>
            ) : (
              <AddTaskForm
                companies={companies.map((c) => ({ id: c.id, name: c.name }))}
                action={createTaskAction}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
