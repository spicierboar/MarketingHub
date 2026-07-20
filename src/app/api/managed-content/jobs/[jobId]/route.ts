import { NextRequest, NextResponse } from "next/server";
import { canAccessCompany } from "@/lib/auth/rbac";
import {
  authenticateContentDeskRequest,
  isContentDeskOperator,
} from "@/lib/content-desk/auth";
import { getCompany } from "@/lib/db";
import { runInServiceContext } from "@/lib/db/service-context";
import { getManagedJobForTenant } from "@/lib/managed-content-jobs/repository";
import { contentDeskManagedJobStatus } from "@/lib/managed-content-jobs/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const authenticated = await authenticateContentDeskRequest(request);
  if (!authenticated.ok) {
    return NextResponse.json(
      { error: authenticated.error },
      { status: authenticated.status },
    );
  }
  const actor = authenticated.actor;
  if (!isContentDeskOperator(actor)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { jobId } = await context.params;
  if (!jobId || jobId.length > 200) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return runInServiceContext(actor.tenantId, async () => {
    try {
      const job = await getManagedJobForTenant(jobId, actor.tenantId);
      if (!job) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      const company = await getCompany(job.companyId);
      if (
        !company ||
        company.status === "archived" ||
        company.tenantId !== actor.tenantId ||
        !(await canAccessCompany(actor, company.id))
      ) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
      }
      return NextResponse.json(contentDeskManagedJobStatus(job), {
        headers: { "cache-control": "private, no-store" },
      });
    } catch {
      return NextResponse.json(
        { error: "Managed-content status lookup failed" },
        { status: 500 },
      );
    }
  });
}
