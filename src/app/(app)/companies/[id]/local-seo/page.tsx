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
import { buildLocalSeoForCompany } from "@/lib/local-seo";
import { localSeoLive } from "@/lib/local-seo-connectors";
import { GbpAuditPanel } from "@/components/gbp-audit-panel";
import { LocalSeoPanel } from "@/components/local-seo-panel";
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

  const report = await buildLocalSeoForCompany(company, {
    localProfile,
    gbpAudit: audit,
  });

  return (
    <div>
      <PageHeader
        title={`${company.name} — Local SEO`}
        description="Suburb landing briefs, schema markup, factual Q&A drafts and Google Business Profile audit."
      >
        <Link href={`/companies/${company.id}`} className="text-sm text-primary hover:underline">
          ← Company profile
        </Link>
        <Badge tone={audit.gbpConnected ? "success" : "warning"}>
          {audit.gbpConnected ? "GBP connected" : "GBP not connected"}
        </Badge>
        <Badge tone={localSeoLive() ? "primary" : "neutral"}>
          {localSeoLive() ? "Local SEO live" : "Local SEO simulated"}
        </Badge>
        <Badge tone={gbpAuditLive() ? "primary" : "neutral"}>
          {gbpAuditLive() ? "GBP live API" : "GBP simulated"}
        </Badge>
      </PageHeader>

      <div className="space-y-4 p-6">
        {(!localSeoLive() || !gbpAuditLive()) && (
          <Card className="border-dashed">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Local SEO enrichment runs in{" "}
              <strong className="font-medium text-foreground">simulated</strong> mode until{" "}
              <code className="text-xs">LOCAL_SEO_LIVE=true</code> (non-staging). GBP audit uses{" "}
              <code className="text-xs">PUBLISHING_LIVE=true</code> plus Google OAuth for live
              listing reads. Recommendations are computed from company profile and local
              intelligence.
            </CardContent>
          </Card>
        )}

        <LocalSeoPanel report={report} audit={audit} companyId={company.id} />

        <GbpAuditPanel audit={audit} />
      </div>
    </div>
  );
}
