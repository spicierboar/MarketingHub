import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCompany } from "@/lib/auth/rbac";
import { getCompany, getContent, getUser } from "@/lib/db";
import { listAudit, logAction } from "@/lib/audit";
import { ROUTE_LABEL } from "@/lib/routing";
import { formatDate, titleCase } from "@/lib/utils";

// Compliance report for a content item (Phase 3 go-live criterion:
// "compliance report is generated").

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const content = await getContent(id);
  if (!content || !(await canAccessCompany(user, content.companyId))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const company = (await getCompany(content.companyId))!;
  const c = content.compliance;
  const trail = (await listAudit(user.tenantId))
    .filter((e) => e.targetId === content.id)
    .reverse();
  const actorIds = [...new Set(trail.map((e) => e.actorId))];
  const actorsById = new Map(
    await Promise.all(
      actorIds.map(async (actorId) => [actorId, await getUser(actorId)] as const),
    ),
  );

  const lines: string[] = [
    "COMPLIANCE REPORT",
    "=================",
    "",
    `Content:      ${content.title}`,
    `Company:      ${company.name}`,
    `Type:         ${titleCase(content.type)}`,
    `Status:       ${titleCase(content.status)}`,
    `Grounding:    ${content.groundingLabel ? titleCase(content.groundingLabel) : "—"}`,
    `Routing:      ${ROUTE_LABEL[content.routedTo ?? "admin"]}`,
    `AI model:     ${content.aiModel ?? "—"}`,
    `Generated:    ${formatDate(content.createdAt)}`,
    `Report run:   ${formatDate(new Date().toISOString())} by ${user.email}`,
    "",
    "RISK ASSESSMENT",
    "---------------",
    `Risk level:        ${c ? titleCase(c.riskLevel) : "not checked"}`,
    `Can proceed:       ${c ? (c.canProceed ? "Yes" : "NO — critical issues") : "—"}`,
    `Evidence required: ${c ? (c.requiresEvidence ? "Yes" : "No") : "—"}`,
    "",
    "ISSUES",
    "------",
    ...(c && c.issues.length
      ? c.issues.map(
          (i) =>
            `[${i.severity.toUpperCase()}] ${i.message}${i.suggestion ? ` → ${i.suggestion}` : ""}`,
        )
      : ["None detected."]),
    "",
    "CLAIMS AUDIT (vs Claims Library / Evidence Locker)",
    "--------------------------------------------------",
    ...(content.claimAudit && content.claimAudit.length
      ? content.claimAudit.map(
          (a) =>
            `[${a.status.toUpperCase().replace(/_/g, " ")}] ${a.claim}${a.evidenceTitle ? ` (evidence: ${a.evidenceTitle})` : ""}`,
        )
      : ["No claims detected."]),
    "",
    "SOURCE REFERENCES",
    "-----------------",
    ...(content.sourceRefs && content.sourceRefs.length
      ? content.sourceRefs.map((r) => `- ${r.title}: "${r.snippet}"`)
      : content.sourcesUsed?.map((s) => `- ${s}`) ?? ["—"]),
    "",
    "AUDIT TRAIL",
    "-----------",
    ...(trail.length
      ? trail.map(
          (e) =>
            `${formatDate(e.createdAt)}  ${e.action}  by ${actorsById.get(e.actorId)?.name ?? e.actorEmail}${e.detail ? ` — ${e.detail}` : ""}`,
        )
      : ["No audit entries."]),
    "",
    "--- End of report ---",
  ];

  await logAction(user, "compliance.report_generated", {
    targetType: "content",
    targetId: content.id,
    companyId: company.id,
  });

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="compliance-report-${content.id}.txt"`,
    },
  });
}
