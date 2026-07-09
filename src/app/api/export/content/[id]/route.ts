import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCompany } from "@/lib/auth/rbac";
import { getCompany, getContent } from "@/lib/db";
import { contentToDocx } from "@/lib/export";
import { logAction } from "@/lib/audit";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const contentId = id.replace(/\.docx$/, "");
  const content = await getContent(contentId);
  if (!content || !(await canAccessCompany(user, content.companyId))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const company = (await getCompany(content.companyId))!;
  const buffer = await contentToDocx(content, company);

  await logAction(user, "content.exported", {
    targetType: "content",
    targetId: content.id,
    companyId: company.id,
    detail: "Word",
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${contentId}.docx"`,
    },
  });
}
