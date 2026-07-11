"use server";

import { revalidatePath } from "next/cache";
import {
  createPrivacyRequest,
  getCompany,
  getPrivacyRequest,
  updatePrivacyRequest,
} from "@/lib/db";
import { assertAdminCompanyAccess, requireAdmin } from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import type { PrivacyRequestStatus, PrivacyRequestType } from "@/lib/types";

const REQUEST_TYPES = new Set<PrivacyRequestType>([
  "access",
  "deletion",
  "rectification",
  "restriction",
  "portability",
]);

const STATUSES = new Set<PrivacyRequestStatus>([
  "pending",
  "in_progress",
  "completed",
  "rejected",
]);

function text(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function refresh() {
  revalidatePath("/privacy");
}

export async function createPrivacyRequestAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const subjectRef = text(formData, "subjectRef");
  const requestType = text(formData, "requestType") as PrivacyRequestType;
  if (!companyId || !subjectRef) throw new Error("Company and subject are required.");
  if (!REQUEST_TYPES.has(requestType)) throw new Error("Unknown request type.");
  const user = await assertAdminCompanyAccess(companyId);
  const company = await getCompany(companyId);
  if (!company) throw new Error("Company not found.");
  const dueDays = Number(text(formData, "dueDays") || "30");
  const dueAt = new Date(Date.now() + Math.max(1, dueDays) * 86400000).toISOString();
  const req = await createPrivacyRequest({
    tenantId: company.tenantId,
    companyId,
    subjectRef,
    requestType,
    status: "pending",
    lawfulBasis: text(formData, "lawfulBasis") || undefined,
    jurisdiction: text(formData, "jurisdiction") || "AU",
    dueAt,
    notes: text(formData, "notes") || undefined,
    createdBy: user.id,
  });
  await logAction(user, "privacy_request.created", {
    targetType: "privacy_request",
    targetId: req.id,
    companyId,
    detail: `${requestType} for ${subjectRef}`,
  });
  refresh();
}

export async function updatePrivacyRequestStatusAction(formData: FormData) {
  await requireAdmin();
  const requestId = text(formData, "requestId");
  const status = text(formData, "status") as PrivacyRequestStatus;
  if (!STATUSES.has(status)) throw new Error("Unknown status.");
  const existing = await getPrivacyRequest(requestId);
  if (!existing) throw new Error("Privacy request not found.");
  const user = await assertAdminCompanyAccess(existing.companyId);
  const patch: Parameters<typeof updatePrivacyRequest>[1] = {
    status,
    notes: text(formData, "notes") || existing.notes,
  };
  if (status === "completed" || status === "rejected") {
    patch.completedAt = new Date().toISOString();
  }
  await updatePrivacyRequest(requestId, patch);
  await logAction(user, "privacy_request.status_updated", {
    targetType: "privacy_request",
    targetId: requestId,
    companyId: existing.companyId,
    detail: status,
  });
  refresh();
}
