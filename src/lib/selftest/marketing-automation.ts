import {
  addMembership,
  createCompany,
  createCrmContact,
  createMarketingWorkflow,
  createTenant,
  createUser,
  listWorkflowDispatchLogs,
  purgeTenant,
} from "@/lib/db";
import {
  buildAgencyTemplateSequence,
  contactHasMarketingConsent,
  deployAgencyTemplate,
  frequencyCapExceeded,
  isWithinWorkflowQuietHours,
  quietHoursActive,
  runWorkflowForContact,
  WORKFLOW_TEMPLATE_KINDS,
  WORKFLOW_TRIGGERS,
} from "@/lib/marketing-automation";
import { workflowConfigured, workflowLive } from "@/lib/marketing-automation-connectors";
import type { CrmContact, MarketingWorkflowSettings } from "@/lib/types";

function stubContact(overrides: Partial<CrmContact> = {}): CrmContact {
  const t = new Date().toISOString();
  return {
    id: "ct_stub",
    companyId: "co_stub",
    firstName: "Sam",
    email: "sam@example.com",
    tags: [],
    consentStatus: "subscribed",
    source: "manual",
    createdById: "u_stub",
    createdAt: t,
    updatedAt: t,
    ...overrides,
  };
}

function stubSettings(): MarketingWorkflowSettings {
  return {
    companyId: "co_stub",
    quietHoursStart: "20:00",
    quietHoursEnd: "08:00",
    frequencyCapPerWeek: 3,
    updatedAt: new Date().toISOString(),
  };
}

export function checkWorkflowSimulatedWhenLiveOff() {
  return { ok: !workflowLive() && !workflowConfigured(), detail: `WORKFLOW_LIVE=${workflowLive()}` };
}

export function checkWorkflowTriggerLibrary() {
  const kinds = new Set(WORKFLOW_TRIGGERS.map((t) => t.kind));
  return {
    ok: WORKFLOW_TRIGGERS.length >= 6 && kinds.has("customer_created") && kinds.has("manual"),
    detail: `triggers=${WORKFLOW_TRIGGERS.length}`,
  };
}

export function checkWorkflowQuietHours() {
  return {
    ok:
      isWithinWorkflowQuietHours("21:00", "20:00", "08:00") &&
      !isWithinWorkflowQuietHours("12:00", "20:00", "08:00") &&
      !quietHoursActive(stubSettings(), "2026-07-09T02:00:00.000Z", "Australia/Sydney"),
    detail: "ok",
  };
}

export async function checkWorkflowFrequencyCap() {
  let tenantId: string | undefined;
  try {
    const tenant = await createTenant({ name: "WF Cap", kind: "agency", plan: "starter", status: "active" });
    tenantId = tenant.id;
    const admin = await createUser({ email: `wfcap+${Date.now()}@selftest.dev`, name: "Cap", role: "admin" });
    await addMembership({ tenantId: tenant.id, userId: admin.id, role: "admin" });
    const company = await createCompany({ tenantId: tenant.id, name: "Cap Co", createdBy: admin.id });
    const contact = await createCrmContact({
      companyId: company.id,
      firstName: "Cap",
      email: `cap+${Date.now()}@selftest.dev`,
      tags: [],
      consentStatus: "subscribed",
      source: "manual",
      createdById: admin.id,
    });
    const ok = !(await frequencyCapExceeded(
      tenant.id,
      company.id,
      contact.id,
      { ...stubSettings(), companyId: company.id, frequencyCapPerWeek: 1 },
      "2026-07-09T12:00:00.000Z",
    ));
    return { ok, detail: "ok" };
  } finally {
    if (tenantId) await purgeTenant(tenantId);
  }
}

export function checkWorkflowConsentBlocks() {
  return {
    ok: contactHasMarketingConsent(stubContact()) && !contactHasMarketingConsent(stubContact({ consentStatus: "unsubscribed" })),
    detail: "ok",
  };
}

export function checkWorkflowTemplateSequences() {
  return {
    ok: WORKFLOW_TEMPLATE_KINDS.every((k) => buildAgencyTemplateSequence(k).steps.some((s) => s.kind === "action")),
    detail: "ok",
  };
}

export async function checkWorkflowDeployAgencyTemplate() {
  let tenantId: string | undefined;
  try {
    const tenant = await createTenant({ name: "WF Deploy", kind: "agency", plan: "agency", status: "active" });
    tenantId = tenant.id;
    const admin = await createUser({ email: `wfdep+${Date.now()}@selftest.dev`, name: "Dep", role: "admin" });
    await addMembership({ tenantId: tenant.id, userId: admin.id, role: "admin" });
    const company = await createCompany({ tenantId: tenant.id, name: "Deploy Co", createdBy: admin.id });
    const tpl = buildAgencyTemplateSequence("welcome");
    const agency = await createMarketingWorkflow({
      tenantId: tenant.id,
      companyId: null,
      name: tpl.name,
      description: tpl.description,
      triggerKind: tpl.triggerKind,
      templateKind: "welcome",
      status: "active",
      steps: tpl.steps,
      isAgencyTemplate: true,
      createdById: admin.id,
    });
    const deployed = await deployAgencyTemplate({
      tenantId: tenant.id,
      companyId: company.id,
      template: agency,
      createdById: admin.id,
    });
    return { ok: !deployed.isAgencyTemplate && deployed.deployedFromTemplateId === agency.id, detail: deployed.id };
  } finally {
    if (tenantId) await purgeTenant(tenantId);
  }
}

export async function checkWorkflowRunSimulated() {
  let tenantId: string | undefined;
  try {
    const tenant = await createTenant({ name: "WF Run", kind: "agency", plan: "starter", status: "active" });
    tenantId = tenant.id;
    const admin = await createUser({ email: `wfrun+${Date.now()}@selftest.dev`, name: "Run", role: "admin" });
    await addMembership({ tenantId: tenant.id, userId: admin.id, role: "admin" });
    const company = await createCompany({ tenantId: tenant.id, name: "Run Co", createdBy: admin.id });
    const contact = await createCrmContact({
      companyId: company.id,
      firstName: "Runner",
      email: `runner+${Date.now()}@selftest.dev`,
      tags: [],
      consentStatus: "subscribed",
      source: "manual",
      createdById: admin.id,
    });
    const seq = buildAgencyTemplateSequence("review_request");
    const workflow = await createMarketingWorkflow({
      tenantId: tenant.id,
      companyId: company.id,
      name: seq.name,
      triggerKind: seq.triggerKind,
      templateKind: "review_request",
      status: "active",
      steps: seq.steps,
      isAgencyTemplate: false,
      createdById: admin.id,
    });
    const result = await runWorkflowForContact({
      workflow,
      contactId: contact.id,
      tenantId: tenant.id,
      companyName: company.name,
      skipQuietHours: true,
      skipFrequencyCap: true,
    });
    const logs = await listWorkflowDispatchLogs(tenant.id, company.id);
    return {
      ok: !workflowLive() && result.stats.simulated >= 1 && logs.some((l) => l.status === "simulated"),
      detail: `sim=${result.stats.simulated}`,
    };
  } finally {
    if (tenantId) await purgeTenant(tenantId);
  }
}
