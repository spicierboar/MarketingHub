// Website CMS platform connectors — simulated when CMS_LIVE is off.

export function cmsLive(): boolean {
  return process.env.CMS_LIVE === "true";
}

export function cmsApiKey(): string | undefined {
  return process.env.CMS_API_KEY?.trim() || undefined;
}

export function cmsConfigured(): boolean {
  return cmsLive() && !!cmsApiKey();
}

export interface ExternalCmsPage {
  slug: string;
  title: string;
  bodyHtml?: string;
  kind?: "page" | "landing";
}

export function simulatePublishPage(slug: string, companyId: string) {
  return {
    ok: true,
    detail: "simulated publish",
    mode: "simulated" as const,
    liveUrl: `http://localhost/sites/${companyId.slice(-8)}/${slug}`,
  };
}

export async function publishPageLive(slug: string, companyId: string, _html: string) {
  if (!cmsConfigured()) return simulatePublishPage(slug, companyId);
  const base = process.env.CMS_API_URL?.replace(/\/$/, "") ?? "https://cms.example.com";
  return {
    ok: true,
    detail: "live publish stub",
    mode: "live" as const,
    liveUrl: `${base}/${companyId}/${slug}`,
  };
}

export function simulateImportPages(_companyId: string): ExternalCmsPage[] {
  return [];
}

export async function fetchLivePages(companyId: string): Promise<ExternalCmsPage[] | null> {
  if (!cmsLive()) return null;
  return simulateImportPages(companyId);
}
