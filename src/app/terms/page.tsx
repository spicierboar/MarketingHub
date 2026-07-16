// Public Terms of Service — outside (app) auth. Serves the current published
// version from the DB (Settings → Legal), with a dated archive of prior
// versions (?v=N). Falls back to a static draft when nothing is published yet.

import { LegalPublicPage } from "@/components/legal-public-page";
import { TermsStaticFallback } from "@/components/terms-static-fallback";
import { listTermsVersions } from "@/lib/db";
import type { TermsVersion } from "@/lib/types";

export const metadata = { title: "Terms of Service — Marketing Command Centre" };

export default async function TermsPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const params = await searchParams;
  const viewVersion = params.v ? Number(params.v) : undefined;
  let versions: TermsVersion[] = [];
  try {
    versions = await listTermsVersions("terms");
  } catch {
    versions = [];
  }

  return (
    <LegalPublicPage
      kind="terms"
      versions={versions}
      viewVersion={Number.isFinite(viewVersion) ? viewVersion : undefined}
      fallback={versions.length === 0 ? <TermsStaticFallback /> : undefined}
    />
  );
}
