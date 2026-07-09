// Portal RBAC, client approval, and field-sales access self-test (P0 / M10).

import {
  addMembership,
  createCompany,
  createContent,
  createTenant,
  createUser,
  getContent,
  getCompany,
  grantAccess,
  purgeTenant,
  updateCompany,
} from "@/lib/db";
import {
  canAccessCompany,
  canAccessFieldSales,
  isPortalUser,
  isSalesRep,
  portalCompanyId,
  postLoginRedirectPath,
} from "@/lib/auth/rbac";
import { completeClientApproval } from "@/lib/client-approval";
import { autoPublishOnApprove } from "@/lib/auto-publish-on-approve";
import { visibleContent } from "@/lib/scope";
import { TENANT_ROLE_TIER } from "@/lib/types";
import type { ActingUser, TenantRole, User } from "@/lib/types";

export interface PortalCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PortalReport {
  ok: boolean;
  passed: number;
  failed: number;
  purgeFailed: string[];
  durationMs: number;
  checks: PortalCheck[];
}

function acting(
  user: User,
  tenantId: string,
  tenantRole: TenantRole,
  roleTitle?: string,
): ActingUser {
  return {
    ...user,
    tenantId,
    tenantRole,
    role: TENANT_ROLE_TIER[tenantRole],
    ...(roleTitle ? { roleTitle: roleTitle as ActingUser["roleTitle"] & string } : {}),
  };
}

const APPROVAL_BODY =
  "Visit our bakery this weekend for fresh sourdough and seasonal pastries.";

function pendingReview(email: string) {
  return {
    email,
    sharedById: "system:portal-selftest",
    sharedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    link: "https://example.test/approve/stub",
    status: "pending" as const,
  };
}

export async function runPortalSelfTest(): Promise<PortalReport> {
  const startedAt = Date.now();
  const checks: PortalCheck[] = [];
  const expect = async (
    name: string,
    fn: () => Promise<{ ok: boolean; detail: string }>,
  ): Promise<void> => {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({
        name,
        ok: false,
        detail: `threw: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  };

  let tenantId: string | undefined;
  const purgeFailed: string[] = [];

  try {
    const suffix = `${Date.now()}`;
    const tenant = await createTenant({
      name: "Portal SelfTest",
      kind: "agency",
      plan: "starter",
      status: "active",
    });
    tenantId = tenant.id;

    const portalUser = await createUser({
      email: `portal+${suffix}@selftest.dev`,
      name: "Portal Client",
      role: "user",
    });
    const multiUser = await createUser({
      email: `multi+${suffix}@selftest.dev`,
      name: "Multi Company",
      role: "user",
    });
    const salesUser = await createUser({
      email: `sales+${suffix}@selftest.dev`,
      name: "Sales Rep",
      role: "user",
    });
    const adminUser = await createUser({
      email: `admin+${suffix}@selftest.dev`,
      name: "Agency Admin",
      role: "admin",
    });

    await addMembership({
      tenantId: tenant.id,
      userId: portalUser.id,
      role: "member",
    });
    await addMembership({
      tenantId: tenant.id,
      userId: multiUser.id,
      role: "member",
    });
    await addMembership({
      tenantId: tenant.id,
      userId: salesUser.id,
      role: "admin",
    });
    await addMembership({
      tenantId: tenant.id,
      userId: adminUser.id,
      role: "admin",
    });

    const companyA = await createCompany({
      tenantId: tenant.id,
      name: "Portal Co A",
      createdBy: adminUser.id,
    });
    const companyB = await createCompany({
      tenantId: tenant.id,
      name: "Portal Co B",
      createdBy: adminUser.id,
    });

    await grantAccess(portalUser.id, companyA.id);
    await grantAccess(multiUser.id, companyA.id);
    await grantAccess(multiUser.id, companyB.id);

    const portalActor = acting(portalUser, tenant.id, "member");
    const multiActor = acting(multiUser, tenant.id, "member");
    const salesActor = acting(salesUser, tenant.id, "admin", "sales_rep" as string);
    const adminActor = acting(adminUser, tenant.id, "admin");

    await expect("portal.rbac.isPortalUser_singleAccess", async () => {
      const ok = (await isPortalUser(portalActor)) === true;
      return { ok, detail: `portal=${ok}` };
    });

    await expect("portal.rbac.isPortalUser_rejectsMultiCompany", async () => {
      const ok = (await isPortalUser(multiActor)) === false;
      return { ok, detail: `multi=${!ok}` };
    });

    await expect("portal.rbac.portalCompanyId", async () => {
      const id = await portalCompanyId(portalActor);
      return { ok: id === companyA.id, detail: `id=${id}` };
    });

    await expect("portal.rbac.postLoginRedirectPath", async () => {
      const path = await postLoginRedirectPath(portalActor);
      return { ok: path === "/client", detail: path };
    });

    await expect("portal.scope.visibleContent_scoped", async () => {
      await createContent({
        companyId: companyA.id,
        type: "social_post",
        title: "Portal visible",
        body: APPROVAL_BODY,
        status: "user_edited",
        createdById: adminUser.id,
      });
      await createContent({
        companyId: companyB.id,
        type: "social_post",
        title: "Other company",
        body: APPROVAL_BODY,
        status: "user_edited",
        createdById: adminUser.id,
      });
      const visible = await visibleContent(portalActor);
      const ok =
        visible.some((c) => c.companyId === companyA.id) &&
        !visible.some((c) => c.companyId === companyB.id);
      return { ok, detail: `count=${visible.length}` };
    });

    await expect("portal.approval.completeClientApproval_approved", async () => {
      const content = await createContent({
        companyId: companyA.id,
        type: "social_post",
        title: "Approve me",
        body: APPROVAL_BODY,
        status: "pending_approval",
        createdById: adminUser.id,
        clientReview: pendingReview(portalUser.email),
      });
      const result = await completeClientApproval({
        contentId: content.id,
        actor: { kind: "portal", user: portalActor, companyId: companyA.id },
        decision: "approved",
      });
      const updated = await getContent(content.id);
      const ok =
        result.ok === true &&
        updated?.clientReview?.status === "approved" &&
        ["approved", "scheduled", "published"].includes(updated?.status ?? "");
      return {
        ok,
        detail: `status=${updated?.status} auto=${result.autoPublish ?? "none"}`,
      };
    });

    await expect("portal.approval.completeClientApproval_changesRequested", async () => {
      const content = await createContent({
        companyId: companyA.id,
        type: "social_post",
        title: "Change me",
        body: APPROVAL_BODY,
        status: "pending_approval",
        createdById: adminUser.id,
        clientReview: pendingReview(portalUser.email),
      });
      await completeClientApproval({
        contentId: content.id,
        actor: { kind: "portal", user: portalActor, companyId: companyA.id },
        decision: "changes_requested",
        note: "Please shorten the copy",
      });
      const updated = await getContent(content.id);
      const ok =
        updated?.status === "changes_required" &&
        updated.clientReview?.status === "changes_requested";
      return { ok, detail: `status=${updated?.status}` };
    });

    await expect("portal.autoPublish.skippedWhenDisabled", async () => {
      const existing = await getCompany(companyA.id);
      if (!existing) return { ok: false, detail: "company missing" };
      await updateCompany(companyA.id, {
        profile: {
          ...existing.profile,
          autoPublishOnClientApprove: false,
        } as typeof existing.profile & { autoPublishOnClientApprove: false },
      });
      const content = await createContent({
        companyId: companyA.id,
        type: "social_post",
        title: "No auto publish",
        body: APPROVAL_BODY,
        status: "approved",
        createdById: adminUser.id,
      });
      const co = await getCompany(companyA.id);
      if (!co) return { ok: false, detail: "company missing" };
      const outcome = await autoPublishOnApprove({
        content,
        company: co,
        userId: portalUser.id,
        actorEmail: portalUser.email,
        tenantId: tenant.id,
      });
      return { ok: outcome === "skipped", detail: outcome };
    });

    await expect("portal.rbac.canAccessCompany_scoped", async () => {
      const allowed = await canAccessCompany(portalActor, companyA.id);
      const denied = await canAccessCompany(portalActor, companyB.id);
      return {
        ok: allowed && !denied,
        detail: `A=${allowed} B=${denied}`,
      };
    });

    await expect("portal.fieldSales.canAccessFieldSales", async () => {
      const ok =
        canAccessFieldSales(salesActor) &&
        canAccessFieldSales(adminActor) &&
        !canAccessFieldSales(portalActor) &&
        isSalesRep(salesActor) &&
        !isSalesRep(portalActor);
      return {
        ok,
        detail: `sales=${canAccessFieldSales(salesActor)} admin=${canAccessFieldSales(adminActor)} portal=${canAccessFieldSales(portalActor)}`,
      };
    });
  } finally {
    if (tenantId) {
      try {
        await purgeTenant(tenantId);
      } catch (e) {
        purgeFailed.push(`${tenantId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const failed = checks.filter((c) => !c.ok).length;
  return {
    ok: failed === 0 && purgeFailed.length === 0,
    passed: checks.length - failed,
    failed,
    purgeFailed,
    durationMs: Date.now() - startedAt,
    checks,
  };
}
