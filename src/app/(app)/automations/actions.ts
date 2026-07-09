"use server";

import { revalidatePath } from "next/cache";
import { getAutomationSettings, updateAutomationSettings } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/rbac";
import { assertPlanIncludesAutomations } from "@/lib/billing";
import { logAction } from "@/lib/audit";
import { runAutomations } from "@/lib/automation";

function bool(fd: FormData, key: string): boolean {
  return fd.get(key) === "on";
}

export async function saveAutomationSettingsAction(formData: FormData) {
  const user = await requireAdmin();
  // T4: enabling automation requires a plan that includes it. Saving other
  // settings while disabled is fine; turning it ON is the gated step.
  if (bool(formData, "enabled")) {
    await assertPlanIncludesAutomations(user.tenantId);
  }
  const current = await getAutomationSettings(user.tenantId);
  const wasLowRisk = current.lowRiskAutoResponses;
  const nowLowRisk = bool(formData, "lowRiskAutoResponses");

  await updateAutomationSettings(user.tenantId, {
    enabled: bool(formData, "enabled"),
    draftCampaignSuggestions: bool(formData, "draftCampaignSuggestions"),
    monthlyContentGeneration: bool(formData, "monthlyContentGeneration"),
    analyticsSummaries: bool(formData, "analyticsSummaries"),
    contentAlerts: bool(formData, "contentAlerts"),
    lowRiskAutoResponses: nowLowRisk,
    maxCampaignsPerRun: Math.max(0, Math.min(20, Number(formData.get("maxCampaignsPerRun")) || 0)),
    maxDraftsPerCompany: Math.max(0, Math.min(20, Number(formData.get("maxDraftsPerCompany")) || 0)),
    updatedById: user.id,
  });
  await logAction(user, "automation.settings_saved", {
    detail:
      wasLowRisk !== nowLowRisk
        ? `Low-risk auto-responses ${nowLowRisk ? "ENABLED" : "disabled"}`
        : "Automation settings updated",
  });
  revalidatePath("/automations");
}

// "Run automations now" — the cron drop-in exposed as a button. Spawns drafts /
// recommendations / summaries but never publishes.
export async function runAutomationsNowAction() {
  const user = await requireAdmin();
  await runAutomations(user, { trigger: "manual" });
  revalidatePath("/automations");
  revalidatePath("/recommendations");
  revalidatePath("/campaigns");
  revalidatePath("/content");
}
