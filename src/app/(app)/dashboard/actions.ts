"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createPromptTemplate, getPromptTemplate } from "@/lib/db";
import { assertCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { agencyTemplateInput, templateToRequestParams } from "@/lib/agency-ops";
import type { RequestType } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

export async function createAgencyTemplateAction(formData: FormData) {
  const user = await requireAdmin();
  const name = text(formData, "name");
  const topic = text(formData, "topic");
  const objective = text(formData, "objective");
  const contentType = text(formData, "contentType") as RequestType;
  if (!name || !topic || !objective) throw new Error("Name, topic, and objective are required");

  const template = await createPromptTemplate(
    agencyTemplateInput({
      tenantId: user.tenantId,
      createdById: user.id,
      name,
      contentType,
      topic,
      objective,
      audience: text(formData, "audience") || undefined,
      channel: text(formData, "channel") || undefined,
    }),
  );

  await logAction(user, "agency.template.created", {
    targetType: "prompt_template",
    targetId: template.id,
    detail: template.name,
  });
  revalidatePath("/dashboard");
}

export async function applyAgencyTemplateAction(formData: FormData) {
  const templateId = text(formData, "templateId");
  const companyId = text(formData, "companyId");
  const user = await requireAdmin();
  const template = await getPromptTemplate(templateId);
  if (!template || template.tenantId !== user.tenantId || template.companyId !== null) {
    throw new Error("Template not found");
  }
  await assertCompanyAccess(companyId);

  await logAction(user, "agency.template.applied", {
    targetType: "prompt_template",
    targetId: templateId,
    companyId,
    detail: template.name,
  });

  redirect(`/requests/new?${templateToRequestParams(template, companyId, templateId).toString()}`);
}
