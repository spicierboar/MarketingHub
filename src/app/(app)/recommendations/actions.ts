"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createRecommendation,
  createTask,
  getCompany,
  getRecommendation,
  getTask,
  listRecommendations,
  updateRecommendation,
  updateTask,
} from "@/lib/db";
import { assertCompanyAccess, requireUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { generateRankedForCompany, withDismissReason } from "@/lib/recommendations";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

// Generate fresh recommendations for a company, skipping any that duplicate an
// already-open recommendation (§44: company-specific, from analytics).
export async function generateRecommendationsAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");
  // Server-side AI-ready gate (mirrors drafting/campaign guards) — the UI
  // disables the button, but the action is the real boundary.
  if (company.status !== "ai_ready" && company.status !== "approved") {
    throw new Error("Recommendations require an AI-ready company.");
  }

  // Dedupe on type alone: each type is single-per-company, so a regenerate
  // never stacks a second open rec of the same kind (even if its title's
  // embedded count changed).
  const openTypes = new Set(
    (await listRecommendations(user.tenantId, [companyId], "open")).map((r) => r.type),
  );
  let created = 0;
  for (const draft of await generateRankedForCompany(company)) {
    if (openTypes.has(draft.type)) continue;
    const { score, ...rec } = draft;
    await createRecommendation({
      ...rec,
      action: { ...rec.action, _score: score },
      status: "open",
      createdById: user.id,
    });
    openTypes.add(draft.type);
    created += 1;
  }
  await logAction(user, "recommendations.generated", {
    companyId,
    detail: `${created} new recommendation(s)`,
  });
  revalidatePath("/recommendations");
}

export async function dismissRecommendationAction(formData: FormData) {
  const recId = text(formData, "recId");
  const dismissReason = text(formData, "dismissReason");
  const rec = await getRecommendation(recId);
  if (!rec) throw new Error("Recommendation not found");
  const user = await assertCompanyAccess(rec.companyId);
  await updateRecommendation(recId, {
    status: "dismissed",
    action: dismissReason ? withDismissReason(rec.action, dismissReason) : rec.action,
  });
  await logAction(user, "recommendation.dismissed", {
    targetType: "recommendation",
    targetId: recId,
    companyId: rec.companyId,
    detail: dismissReason ? `${rec.title} — ${dismissReason}` : rec.title,
  });
  revalidatePath("/recommendations");
}

// Turn a recommendation into a content request (prefilled builder).
export async function toRequestAction(formData: FormData) {
  const recId = text(formData, "recId");
  const rec = await getRecommendation(recId);
  if (!rec) throw new Error("Recommendation not found");
  const user = await assertCompanyAccess(rec.companyId);
  await updateRecommendation(recId, { status: "actioned", resultType: "request" });
  await logAction(user, "recommendation.to_request", {
    targetType: "recommendation",
    targetId: recId,
    companyId: rec.companyId,
    detail: rec.title,
  });
  const p = new URLSearchParams({
    company: rec.companyId,
    type: rec.action.requestType ?? "social_post",
    topic: rec.action.topic ?? rec.title,
    objective: rec.action.objective ?? rec.rationale,
    rec: recId,
  });
  redirect(`/requests/new?${p.toString()}`);
}

// Turn a recommendation into a campaign (prefilled builder).
export async function toCampaignAction(formData: FormData) {
  const recId = text(formData, "recId");
  const rec = await getRecommendation(recId);
  if (!rec) throw new Error("Recommendation not found");
  const user = await assertCompanyAccess(rec.companyId);
  await updateRecommendation(recId, { status: "actioned", resultType: "campaign" });
  await logAction(user, "recommendation.to_campaign", {
    targetType: "recommendation",
    targetId: recId,
    companyId: rec.companyId,
    detail: rec.title,
  });
  const p = new URLSearchParams({
    company: rec.companyId,
    objective: rec.action.objective ?? rec.title,
    ...(rec.action.audience ? { audience: rec.action.audience } : {}),
    ...(rec.action.serviceFocus ? { serviceFocus: rec.action.serviceFocus } : {}),
    rec: recId,
  });
  redirect(`/campaigns/new?${p.toString()}`);
}

// Turn a recommendation into a task.
export async function toTaskAction(formData: FormData) {
  const recId = text(formData, "recId");
  const rec = await getRecommendation(recId);
  if (!rec) throw new Error("Recommendation not found");
  const user = await assertCompanyAccess(rec.companyId);
  const task = await createTask({
    companyId: rec.companyId,
    title: rec.title,
    detail: rec.action.objective ?? rec.rationale,
    status: "open",
    sourceRecommendationId: recId,
    createdById: user.id,
  });
  await updateRecommendation(recId, {
    status: "actioned",
    resultType: "task",
    resultId: task.id,
  });
  await logAction(user, "recommendation.to_task", {
    targetType: "task",
    targetId: task.id,
    companyId: rec.companyId,
    detail: rec.title,
  });
  revalidatePath("/recommendations");
  revalidatePath("/tasks");
}

// Ad-hoc + completion for tasks.
export async function createTaskAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  const title = text(formData, "title");
  if (!title) throw new Error("Task title is required");
  await createTask({
    companyId,
    title,
    detail: text(formData, "detail") || undefined,
    status: "open",
    sourceRecommendationId: null,
    createdById: user.id,
  });
  await logAction(user, "task.created", { companyId, detail: title });
  revalidatePath("/tasks");
}

export async function toggleTaskAction(formData: FormData) {
  const taskId = text(formData, "taskId");
  const task = await getTask(taskId);
  if (!task) throw new Error("Task not found");
  const user = await assertCompanyAccess(task.companyId);
  const done = task.status !== "done";
  await updateTask(taskId, {
    status: done ? "done" : "open",
    doneAt: done ? new Date().toISOString() : null,
  });
  await logAction(user, done ? "task.completed" : "task.reopened", {
    targetType: "task",
    targetId: taskId,
    companyId: task.companyId,
    detail: task.title,
  });
  revalidatePath("/tasks");
}
