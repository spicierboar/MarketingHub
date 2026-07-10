// Website CMS engine (W4 M34).

import {
  createCmsPage,
  createCmsPageVersion,
  createCmsUpdateRequest,
  getCmsPage,
  getCmsPageVersion,
  listCmsPageVersions,
  listCmsPageVersionsForPage,
  listCmsPages,
  listCmsUpdateRequests,
  updateCmsPage,
  updateCmsPageVersion,
  updateCmsUpdateRequest,
} from "@/lib/db";
import { cmsLive, fetchLivePages, publishPageLive } from "@/lib/cms-connectors";
import type { CmsPage, CmsPageStatus, CmsSeoMetadata, CmsUpdateRequest } from "@/lib/types";

export { cmsLive, cmsApiKey, cmsConfigured } from "@/lib/cms-connectors";

export function normaliseSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function findDuplicateSlug(pages: Pick<CmsPage, "slug">[], slug: string): Pick<CmsPage, "slug">[] {
  const norm = normaliseSlug(slug);
  if (!norm) return [];
  return pages.filter((p) => normaliseSlug(p.slug) === norm);
}

export async function createPageDraft(input: {
  companyId: string;
  title: string;
  slug: string;
  kind: CmsPage["kind"];
  bodyHtml: string;
  createdById: string;
}) {
  const slug = normaliseSlug(input.slug);
  if (!slug) throw new Error("Invalid slug");
  const page = await createCmsPage({
    companyId: input.companyId,
    slug,
    title: input.title.trim(),
    kind: input.kind,
    status: "draft",
    createdById: input.createdById,
  });
  const version = await createCmsPageVersion({
    pageId: page.id,
    companyId: input.companyId,
    versionNumber: 1,
    title: page.title,
    bodyHtml: input.bodyHtml,
    status: "draft",
    createdById: input.createdById,
  });
  await updateCmsPage(page.id, { currentVersionId: version.id });
  return { page, version };
}

export async function savePageVersion(input: {
  pageId: string;
  title: string;
  bodyHtml: string;
  changeSummary?: string;
  createdById: string;
}) {
  const page = await getCmsPage(input.pageId);
  if (!page) return undefined;
  const latest = (await listCmsPageVersionsForPage(page.id))[0];
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  return createCmsPageVersion({
    pageId: page.id,
    companyId: page.companyId,
    versionNumber,
    title: input.title.trim(),
    bodyHtml: input.bodyHtml,
    changeSummary: input.changeSummary,
    status: "draft",
    createdById: input.createdById,
  });
}

export async function submitPageForReview(versionId: string) {
  const version = await getCmsPageVersion(versionId);
  if (!version || version.status !== "draft") return undefined;
  await updateCmsPageVersion(versionId, { status: "pending_review" });
  await updateCmsPage(version.pageId, { status: "pending_review", currentVersionId: versionId });
  return getCmsPageVersion(versionId);
}

export async function approvePageVersion(versionId: string, approverId: string) {
  const version = await getCmsPageVersion(versionId);
  if (!version || version.status !== "pending_review") return undefined;
  const time = new Date().toISOString();
  await updateCmsPageVersion(versionId, { status: "approved", approvedById: approverId, approvedAt: time });
  await updateCmsPage(version.pageId, { status: "approved", currentVersionId: versionId });
  return getCmsPageVersion(versionId);
}

export async function publishApprovedPage(versionId: string) {
  const version = await getCmsPageVersion(versionId);
  if (!version || version.status !== "approved") {
    return { ok: false as const, detail: "Version must be approved before publish" };
  }
  const page = await getCmsPage(version.pageId);
  if (!page) return { ok: false as const, detail: "Page not found" };
  const result = await publishPageLive(page.slug, page.companyId, version.bodyHtml);
  await updateCmsPageVersion(versionId, { status: "published" });
  await updateCmsPage(page.id, {
    status: "published",
    publishedVersionId: versionId,
    liveUrl: result.liveUrl ?? page.liveUrl,
  });
  return { ok: true as const, result };
}

export async function importPagesExternal(tenantId: string, companyId: string, actorId: string) {
  if (!cmsLive()) {
    return { mode: "simulated" as const, imported: 0, skipped: 0, detail: "CMS_LIVE off" };
  }
  const external = (await fetchLivePages(companyId)) ?? [];
  const existing = await listCmsPages(tenantId, companyId);
  let imported = 0;
  let skipped = 0;
  for (const ext of external) {
    if (findDuplicateSlug(existing, ext.slug).length) {
      skipped++;
      continue;
    }
    await createPageDraft({
      companyId,
      title: ext.title,
      slug: ext.slug,
      kind: ext.kind ?? "page",
      bodyHtml: ext.bodyHtml ?? "",
      createdById: actorId,
    });
    imported++;
  }
  return { mode: "live" as const, imported, skipped, detail: "live import stub" };
}

export function defaultSeoForPage(
  page: Pick<CmsPage, "title">,
  companyName: string,
): Omit<CmsSeoMetadata, "id" | "pageId" | "companyId" | "createdAt" | "updatedAt"> {
  return {
    metaTitle: `${page.title} | ${companyName}`,
    metaDescription: `${companyName} — ${page.title}`,
    ogTitle: page.title,
    ogDescription: companyName,
    noIndex: false,
  };
}

export async function pageVersionHistory(tenantId: string, pageId: string) {
  return listCmsPageVersions(tenantId, pageId);
}

export function pageStatusLabel(status: CmsPageStatus): string {
  const labels: Record<CmsPageStatus, string> = {
    draft: "Draft",
    pending_review: "Pending review",
    approved: "Approved",
    published: "Published",
    archived: "Archived",
  };
  return labels[status];
}

export async function listOpenUpdateRequests(tenantId: string, companyId: string) {
  const reqs = await listCmsUpdateRequests(tenantId, companyId);
  return reqs.filter((r) => r.status === "open" || r.status === "in_progress");
}

export async function openUpdateRequest(
  input: Omit<CmsUpdateRequest, "id" | "status" | "createdAt" | "updatedAt" | "completedAt" | "assignedToId">,
) {
  return createCmsUpdateRequest({ ...input, status: "open" });
}

export async function advanceUpdateRequest(
  requestId: string,
  status: CmsUpdateRequest["status"],
  actorId?: string,
) {
  const patch: Partial<CmsUpdateRequest> = { status };
  if (status === "in_progress" && actorId) patch.assignedToId = actorId;
  if (status === "completed") patch.completedAt = new Date().toISOString();
  return updateCmsUpdateRequest(requestId, patch);
}
