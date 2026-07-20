import { NextRequest, NextResponse } from "next/server";
import { canAccessCompany } from "@/lib/auth/rbac";
import {
  authenticateContentDeskRequest,
  isContentDeskOperator,
} from "@/lib/content-desk/auth";
import { getCompany } from "@/lib/db";
import {
  ManagedContentContractError,
  submitManagedContentJobForStaff,
} from "@/lib/managed-content-jobs/service";
import { StaffManagedContentJobRequestSchema } from "@/lib/managed-content-jobs/schemas";
import { runInServiceContext } from "@/lib/db/service-context";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const parsed = StaffManagedContentJobRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid managed-content request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return runInServiceContext(actor.tenantId, async () => {
    const company = await getCompany(parsed.data.companyId);
    if (
      !company ||
      company.status === "archived" ||
      company.tenantId !== actor.tenantId ||
      !(await canAccessCompany(actor, company.id))
    ) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    try {
      return NextResponse.json(
        await submitManagedContentJobForStaff(actor, parsed.data),
        { status: 202 },
      );
    } catch (error) {
      const status =
        error instanceof ManagedContentContractError ? error.status : 500;
      return NextResponse.json(
        {
          error:
            error instanceof ManagedContentContractError
              ? error.message
              : "Managed-content submission failed",
        },
        { status },
      );
    }
  });
}
