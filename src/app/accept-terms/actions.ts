"use server";

import { redirect } from "next/navigation";
import { pendingLegalDocs, recordTermsAcceptance } from "@/lib/db";
import { requireUserRaw } from "@/lib/auth/rbac";
import { clientIp } from "@/lib/ratelimit";
import { logAction } from "@/lib/audit";
import { legalDocLabel } from "@/lib/terms";

// Record the current user's acceptance of every PENDING legal doc (current
// Terms and/or Privacy), then send them into the app. Versions are read
// server-side via pendingLegalDocs() — never trusted from the form — so a user
// can only ever accept the live version of each kind.
export async function acceptTermsAction() {
  const user = await requireUserRaw();
  const pending = await pendingLegalDocs(user.id);
  const ip = await clientIp();
  for (const doc of pending) {
    await recordTermsAcceptance({
      userId: user.id,
      tenantId: user.tenantId,
      kind: doc.kind,
      version: doc.version,
      ip,
    });
    await logAction(user, doc.kind === "privacy" ? "privacy.accepted" : "terms.accepted", {
      detail: `Accepted ${legalDocLabel(doc.kind)} v${doc.version}`,
    });
  }
  redirect("/dashboard");
}
