// Shared content governance re-run (compliance + claims audit + grounding +
// routing). Extracted so BOTH the internal approval action and the tokenised
// client-approval route run the IDENTICAL pipeline — the client link is never a
// governance bypass, it is the same gate reached without a login.

import { getCompany, getRequest } from "@/lib/db";
import { auditClaims, checkCompliance } from "@/lib/ai/compliance";
import { routeContent } from "@/lib/routing";
import type { ContentItem } from "@/lib/types";

export async function governContent(content: ContentItem, body: string) {
  const company = (await getCompany(content.companyId))!;
  const consent = content.requestId
    ? ((await getRequest(content.requestId))?.consent ?? null)
    : null;
  const compliance = await checkCompliance(body, company, { consent });
  const claimAudit = await auditClaims(body, company);
  const routedTo = routeContent({
    type: content.type,
    compliance,
    claimAudit,
    consent,
  });
  const groundingLabel: ContentItem["groundingLabel"] = claimAudit.some(
    (a) => a.status === "unsupported",
  )
    ? "requires_evidence"
    : content.sourceRefs && content.sourceRefs.length > 0
      ? "grounded"
      : "suggested_by_ai";
  return { compliance, claimAudit, routedTo, groundingLabel };
}
