"use server";

import { revalidatePath } from "next/cache";
import { assertCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import {
  createHypothesis,
  recordExperimentOutcome,
  recordManualLesson,
} from "@/lib/learning";
import type { LearningExperimentOutcome, RecommendationType } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

export async function createHypothesisAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  const title = text(formData, "title");
  const statement = text(formData, "statement");
  if (!title || !statement) throw new Error("Title and statement are required.");
  const metric = text(formData, "metric") || undefined;
  const sourceType = text(formData, "sourceRecommendationType") as RecommendationType | "";
  const hyp = await createHypothesis({
    tenantId: user.tenantId,
    companyId,
    title,
    statement,
    metric,
    sourceRecommendationType: sourceType || undefined,
    createdById: user.id,
  });
  await logAction(user, "learning.hypothesis_created", {
    targetType: "learning_hypothesis",
    targetId: hyp.id,
    companyId,
    detail: title,
  });
  revalidatePath("/learning");
}

export async function recordOutcomeAction(formData: FormData) {
  await requireAdmin();
  const hypothesisId = text(formData, "hypothesisId");
  const outcome = text(formData, "outcome") as LearningExperimentOutcome;
  const notes = text(formData, "notes") || undefined;
  if (!hypothesisId || !outcome) throw new Error("Hypothesis and outcome are required.");
  const updated = await recordExperimentOutcome({ hypothesisId, outcome, notes });
  if (!updated) throw new Error("Hypothesis not found.");
  const user = await assertCompanyAccess(updated.companyId);
  await logAction(user, "learning.outcome_recorded", {
    targetType: "learning_hypothesis",
    targetId: hypothesisId,
    companyId: updated.companyId,
    detail: `${outcome}${notes ? ` — ${notes.slice(0, 60)}` : ""}`,
  });
  revalidatePath("/learning");
}

export async function recordManualLessonAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertCompanyAccess(companyId);
  const title = text(formData, "title");
  const lesson = text(formData, "lesson");
  if (!title || !lesson) throw new Error("Title and lesson are required.");
  const hypothesisId = text(formData, "hypothesisId") || undefined;
  const row = await recordManualLesson({
    tenantId: user.tenantId,
    companyId,
    title,
    lesson,
    createdById: user.id,
    hypothesisId,
  });
  await logAction(user, "learning.lesson_recorded", {
    targetType: "learning_lesson",
    targetId: row.id,
    companyId,
    detail: title,
  });
  revalidatePath("/learning");
}
