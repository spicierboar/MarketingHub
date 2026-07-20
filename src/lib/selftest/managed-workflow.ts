import {
  createCompany,
  createManagedContentConcept,
  createTenant,
  createUser,
  addMembership,
  listManagedContentConcepts,
  purgeTenant,
} from "@/lib/db";
import { adsLive } from "@/lib/ad-connectors";
import { appEnv } from "@/lib/env";
import {
  consumedConceptUnits,
  dueApprovalReminders,
  finalContentDueAt,
  isInsideRollingHorizon,
  nextRevisionRoute,
  paidAuthorizationGate,
  standardConceptVisualGate,
} from "@/lib/managed-service/workflow";
import { publishingLive } from "@/lib/publishing-connectors";
import {
  lookupSimulatedPublish,
  publishIdempotencyKey,
  registerSimulatedPublish,
} from "@/lib/publish-queue";
import type {
  Asset,
  ManagedApprovalRequest,
  ManagedContentConcept,
  ManagedPaidAuthorization,
} from "@/lib/types";

type Check = { name: string; ok: boolean; detail?: string };

function concept(overrides: Partial<ManagedContentConcept> = {}): ManagedContentConcept {
  return {
    id: "concept_1",
    tenantId: "tenant_1",
    companyId: "company_1",
    packagePeriod: "2026-07",
    unitKey: "unit_1",
    title: "Concept",
    theme: "Theme",
    status: "planned",
    reusableAssetId: "asset_1",
    quotaConsumedAt: "2026-07-01T00:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function approval(overrides: Partial<ManagedApprovalRequest> = {}): ManagedApprovalRequest {
  return {
    id: "approval_1",
    tenantId: "tenant_1",
    companyId: "company_1",
    contentId: "content_1",
    scope: "standard_content",
    recipientEmail: "client@example.com",
    tokenHash: "hash",
    status: "pending",
    dueAt: "2026-07-20T00:00:00.000Z",
    revisionRound: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

export async function runManagedWorkflowSelfTest() {
  const started = Date.now();
  const checks: Check[] = [];
  const purgeFailed: string[] = [];

  const units = consumedConceptUnits([
    concept(),
    concept({ id: "concept_1" }),
    concept({ id: "concept_2", quotaConsumedAt: null }),
  ]);
  checks.push({
    name: "managedWorkflow.quotaCountsConceptOnce",
    ok: units === 1,
    detail: `units=${units}`,
  });

  const publishAt = "2026-08-01T10:00:00.000Z";
  const dueAt = finalContentDueAt(publishAt);
  checks.push({
    name: "managedWorkflow.rollingHorizonAndFinalDue",
    ok:
      dueAt === "2026-07-18T10:00:00.000Z" &&
      isInsideRollingHorizon(publishAt, "2026-07-18T10:00:00.000Z") &&
      !isInsideRollingHorizon(publishAt, "2026-06-01T00:00:00.000Z"),
    detail: `dueAt=${dueAt}`,
  });

  const reminders = dueApprovalReminders(
    approval(),
    "2026-07-19T00:00:00.000Z",
  );
  const third = nextRevisionRoute(approval({ revisionRound: 2 }));
  checks.push({
    name: "managedWorkflow.remindersAndRevisionLimit",
    ok:
      reminders.map((item) => item.kind).join(",") ===
        "client_7d,client_3d,staff_1d" &&
      third.route === "staff_exception",
    detail: `reminders=${reminders.length} route=${third.route}`,
  });

  const asset = {
    id: "asset_1",
    companyId: "company_1",
    name: "Reusable graphic",
    assetType: "graphic",
    source: "upload",
    tags: [],
    usageRights: {
      owner: "Client",
      licenceType: "owned",
      consentObtained: true,
      allowedChannels: [],
    },
    status: "approved",
    createdById: "user_1",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  } as Asset;
  const blockedRights = standardConceptVisualGate({
    concept: concept(),
    assets: [asset],
    adaptationCopies: ["Facebook copy", "Instagram copy"],
  });
  const clearedRights = standardConceptVisualGate({
    concept: concept(),
    assets: [
      {
        ...asset,
        rightsConfirmedAt: "2026-07-01T00:00:00.000Z",
        rightsConfirmationEmail: "client@example.com",
      },
    ],
    adaptationCopies: ["Facebook copy", "Instagram copy"],
  });
  checks.push({
    name: "managedWorkflow.visualAndRightsGate",
    ok: !blockedRights.ok && clearedRights.ok,
    detail: blockedRights.reason,
  });

  const authorization: ManagedPaidAuthorization = {
    id: "paid_1",
    tenantId: "tenant_1",
    companyId: "company_1",
    adCampaignId: "ad_1",
    monthKey: "2026-07",
    requestedBudgetAud: 600,
    clientMonthlyCapAud: 1000,
    creativeApprovalId: "creative",
    budgetTargetingApprovalId: "budget",
    disclosureAcceptedAt: "2026-07-01T00:00:00.000Z",
    status: "pending",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };
  const approved = (id: string) =>
    approval({ id, scope: id === "creative" ? "paid_creative" : "paid_budget_targeting", status: "approved" });
  const paidOk = paidAuthorizationGate({
    authorization,
    creativeApproval: approved("creative"),
    budgetTargetingApproval: approved("budget"),
    approvedMonthTotalAud: 300,
  });
  const capBlocked = paidAuthorizationGate({
    authorization,
    creativeApproval: approved("creative"),
    budgetTargetingApproval: approved("budget"),
    approvedMonthTotalAud: 500,
  });
  checks.push({
    name: "managedWorkflow.paidDualApprovalAndCap",
    ok: paidOk.ok && !capBlocked.ok,
    detail: capBlocked.reason,
  });

  const tenants: string[] = [];
  try {
    const t1 = await createTenant({
      name: `Managed Workflow A ${Date.now()}`,
      kind: "agency",
      plan: "starter",
      status: "active",
      timezone: "Australia/Sydney",
    });
    const t2 = await createTenant({
      name: `Managed Workflow B ${Date.now()}`,
      kind: "agency",
      plan: "starter",
      status: "active",
      timezone: "Australia/Sydney",
    });
    tenants.push(t1.id, t2.id);
    const u1 = await createUser({
      email: `managed-workflow-a-${Date.now()}@example.dev`,
      name: "Workflow A",
      role: "admin",
    });
    const u2 = await createUser({
      email: `managed-workflow-b-${Date.now()}@example.dev`,
      name: "Workflow B",
      role: "admin",
    });
    await addMembership({ tenantId: t1.id, userId: u1.id, role: "owner" });
    await addMembership({ tenantId: t2.id, userId: u2.id, role: "owner" });
    const c1 = await createCompany({ tenantId: t1.id, name: "Concept A", createdBy: u1.id });
    const c2 = await createCompany({ tenantId: t2.id, name: "Concept B", createdBy: u2.id });
    await createManagedContentConcept({
      tenantId: t1.id,
      companyId: c1.id,
      packagePeriod: "2026-07",
      unitKey: "one",
      title: "A",
      theme: "A",
      status: "planned",
      quotaConsumedAt: new Date().toISOString(),
    });
    await createManagedContentConcept({
      tenantId: t2.id,
      companyId: c2.id,
      packagePeriod: "2026-07",
      unitKey: "two",
      title: "B",
      theme: "B",
      status: "planned",
      quotaConsumedAt: new Date().toISOString(),
    });
    const rows = await listManagedContentConcepts(t1.id);
    checks.push({
      name: "managedWorkflow.tenantIsolation",
      ok: rows.length === 1 && rows[0]?.companyId === c1.id,
      detail: `rows=${rows.length}`,
    });
  } finally {
    for (const tenantId of tenants) {
      try {
        await purgeTenant(tenantId);
      } catch {
        purgeFailed.push(tenantId);
      }
    }
  }

  const stagingSafe =
    appEnv() !== "staging" || (!publishingLive() && !adsLive());
  checks.push({
    name: "managedWorkflow.stagingConnectorsSimulated",
    ok: stagingSafe,
    detail: `env=${appEnv()} publishingLive=${publishingLive()} adsLive=${adsLive()}`,
  });

  const key = publishIdempotencyKey("post_1", 1);
  registerSimulatedPublish(key, "simulated platform id");
  checks.push({
    name: "managedWorkflow.publishIdempotency",
    ok:
      publishIdempotencyKey("post_1", 1) === key &&
      lookupSimulatedPublish(key) === "simulated platform id",
  });

  const failed = checks.filter((check) => !check.ok).length;
  return {
    ok: failed === 0 && purgeFailed.length === 0,
    passed: checks.length - failed,
    failed,
    purgeFailed,
    durationMs: Date.now() - started,
    checks,
  };
}
