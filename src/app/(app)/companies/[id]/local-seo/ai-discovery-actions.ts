"use server";

import { revalidatePath } from "next/cache";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { getCompany, updateCompany } from "@/lib/db";
import {
  buildAiDiscoveryPrompts,
  computeMentionRate,
  parseScorecardForm,
} from "@/lib/ai-discovery";
import type { AiDiscoveryDirectoryFlags, AiDiscoveryScorecard } from "@/lib/types";

function newId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveAiDiscoveryDirectoriesAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "").trim();
  if (!companyId) throw new Error("Missing company");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  const directories: AiDiscoveryDirectoryFlags = {
    bingPlacesClaimed: formData.get("bingPlacesClaimed") === "on",
    yelpListed: formData.get("yelpListed") === "on",
    yelpUrl: String(formData.get("yelpUrl") || "").trim() || undefined,
    notes: String(formData.get("directoryNotes") || "").trim() || undefined,
  };

  const prev = company.profile.aiDiscovery ?? {};
  await updateCompany(companyId, {
    profile: {
      ...company.profile,
      aiDiscovery: { ...prev, directories },
    },
  });

  await logAction(user, "ai_discovery.directories_saved", {
    companyId,
    detail: `bing=${directories.bingPlacesClaimed} yelp=${directories.yelpListed}`,
  });

  revalidatePath(`/companies/${companyId}/local-seo`);
}

export async function saveAiDiscoveryScorecardAction(formData: FormData) {
  const companyId = String(formData.get("companyId") || "").trim();
  if (!companyId) throw new Error("Missing company");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found");

  const prompts = buildAiDiscoveryPrompts(company);
  const rows = parseScorecardForm(formData, prompts);
  const { mentionRate, completedCount } = computeMentionRate(rows);

  const card: AiDiscoveryScorecard = {
    id: newId("aidsc"),
    ranAt: new Date().toISOString(),
    ranById: user.id,
    rows,
    mentionRate,
    completedCount,
  };

  const prev = company.profile.aiDiscovery ?? {};
  const scorecards = [card, ...(prev.scorecards ?? [])].slice(0, 12);

  await updateCompany(companyId, {
    profile: {
      ...company.profile,
      aiDiscovery: { ...prev, scorecards },
    },
  });

  await logAction(user, "ai_discovery.scorecard_saved", {
    companyId,
    targetType: "company",
    targetId: companyId,
    detail:
      mentionRate === null
        ? `scorecard ${card.id} · no completed prompts`
        : `scorecard ${card.id} · mention rate ${Math.round(mentionRate * 100)}% (${completedCount})`,
  });

  revalidatePath(`/companies/${companyId}/local-seo`);
}
