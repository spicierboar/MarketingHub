import { requireAdmin } from "@/lib/auth/rbac";
import { accessForUser, listCompanies, listMembers, listUsers } from "@/lib/db";
import { getCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { titleCase } from "@/lib/utils";
import {
  ALL_PERMISSIONS,
  ALL_SUGGESTED_ROLES,
  PERMISSION_CATALOG,
} from "@/lib/rbac-matrix";
import {
  applySuggestedRoleAction,
  createUserAction,
  grantAccessAction,
  revokeAccessAction,
  revokeSessionsAction,
  setRoleTitleAction,
  setUserActiveAction,
  toggleCapabilityAction,
} from "./actions";

// Granular role structure (§9).
const ROLE_TITLES = [
  "super_admin",
  "group_admin",
  "company_admin",
  "local_business_manager",
  "content_operator",
  "approver",
  "compliance_reviewer",
  "publisher",
  "analyst",
  "viewer",
] as const;

export default async function UsersPage() {
  const user = await requireAdmin();
  const users = await listUsers(user.tenantId);
  const companies = await listCompanies(user.tenantId);
  const members = await listMembers(user.tenantId);
  const capsByUserId = new Map(
    members.map((m) => [m.userId, new Set(m.capabilities ?? [])] as const),
  );
  // Prefetch per-user access lists and company names (async lookups can't
  // run inside the JSX map callbacks). Access rows are global (a user can be
  // a member of several tenants) — show ONLY rows for THIS tenant's companies,
  // or other tenants' company names would leak.
  const tenantCompanyIds = new Set(companies.map((c) => c.id));
  const accessLists = await Promise.all(
    users.map(async (u) =>
      (await accessForUser(u.id)).filter((a) => tenantCompanyIds.has(a.companyId)),
    ),
  );
  const accessByUserId = new Map(users.map((u, i) => [u.id, accessLists[i]]));
  const accessCompanyIds = Array.from(
    new Set(accessLists.flat().map((a) => a.companyId)),
  );
  const accessCompanies = await Promise.all(
    accessCompanyIds.map((id) => getCompany(id)),
  );
  const companyNameById = new Map(
    accessCompanyIds.map((id, i) => [id, accessCompanies[i]?.name]),
  );

  return (
    <div>
      <PageHeader
        title="Users"
        description="Individual accounts for auditability. No app passwords are ever issued."
      />

      <div className="space-y-6 p-6">
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Add user</h2>
            <form action={createUserAction} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required />
              </Field>
              <Field label="Email" htmlFor="email">
                <Input id="email" name="email" type="email" required />
              </Field>
              <Field label="Role" htmlFor="role">
                <Select id="role" name="role" defaultValue="user">
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </Select>
              </Field>
              <Field label="Assign to company" htmlFor="companyId">
                <Select id="companyId" name="companyId" defaultValue="">
                  <option value="">— none —</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="sm:col-span-2 lg:col-span-4">
                <Button type="submit">Add user</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {users.map((u) => {
            const access = accessByUserId.get(u.id)!;
            const assignedIds = new Set(access.map((a) => a.companyId));
            const unassigned = companies.filter((c) => !assignedIds.has(c.id));
            return (
              <Card key={u.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{u.name}</span>
                        <Badge tone={u.role === "user" ? "neutral" : "primary"}>
                          {titleCase(u.roleTitle ?? u.role)}
                        </Badge>
                        {u.active ? (
                          <Badge tone="success">Active</Badge>
                        ) : (
                          <Badge tone="danger">Deactivated</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <form action={setRoleTitleAction} className="flex items-center gap-1">
                        <input type="hidden" name="userId" value={u.id} />
                        <Select
                          name="roleTitle"
                          defaultValue={u.roleTitle ?? u.role}
                          className="h-8 w-44 py-0 text-xs"
                        >
                          {ROLE_TITLES.map((rt) => (
                            <option key={rt} value={rt}>{titleCase(rt)}</option>
                          ))}
                        </Select>
                        <Button type="submit" variant="outline" size="sm">Set role</Button>
                      </form>
                      <form action={revokeSessionsAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Revoke sessions
                        </Button>
                      </form>
                      <form action={setUserActiveAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                        <Button
                          type="submit"
                          variant={u.active ? "destructive" : "outline"}
                          size="sm"
                        >
                          {u.active ? "Deactivate" : "Reactivate"}
                        </Button>
                      </form>
                    </div>
                  </div>

                  {u.role === "user" && (
                    <div className="mt-4 border-t border-border pt-4">
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Company access
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {access.length === 0 && (
                          <span className="text-sm text-muted-foreground">
                            No clients assigned
                          </span>
                        )}
                        {access.map((a) => (
                          <span
                            key={a.companyId}
                            className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-1 text-xs text-primary"
                          >
                            {companyNameById.get(a.companyId)}
                            <form action={revokeAccessAction} className="inline">
                              <input type="hidden" name="userId" value={u.id} />
                              <input type="hidden" name="companyId" value={a.companyId} />
                              <button type="submit" className="ml-0.5 font-bold hover:text-red-600">
                                ×
                              </button>
                            </form>
                          </span>
                        ))}
                        {unassigned.length > 0 && (
                          <form action={grantAccessAction} className="flex items-center gap-1">
                            <input type="hidden" name="userId" value={u.id} />
                            <Select name="companyId" defaultValue="" className="h-8 py-0 text-xs">
                              <option value="" disabled>
                                + Add client
                              </option>
                              {unassigned.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </Select>
                            <Button type="submit" variant="outline" size="sm">
                              Add
                            </Button>
                          </form>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mt-4 border-t border-border pt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Capabilities (additive)
                    </p>
                    <div className="mb-2 flex flex-wrap items-center gap-1">
                      {ALL_PERMISSIONS.map((perm) => {
                        const on = capsByUserId.get(u.id)?.has(perm) ?? false;
                        return (
                          <form key={perm} action={toggleCapabilityAction}>
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="permission" value={perm} />
                            <input type="hidden" name="enable" value={on ? "false" : "true"} />
                            <button
                              type="submit"
                              title={PERMISSION_CATALOG[perm].description}
                              className={
                                on
                                  ? "rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200"
                                  : "rounded-full bg-slate-50 px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100"
                              }
                            >
                              {PERMISSION_CATALOG[perm].label}
                            </button>
                          </form>
                        );
                      })}
                    </div>
                    <form action={applySuggestedRoleAction} className="flex flex-wrap items-center gap-1">
                      <input type="hidden" name="userId" value={u.id} />
                      <Select name="suggestedRole" defaultValue="approver" className="h-8 w-44 py-0 text-xs">
                        {ALL_SUGGESTED_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {titleCase(r)}
                          </option>
                        ))}
                      </Select>
                      <Button type="submit" variant="outline" size="sm">
                        Apply preset
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
