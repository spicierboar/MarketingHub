"use server";

import { revalidatePath } from "next/cache";
import {
  getConversionFunnel,
  getFunnelAbExperiment,
  getFunnelLandingPage,
} from "@/lib/db";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import {
  activateAbExperiment,
  activateConversionFunnel,
  completeAbExperiment,
  createDefaultAbExperiment,
  createDefaultConversionFunnel,
  createDefaultJourney,
  createDefaultLandingPage,
  importFunnelAnalyticsExternal,
} from "@/lib/funnel";

export async function createJourneyAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Journey name required");
  const user = await assertAdminCompanyAccess(companyId);
  await createDefaultJourney({ companyId, name, createdById: user.id });
  await logAction(user, "funnel.journey_created", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail: name,
  });
  revalidatePath(`/funnel?company=${companyId}`);
}

export async function createConversionFunnelAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const journeyId = String(formData.get("journeyId") ?? "") || undefined;
  if (!name) throw new Error("Funnel name required");
  const user = await assertAdminCompanyAccess(companyId);
  await createDefaultConversionFunnel({
    companyId,
    name,
    journeyId: journeyId ?? null,
    createdById: user.id,
  });
  await logAction(user, "funnel.conversion_funnel_created", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail: name,
  });
  revalidatePath(`/funnel?company=${companyId}`);
}

export async function createLandingPageAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  const title = String(formData.get("title") ?? "").trim();
  const funnelId = String(formData.get("funnelId") ?? "") || undefined;
  if (!slug || !title) throw new Error("Slug and title required");
  const user = await assertAdminCompanyAccess(companyId);
  await createDefaultLandingPage({
    companyId,
    slug,
    title,
    funnelId: funnelId ?? null,
    createdById: user.id,
  });
  await logAction(user, "funnel.landing_page_created", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail: slug,
  });
  revalidatePath(`/funnel?company=${companyId}`);
}

export async function createAbExperimentAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const funnelId = String(formData.get("funnelId") ?? "") || undefined;
  const landingPageId = String(formData.get("landingPageId") ?? "") || undefined;
  if (!name) throw new Error("Experiment name required");
  const user = await assertAdminCompanyAccess(companyId);
  await createDefaultAbExperiment({
    companyId,
    name,
    funnelId: funnelId ?? null,
    landingPageId: landingPageId ?? null,
    createdById: user.id,
  });
  await logAction(user, "funnel.ab_experiment_created", {
    targetType: "company",
    targetId: companyId,
    companyId,
    detail: name,
  });
  revalidatePath(`/funnel?company=${companyId}`);
}

export async function importLandingAnalyticsAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const landingPageId = String(formData.get("landingPageId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  const page = await getFunnelLandingPage(landingPageId);
  if (!page || page.companyId !== companyId) throw new Error("Landing page not found");
  const result = await importFunnelAnalyticsExternal(user.tenantId, companyId, landingPageId);
  await logAction(user, "funnel.analytics_imported", {
    targetType: "funnel_landing_page",
    targetId: landingPageId,
    companyId,
    detail: `${result.mode}: ${result.detail}`,
  });
  revalidatePath(`/funnel?company=${companyId}`);
}

export async function activateFunnelAction(formData: FormData) {
  const funnelId = String(formData.get("funnelId") ?? "");
  const funnel = await getConversionFunnel(funnelId);
  if (!funnel) throw new Error("Funnel not found");
  const user = await assertAdminCompanyAccess(funnel.companyId);
  await activateConversionFunnel(funnel);
  await logAction(user, "funnel.activated", {
    targetType: "conversion_funnel",
    targetId: funnelId,
    companyId: funnel.companyId,
  });
  revalidatePath(`/funnel?company=${funnel.companyId}`);
}

export async function runAbExperimentAction(formData: FormData) {
  const experimentId = String(formData.get("experimentId") ?? "");
  const experiment = await getFunnelAbExperiment(experimentId);
  if (!experiment) throw new Error("Experiment not found");
  const user = await assertAdminCompanyAccess(experiment.companyId);
  await activateAbExperiment(experiment);
  await logAction(user, "funnel.ab_started", {
    targetType: "funnel_ab_experiment",
    targetId: experimentId,
    companyId: experiment.companyId,
  });
  revalidatePath(`/funnel?company=${experiment.companyId}`);
}

export async function completeAbExperimentAction(formData: FormData) {
  const experimentId = String(formData.get("experimentId") ?? "");
  const experiment = await getFunnelAbExperiment(experimentId);
  if (!experiment) throw new Error("Experiment not found");
  const user = await assertAdminCompanyAccess(experiment.companyId);
  const completed = await completeAbExperiment(experiment);
  await logAction(user, "funnel.ab_completed", {
    targetType: "funnel_ab_experiment",
    targetId: experimentId,
    companyId: experiment.companyId,
    detail: completed.winnerVariantId ?? undefined,
  });
  revalidatePath(`/funnel?company=${experiment.companyId}`);
}
