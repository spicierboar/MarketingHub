import { requirePortalUser } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/page-header";
import { ClientAccountLinks } from "@/components/client-account-links";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Client portal value-add hub stub.
 * PLACEHOLDER: catalog of upsells / add-ons once product defines packages.
 */
export default async function ClientValueAddPage() {
  await requirePortalUser();

  return (
    <div>
      <PageHeader
        title="Value-add"
        explainerId="client-value-add"
        explainer="Optional upgrades and extras for your marketing package — coming soon."
      />
      <ClientAccountLinks />
      <div className="space-y-4 p-4 sm:p-5">
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium">Coming soon</p>
            <p className="text-sm text-muted-foreground">
              Extra services (video, ads management upgrades, seasonal boosts)
              will appear here for request and approval.
            </p>
            {/* PLACEHOLDER: wire to promo catalog / custom work once IA is final. */}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
