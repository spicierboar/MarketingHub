"use server";

import { revalidatePath } from "next/cache";
import {
  createAiPromptVersion,
  getAiPromptVersion,
  listAiPromptVersions,
  updateAiPromptVersion,
} from "@/lib/db";
import { requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { getBuiltinPrompt } from "@/lib/ai/prompt-registry";

function refresh() {
  revalidatePath("/ai-prompts");
}

export async function createPromptVersionAction(formData: FormData) {
  const admin = await requireAdmin();
  const promptKey = String(formData.get("promptKey") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const purpose = String(formData.get("purpose") || "").trim();
  const promptText = String(formData.get("promptText") || "").trim();
  const modelProvider = String(formData.get("modelProvider") || "anthropic").trim() || "anthropic";
  const modelName = String(formData.get("modelName") || "").trim() || undefined;
  const tempRaw = String(formData.get("temperature") || "").trim();
  const temperature = tempRaw === "" ? undefined : Number(tempRaw);
  const activate = formData.get("activate") === "on";

  if (!promptKey || !name || !purpose || !promptText) {
    throw new Error("promptKey, name, purpose, and promptText are required");
  }

  const existing = await listAiPromptVersions(admin.tenantId, promptKey);
  const tenantRows = existing.filter((r) => r.tenantId === admin.tenantId);
  const nextVersion =
    tenantRows.length === 0 ? 1 : Math.max(...tenantRows.map((r) => r.version)) + 1;

  const builtin = getBuiltinPrompt(promptKey);
  const row = await createAiPromptVersion({
    tenantId: admin.tenantId,
    promptKey,
    name: name || builtin?.name || promptKey,
    purpose: purpose || builtin?.purpose || "",
    promptText,
    version: nextVersion,
    modelProvider,
    modelName: modelName ?? builtin?.modelName,
    temperature: Number.isFinite(temperature) ? temperature : builtin?.temperature,
    active: false,
    createdById: admin.id,
  });

  await logAction(admin, "ai_prompt.version_created", {
    targetType: "ai_prompt_version",
    targetId: row.id,
    detail: `${promptKey} v${row.version}`,
  });

  if (activate) {
    await activatePromptVersionInternal(admin, row.id);
  }

  refresh();
}

export async function activatePromptVersionAction(formData: FormData) {
  const admin = await requireAdmin();
  const versionId = String(formData.get("versionId") || "");
  if (!versionId) throw new Error("versionId required");
  await activatePromptVersionInternal(admin, versionId);
  refresh();
}

export async function deactivatePromptVersionAction(formData: FormData) {
  const admin = await requireAdmin();
  const versionId = String(formData.get("versionId") || "");
  if (!versionId) throw new Error("versionId required");

  const row = await getAiPromptVersion(versionId);
  if (!row) throw new Error("Prompt version not found");
  if (row.tenantId !== admin.tenantId) {
    throw new Error("Forbidden: prompt belongs to another organisation");
  }

  await updateAiPromptVersion(versionId, {
    active: false,
    retiredAt: new Date().toISOString(),
  });

  await logAction(admin, "ai_prompt.version_deactivated", {
    targetType: "ai_prompt_version",
    targetId: versionId,
    detail: `${row.promptKey} v${row.version}`,
  });
  refresh();
}

async function activatePromptVersionInternal(
  admin: Awaited<ReturnType<typeof requireAdmin>>,
  versionId: string,
) {
  const row = await getAiPromptVersion(versionId);
  if (!row) throw new Error("Prompt version not found");
  if (row.tenantId !== admin.tenantId) {
    throw new Error("Forbidden: prompt belongs to another organisation");
  }

  const siblings = (await listAiPromptVersions(admin.tenantId, row.promptKey)).filter(
    (r) => r.tenantId === admin.tenantId && r.id !== row.id && r.active,
  );
  const retiredAt = new Date().toISOString();
  for (const prev of siblings) {
    await updateAiPromptVersion(prev.id, { active: false, retiredAt });
  }

  await updateAiPromptVersion(versionId, {
    active: true,
    effectiveAt: retiredAt,
    retiredAt: null,
    approvedById: admin.id,
  });

  await logAction(admin, "ai_prompt.version_activated", {
    targetType: "ai_prompt_version",
    targetId: versionId,
    detail: `${row.promptKey} v${row.version} (retired ${siblings.length} prior)`,
  });
}
