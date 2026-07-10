// W7 M55 — Continuous learning: hypotheses, experiment outcomes, lessons register.

import {
  createLearningHypothesis,
  createLearningLesson,
  getLearningHypothesis,
  listLearningHypotheses,
  listLearningLessons,
  updateLearningHypothesis,
} from "@/lib/db";
import { learningMode } from "@/lib/learning-connectors";
import type {
  LearningExperimentOutcome,
  LearningHypothesis,
  LearningHypothesisStatus,
  LearningLesson,
  RecommendationType,
} from "@/lib/types";

export { learningLive, learningMode } from "@/lib/learning-connectors";

export async function listLessonsForCompany(
  tenantId: string,
  companyId: string,
): Promise<LearningLesson[]> {
  return listLearningLessons(tenantId, [companyId]);
}

export async function listLessonsForTenant(tenantId: string): Promise<LearningLesson[]> {
  return listLearningLessons(tenantId);
}

export async function listHypothesesForCompany(
  tenantId: string,
  companyId: string,
): Promise<LearningHypothesis[]> {
  return listLearningHypotheses(tenantId, [companyId]);
}

export async function listHypothesesForTenant(tenantId: string): Promise<LearningHypothesis[]> {
  return listLearningHypotheses(tenantId);
}

export async function recordDismissLesson(args: {
  tenantId: string;
  companyId: string;
  recommendationType: RecommendationType;
  title: string;
  reason?: string;
  dismissedById: string;
}): Promise<LearningLesson> {
  const lessonText = [
    `Recommendation "${args.title}" (${args.recommendationType}) was dismissed`,
    args.reason ? `with reason: ${args.reason}` : "without a reason",
    learningMode() === "simulated" ? "(learning register — LEARNING_LIVE off)" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createLearningLesson({
    tenantId: args.tenantId,
    companyId: args.companyId,
    source: "recommendation_dismiss",
    title: `Dismissed: ${args.title}`,
    lesson: lessonText,
    recommendationType: args.recommendationType,
    dismissReason: args.reason,
    createdById: args.dismissedById,
  });
}

export async function createHypothesis(input: {
  tenantId: string;
  companyId: string;
  title: string;
  statement: string;
  metric?: string;
  sourceRecommendationType?: RecommendationType;
  createdById: string;
}): Promise<LearningHypothesis> {
  return createLearningHypothesis({
    ...input,
    status: "open",
    experimentOutcome: "pending",
  });
}

export async function recordExperimentOutcome(args: {
  hypothesisId: string;
  outcome: LearningExperimentOutcome;
  notes?: string;
  status?: LearningHypothesisStatus;
}): Promise<LearningHypothesis | undefined> {
  const hyp = await getLearningHypothesis(args.hypothesisId);
  if (!hyp) return undefined;

  const status: LearningHypothesisStatus =
    args.status ??
    (args.outcome === "positive"
      ? "validated"
      : args.outcome === "negative"
        ? "invalidated"
        : hyp.status);

  const updated = await updateLearningHypothesis(args.hypothesisId, {
    experimentOutcome: args.outcome,
    outcomeNotes: args.notes,
    status,
    resolvedAt: ["validated", "invalidated"].includes(status)
      ? new Date().toISOString()
      : hyp.resolvedAt,
  });

  if (updated && args.notes?.trim()) {
    await createLearningLesson({
      tenantId: hyp.tenantId,
      companyId: hyp.companyId,
      source: "experiment_outcome",
      title: `Outcome: ${hyp.title}`,
      lesson: `${args.outcome}: ${args.notes.trim()}`,
      hypothesisId: hyp.id,
      createdById: hyp.createdById,
    });
  }

  return updated;
}

export async function recordManualLesson(input: {
  tenantId: string;
  companyId: string;
  title: string;
  lesson: string;
  createdById: string;
  hypothesisId?: string;
}): Promise<LearningLesson> {
  return createLearningLesson({
    ...input,
    source: "manual",
  });
}
