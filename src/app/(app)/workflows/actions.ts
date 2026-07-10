"use server";

import { revalidatePath } from "next/cache";
import {
  createMarketingWorkflow,
  getCompany,
  getMarketingWorkflow,
  getMarketingWorkflowSettings,
  getTenant,
  updateMarketingWorkflow,
  upsertMarketingWorkflowSettings,
} from "@/lib/db";
import { assertAdminCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import {
  buildAgencyTemplateSequence,
  defaultMarketingWorkflowSettings,
  deployAgencyTemplate,
  runWorkflowForContact,
} from "@/lib/marketing-automation";
import type { WorkflowStatus, WorkflowTemplateKind } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function num(fd: FormData, key: string, fallback: number): number {
  const n = Number(fd.get(key));
  return Number.isFinite(n) ? n : fallback;
}

function refresh() {
  revalidatePath("/workflows");
}

export async function saveWorkflowSettingsAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const existing = (await getMarketingWorkflowSettings(companyId)) ?? defaultMarketingWorkflowSettings(companyId);
  await upsertMarketingWorkflowSettings({
    companyId,
    quietHoursStart: text(formData, "quietHoursStart") || existing.quietHoursStart,
    quietHoursEnd: text(formData, "quietHoursEnd") || existing.quietHoursEnd,
    frequencyCapPerWeek: num(formData, "frequencyCapPerWeek", existing.frequencyCapPerWeek),
    updatedById: user.id,
    updatedAt: new Date().toISOString(),
  });
  await logAction(user, "workflow.settings.updated", { targetType: "company", targetId: companyId });
  refresh();
}

export async function createAgencyTemplateAction(formData: FormData) {
  const user = await requireAdmin();
  const kind = text(formData, "templateKind") as WorkflowTemplateKind;
  const tpl = buildAgencyTemplateSequence(kind);
  await createMarketingWorkflow({
    tenantId: user.tenantId,
    companyId: null,
    name: tpl.name,
    description: tpl.description,
    triggerKind: tpl.triggerKind,
    templateKind: kind,
    status: "active",
    steps: tpl.steps,
    isAgencyTemplate: true,
    deployedFromTemplateId: null,
    createdById: user.id,
  });
  await logAction(user, "workflow.agency_template.created", { detail: kind });
  refresh();
}

export async function deployAgencyTemplateAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const templateId = text(formData, "templateId");
  const user = await assertAdminCompanyAccess(companyId);
  const template = await getMarketingWorkflow(templateId);
  if (!template || !template.isAgencyTemplate || template.tenantId !== user.tenantId) {
    throw new Error("Agency template not found.");
  }
  const deployed = await deployAgencyTemplate({
    tenantId: user.tenantId,
    companyId,
    template,
    createdById: user.id,
  });
  await logAction(user, "workflow.template.deployed", {
    targetType: "marketing_workflow",
    targetId: deployed.id,
    detail: templateId,
  });
  refresh();
}

export async function updateWorkflowStatusAction(formData: FormData) {
  const workflowId = text(formData, "workflowId");
  const workflow = await getMarketingWorkflow(workflowId);
  if (!workflow) throw new Error("Workflow not found.");
  if (workflow.companyId) await assertAdminCompanyAccess(workflow.companyId);
  else await requireAdmin();
  const status = text(formData, "status") as WorkflowStatus;
  await updateMarketingWorkflow(workflowId, { status });
  refresh();
}

export async function runWorkflowAction(formData: FormData) {
  const workflowId = text(formData, "workflowId");
  const contactId = text(formData, "contactId");
  const workflow = await getMarketingWorkflow(workflowId);
  if (!workflow?.companyId) throw new Error("Workflow not found.");
  const user = await assertAdminCompanyAccess(workflow.companyId);
  const company = await getCompany(workflow.companyId);
  const tenant = await getTenant(user.tenantId);
  const result = await runWorkflowForContact({
    workflow,
    contactId,
    tenantId: user.tenantId,
    companyName: company?.name ?? "Company",
    timezone: tenant?.timezone,
    skipQuietHours: true,
    skipFrequencyCap: true,
  });
  await logAction(user, "workflow.manual_run", {
    targetType: "marketing_workflow",
    targetId: workflowId,
    detail: `dispatched=${result.stats.dispatched}`,
  });
  refresh();
}

export async function createCompanyWorkflowAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const kind = text(formData, "templateKind") as WorkflowTemplateKind;
  const tpl = buildAgencyTemplateSequence(kind);
  await createMarketingWorkflow({
    tenantId: user.tenantId,
    companyId,
    name: text(formData, "name") || tpl.name,
    description: tpl.description,
    triggerKind: tpl.triggerKind,
    templateKind: kind,
    status: "draft",
    steps: tpl.steps,
    isAgencyTemplate: false,
    deployedFromTemplateId: null,
    createdById: user.id,
  });
  await logAction(user, "workflow.created", { targetType: "company", targetId: companyId, detail: kind });
  refresh();
}
