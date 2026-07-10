"use server";

import { revalidatePath } from "next/cache";
import { assertAdminCompanyAccess } from "@/lib/auth/rbac";
import { getCompany, listCmsPages, upsertCmsSeoMetadata } from "@/lib/db";
import {
  advanceUpdateRequest,
  approvePageVersion,
  createPageDraft,
  defaultSeoForPage,
  importPagesExternal,
  openUpdateRequest,
  publishApprovedPage,
  savePageVersion,
  submitPageForReview,
} from "@/lib/cms";

export async function createPageAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  const title = String(formData.get("title") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const kind = String(formData.get("kind") ?? "page") as "page" | "landing";
  const bodyHtml = String(formData.get("bodyHtml") ?? "");
  const pages = await listCmsPages(user.tenantId, companyId);
  const { findDuplicateSlug } = await import("@/lib/cms");
  if (findDuplicateSlug(pages, slug).length) throw new Error("Duplicate slug");
  const { page } = await createPageDraft({ companyId, title, slug, kind, bodyHtml, createdById: user.id });
  const company = await getCompany(companyId);
  await upsertCmsSeoMetadata(page.id, companyId, defaultSeoForPage(page, company?.name ?? "Company"));
  revalidatePath(`/cms?company=${companyId}`);
}

export async function importPagesAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  await importPagesExternal(user.tenantId, companyId, user.id);
  revalidatePath(`/cms?company=${companyId}`);
}

export async function submitReviewAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  await assertAdminCompanyAccess(companyId);
  const versionId = String(formData.get("versionId") ?? "");
  await submitPageForReview(versionId);
  revalidatePath(`/cms?company=${companyId}`);
}

export async function approvePageAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  const versionId = String(formData.get("versionId") ?? "");
  await approvePageVersion(versionId, user.id);
  revalidatePath(`/cms?company=${companyId}`);
}

export async function publishPageAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  await assertAdminCompanyAccess(companyId);
  const versionId = String(formData.get("versionId") ?? "");
  const result = await publishApprovedPage(versionId);
  if (!result.ok) throw new Error(result.detail);
  revalidatePath(`/cms?company=${companyId}`);
}

export async function saveVersionAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  await savePageVersion({
    pageId: String(formData.get("pageId") ?? ""),
    title: String(formData.get("title") ?? ""),
    bodyHtml: String(formData.get("bodyHtml") ?? ""),
    changeSummary: String(formData.get("changeSummary") ?? "") || undefined,
    createdById: user.id,
  });
  revalidatePath(`/cms?company=${companyId}`);
}

export async function saveSeoAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  await assertAdminCompanyAccess(companyId);
  const pageId = String(formData.get("pageId") ?? "");
  await upsertCmsSeoMetadata(pageId, companyId, {
    metaTitle: String(formData.get("metaTitle") ?? ""),
    metaDescription: String(formData.get("metaDescription") ?? ""),
    ogTitle: String(formData.get("ogTitle") ?? "") || undefined,
    ogDescription: String(formData.get("ogDescription") ?? "") || undefined,
    canonicalUrl: String(formData.get("canonicalUrl") ?? "") || undefined,
    noIndex: formData.get("noIndex") === "on",
  });
  revalidatePath(`/cms?company=${companyId}`);
}

export async function createUpdateRequestAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  const pageId = String(formData.get("pageId") ?? "") || undefined;
  await openUpdateRequest({
    companyId,
    pageId: pageId || null,
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    requestedById: user.id,
  });
  revalidatePath(`/cms?company=${companyId}`);
}

export async function completeUpdateRequestAction(formData: FormData) {
  const companyId = String(formData.get("companyId") ?? "");
  const user = await assertAdminCompanyAccess(companyId);
  await advanceUpdateRequest(String(formData.get("requestId") ?? ""), "completed", user.id);
  revalidatePath(`/cms?company=${companyId}`);
}
