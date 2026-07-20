"use server";

import { revalidatePath } from "next/cache";
import { requirePortalUser } from "@/lib/auth/rbac";
import {
  listManagedApprovalRequests,
  respondManagedApprovalAsClient,
} from "@/lib/db";
import { logAction } from "@/lib/audit";

function text(formData: FormData, key: string): string {
  return String(formData.get(key) || "").trim();
}

async function portalRequest(requestId: string) {
  const { user, companyId } = await requirePortalUser();
  const request = (await listManagedApprovalRequests(user.tenantId, companyId)).find(
    (row) => row.id === requestId,
  );
  if (
    !request ||
    request.status !== "pending" ||
    request.recipientEmail.toLowerCase() !== user.email.toLowerCase()
  ) {
    throw new Error("This approval is no longer available.");
  }
  return { user, request };
}

export async function approveManagedPortalAction(formData: FormData) {
  const { user, request } = await portalRequest(text(formData, "requestId"));
  const disclosureAccepted =
    formData.get("directPlatformChargeAccepted") === "on";
  if (request.scope === "paid_budget_targeting" && !disclosureAccepted) {
    throw new Error("Accept the direct platform charge disclosure to approve.");
  }
  if (
    !(await respondManagedApprovalAsClient(
      request.id,
      "approved",
      disclosureAccepted,
    ))
  ) {
    throw new Error("This approval is no longer available.");
  }
  await logAction(user, "managed_approval.approved", {
    targetType: "managed_approval_request",
    targetId: request.id,
    companyId: request.companyId,
    detail: `${request.scope} · client portal`,
  });
  revalidatePath("/client/approvals");
}

export async function requestManagedChangesPortalAction(formData: FormData) {
  const { user, request } = await portalRequest(text(formData, "requestId"));
  const note = text(formData, "note");
  if (note.length < 3) throw new Error("Tell us what should change.");
  if (!(await respondManagedApprovalAsClient(request.id, "changes_requested"))) {
    throw new Error("This approval is no longer available.");
  }
  await logAction(user, "managed_approval.changes_requested", {
    targetType: "managed_approval_request",
    targetId: request.id,
    companyId: request.companyId,
    detail: `${request.scope} · ${note.slice(0, 500)}`,
  });
  revalidatePath("/client/approvals");
}
