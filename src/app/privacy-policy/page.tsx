// Public Privacy Policy — outside (app) auth. /privacy is reserved for the
// in-app data-subject request queue; this route is the customer-facing policy.

import { LegalPublicPage } from "@/components/legal-public-page";
import { listTermsVersions } from "@/lib/db";
import type { TermsVersion } from "@/lib/types";

export const metadata = { title: "Privacy Policy — Marketing Command Centre" };

export default async function PrivacyPolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;
  const viewVersion = params.v ? Number(params.v) : undefined;
  let versions: TermsVersion[] = [];
  try {
    versions = await listTermsVersions("privacy");
  } catch {
    versions = [];
  }

  return (
    <LegalPublicPage
      kind="privacy"
      versions={versions}
      viewVersion={Number.isFinite(viewVersion) ? viewVersion : undefined}
    />
  );
}
