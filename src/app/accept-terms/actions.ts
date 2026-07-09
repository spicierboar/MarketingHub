"use server";

import { redirect } from "next/navigation";
import { currentTerms, hasAcceptedTerms, recordTermsAcceptance } from "@/lib/db";
import { requireUserRaw } from "@/lib/auth/rbac";
import { clientIp } from "@/lib/ratelimit";
import { logAction } from "@/lib/audit";

// Record the current user's acceptance of the CURRENT terms version, then send
// them into the app. Version is read server-side from currentTerms() — never
// trusted from the form — so a user can only ever accept the live version.
export async function acceptTermsAction() {
  const user = await requireUserRaw();
  const terms = await currentTerms();
  if (!terms) redirect("/dashboard");
  if (!(await hasAcceptedTerms(user.id, terms.version))) {
    await recordTermsAcceptance({
      userId: user.id,
      tenantId: user.tenantId,
      version: terms.version,
      ip: await clientIp(),
    });
    await logAction(user, "terms.accepted", {
      detail: `Accepted Terms v${terms.version}`,
    });
  }
  redirect("/dashboard");
}
