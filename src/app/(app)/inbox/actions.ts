"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createSocial,
  createSocialMention,
  getCompany,
  getSecuritySettings,
  getSocialMention,
  listResponses,
  logAiRun,
  updateSocialMention,
} from "@/lib/db";
import { accessibleCompanyIds, assertCompanyAccess, requireUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { classify, draftSocialResponse } from "@/lib/ai/social";
import { checkCompliance } from "@/lib/ai/compliance";
import { assertAiBudget } from "@/lib/ai/budget";
import { assertAiRateLimit } from "@/lib/ratelimit";
import { fetchNewMentions } from "@/lib/social-connectors";

// Draft a governed reply to an ingested mention — SAME pipeline as the manual
// social composer (classify → grounded draft → compliance → escalation), then
// link the created reply back to the mention and mark it drafted.
export async function draftReplyFromMentionAction(formData: FormData) {
  const mentionId = String(formData.get("mentionId") || "");
  const mention = await getSocialMention(mentionId);
  if (!mention) throw new Error("Mention not found");
  const user = await assertCompanyAccess(mention.companyId);
  if (mention.status !== "new") throw new Error("This mention has already been handled.");
  const company = (await getCompany(mention.companyId))!;
  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);

  const cls = classify(mention.text);
  const library = await listResponses(user.tenantId, mention.companyId);
  const { response, model, libraryRef } = await draftSocialResponse(
    company,
    mention.text,
    cls,
    library,
  );
  const replyCheck = await checkCompliance(response, company);
  const escalate =
    cls.escalationRequired ||
    !replyCheck.canProceed ||
    (await getSecuritySettings(company.tenantId)).crisisMode;

  const draft = await createSocial({
    companyId: mention.companyId,
    platform: mention.platform,
    originalComment: mention.text,
    sentiment: cls.sentiment,
    intent: cls.intent,
    riskLevel: cls.riskLevel,
    escalationRequired: escalate,
    draftResponse: response,
    status: escalate ? "escalated" : "pending_approval",
    createdById: user.id,
    libraryRef,
  });
  await updateSocialMention(mentionId, { status: "drafted", linkedDraftId: draft.id });

  await logAiRun({
    tenantId: company.tenantId,
    companyId: mention.companyId,
    userId: user.id,
    kind: "social_response",
    model,
    promptSummary: mention.text.slice(0, 120),
    outputChars: response.length,
    sourcesUsed: libraryRef ? [`Approved response: ${libraryRef}`] : [],
    estCostUsd: model.startsWith("claude")
      ? Number(((response.length / 4 / 1e6) * 15).toFixed(4))
      : 0,
  });
  await logAction(user, "social.mention_drafted", {
    targetType: "social",
    targetId: draft.id,
    companyId: mention.companyId,
    detail: `From ${mention.platform} mention · ${cls.intent} · ${cls.riskLevel}`,
  });
  revalidatePath("/inbox");
  redirect("/social");
}

export async function dismissMentionAction(formData: FormData) {
  const mentionId = String(formData.get("mentionId") || "");
  const mention = await getSocialMention(mentionId);
  if (!mention) throw new Error("Mention not found");
  const user = await assertCompanyAccess(mention.companyId);
  await updateSocialMention(mentionId, { status: "dismissed" });
  await logAction(user, "social.mention_dismissed", {
    targetType: "social",
    targetId: mentionId,
    companyId: mention.companyId,
    detail: mention.authorName,
  });
  revalidatePath("/inbox");
}

// Pull new mentions from connected platforms (live only; a no-op in demo). Only
// mentions for companies THIS admin can access are ingested.
export async function checkForMentionsAction() {
  const user = await requireUser();
  const allowed = new Set(await accessibleCompanyIds(user));
  const fetched = (await fetchNewMentions(user.tenantId)).filter((m) =>
    allowed.has(m.companyId), // never ingest outside the actor's scope
  );
  for (const m of fetched) {
    await createSocialMention({ ...m, status: "new" }); // dedups on externalId
  }
  await logAction(user, "social.inbox_checked", {
    detail: fetched.length
      ? `Pulled ${fetched.length} mention(s)`
      : "No new mentions (live pull not configured)",
  });
  revalidatePath("/inbox");
}
