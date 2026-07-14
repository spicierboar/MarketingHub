"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  currentLegalDoc,
  getTenant,
  publishTermsVersion,
} from "@/lib/db";
import {
  isPlatformAdmin,
  isTenantOwner,
  requireUser,
} from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import { broadcastLegalDocUpdate, legalDocLabel } from "@/lib/terms";
import { resolveOrigin } from "@/lib/origin";
import type { LegalDocKind } from "@/lib/types";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

function parseKind(raw: string): LegalDocKind {
  return raw === "privacy" ? "privacy" : "terms";
}

/** Agency owners (and platform admins) may publish platform legal docs. */
async function requireLegalPublisher() {
  const user = await requireUser();
  if (isPlatformAdmin(user)) return user;
  if (!isTenantOwner(user)) redirect("/settings");
  const tenant = await getTenant(user.tenantId);
  if (!tenant || tenant.kind !== "agency") redirect("/settings");
  return user;
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
