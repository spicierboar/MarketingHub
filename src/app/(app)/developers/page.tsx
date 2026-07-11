import { requireAdmin } from "@/lib/auth/rbac";
import { listApiKeys, listCompanies, listPartnerWebhooks } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { publicApiLive } from "@/lib/public-api/gate";
import Link from "next/link";

export default async function DevelopersPage() {
  const user = await requireAdmin();
  const [keys, webhooks, companies] = await Promise.all([
    listApiKeys(user.tenantId),
    listPartnerWebhooks(user.tenantId),
    listCompanies(user.tenantId),
  ]);
  return (
    <div>
      <PageHeader title="Developers & API" description="Manage API keys and partner webhooks (session auth)." />
      <p className="mb-4 text-sm">PUBLIC_API_LIVE: {publicApiLive() ? "on" : "off"} · <Link href="/api/v1" className="text-primary underline" target="_blank">API catalog</Link></p>
      <p className="text-sm text-muted-foreground">{keys.length} API key(s) · {webhooks.length} webhook(s) · {companies.length} clients</p>
      <p className="mt-4 text-sm">Use server actions in <code>developers/actions.ts</code> from forms wired in a follow-up UI pass, or integrate via API directly.</p>
    </div>
  );
}
