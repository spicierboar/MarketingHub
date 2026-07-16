"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  currentLegalDoc,
  publishTermsVersion,
} from "@/lib/db";
import { requireUser } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { assertAiBudget } from "@/lib/ai/budget";
import { formatLegalDocBody } from "@/lib/ai/legal-format";
import { recordAiUsage } from "@/lib/ai/metering";
import {
  broadcastLegalDocUpdate,
  canPublishLegalDocs,
  legalDocLabel,
} from "@/lib/terms";
import { resolveOrigin } from "@/lib/origin";
import { assertAiRateLimit } from "@/lib/ratelimit";
import type { LegalDocKind } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function parseKind(raw: string): LegalDocKind {
  return raw === "privacy" ? "privacy" : "terms";
}

/** Agency / platform-agency owners (and platform admins) may publish. */
async function requireLegalPublisher() {
  const user = await requireUser();
  if (!(await canPublishLegalDocs(user))) redirect("/settings/legal");
  return user;
}

/** Format pasted Terms/Privacy text for review in the editor (does not publish). */
export async function formatLegalDocAction(
  kind: LegalDocKind,
  body: string,
): Promise<{ text: string; model: string }> {
  const user = await requireLegalPublisher();
  const docKind: LegalDocKind = kind === "privacy" ? "privacy" : "terms";
  // Legal pastes are often longer than AI_USER_INPUT_MAX_CHARS — only strip nulls.
  const cleaned = body.replace(/\0/g, "").trim();
  if (!cleaned) throw new Error("Paste some document text to format.");
  if (cleaned.length > 80_000) {
    throw new Error("Document is too long to format in one pass (max ~80k characters).");
  }

  await assertAiBudget(user.tenantId);
  await assertAiRateLimit(user.tenantId);

  const result = await formatLegalDocBody(docKind, cleaned);
  await recordAiUsage({
    tenantId: user.tenantId,
    userId: user.id,
    kind: "legal_format",
    model: result.model,
    promptSummary: `Format ${legalDocLabel(docKind)}`.slice(0, 120),
    sourcesUsed: ["Settings · Legal paste"],
    outputChars: result.text.length,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    contextChars: cleaned.length,
  });
  await logAction(user, "legal.formatted", {
    detail: `${legalDocLabel(docKind)} · ${result.model} · ${result.text.length} chars`,
  });
  return { text: result.text, model: result.model };
}

export async function publishLegalDocAction(formData: FormData) {
  const user = await requireLegalPublisher();
  const kind = parseKind(text(formData, "kind"));
  const title = text(formData, "title");
  const body = text(formData, "body");
  const summary = text(formData, "summary");
  const effectiveDate = text(formData, "effectiveDate");
  if (!title || !body || !effectiveDate) {
    throw new Error("Title, body and effective date are required.");
  }
  const version = await publishTermsVersion({
    kind,
    title,
    body,
    summary: summary || undefined,
    effectiveDate,
    publishedById: user.id,
  });
  const label = legalDocLabel(kind);
  await logAction(user, kind === "privacy" ? "privacy.published" : "terms.published", {
    detail: `Published ${label} v${version.version} (effective ${effectiveDate})`,
  });
  const h = await headers();
  await broadcastLegalDocUpdate(user, version, resolveOrigin((k) => h.get(k)));
  revalidatePath("/settings/legal");
  revalidatePath("/platform-admin");
  revalidatePath("/accept-terms");
  revalidatePath("/terms");
  revalidatePath("/privacy-policy");
}

export async function resendLegalDocNotificationAction(formData: FormData) {
  const user = await requireLegalPublisher();
  const kind = parseKind(text(formData, "kind"));
  const version = await currentLegalDoc(kind);
  if (!version) throw new Error(`No active ${legalDocLabel(kind)} to notify about.`);
  const h = await headers();
  await broadcastLegalDocUpdate(user, version, resolveOrigin((k) => h.get(k)));
  revalidatePath("/settings/legal");
  revalidatePath("/platform-admin");
}
