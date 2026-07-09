import Link from "next/link";
import { notFound } from "next/navigation";
import { canAccessCompany, requireAdmin } from "@/lib/auth/rbac";
import {
  findConnectedIntegration,
  getCompany,
  getLocalProfile,
  listAssetsForCompany,
  listContent,
} from "@/lib/db";
import { buildGbpAuditForCompany, gbpAuditLive } from "@/lib/gbp-audit";
import { GbpAuditPanel } from "@/components/gbp-audit-panel";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default async function LocalSeoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdmin();
  const { id } = await params;
  const company = await getCompany(id);
  if (!company || !(await canAccessCompany(user, company.id))) notFound();

  const [integration, localProfile, assets, allContent] = await Promise.all([
    findConnectedIntegration(company.id, "Google Business Profile"),
    getLocalProfile(company.id),
    listAssetsForCompany(company.id, { approvedOnly: true }),
    listContent(user.tenantId),
  ]);

  const approvedPhotos = assets.filter(
    (a) => a.assetType === "image" || a.mimeType?.startsWith("image/"),
  ).length;

  const companyContent = allContent.filter((c) => c.companyId === company.id);
  const faqCount = companyContent.filter(
    (c) => c.type === "faq" || /\bQ:/i.test(c.body),
  ).length;

  const audit = await buildGbpAuditForCompany(company, {
    integration,
    localProfile,
    approvedPhotoCount: approvedPhotos,
    faqItemCount: faqCount,
  });

  return (
    <div>
      <PageHeader
        title={`${company.name} — Local SEO`}
        description="Google Business Profile audit: NAP, hours, categories, photos and FAQ checklist."
      >
        <Link href={`/companies/${company.id}`} className="text-sm text-primary hover:underline">
          ← Company profile
        </Link>
        <Badge tone={audit.gbpConnected ? "success" : "warning"}>
          {audit.gbpConnected ? "GBP connected" : "GBP not connected"}
        </Badge>
        <Badge tone={gbpAuditLive() ? "primary" : "neutral"}>
          {gbpAuditLive() ? "Live API" : "Simulated"}
        </Badge>
      </PageHeader>

      <div className="space-y-4 p-6">
        {!gbpAuditLive() && (
          <Card className="border-dashed">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Audit runs in <strong className="font-medium text-foreground">simulated</strong> mode
              until <code className="text-xs">PUBLISHING_LIVE=true</code> and Google OAuth creds are
              set. Fixes are based on your company profile, local intelligence and a deterministic
              GBP listing preview.
            </CardContent>
          </Card>
        )}

        <GbpAuditPanel audit={audit} />
      </div>
    </div>
  );
}
