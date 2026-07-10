// Self-test helpers for Website CMS (W4 M34).

import {
  addMembership,
  createCompany,
  createTenant,
  createUser,
  getCmsPage,
  listCmsPageVersionsForPage,
  purgeTenant,
  updateCompany,
} from "@/lib/db";
import {
  approvePageVersion,
  createPageDraft,
  defaultSeoForPage,
  findDuplicateSlug,
  importPagesExternal,
  normaliseSlug,
  publishApprovedPage,
  savePageVersion,
  submitPageForReview,
} from "@/lib/cms";
import { cmsLive } from "@/lib/cms-connectors";
import type { CmsPage } from "@/lib/types";

export function checkCmsSimulatedWhenLiveOff(): { ok: boolean; detail: string } {
  return { ok: !cmsLive(), detail: `CMS_LIVE=${cmsLive()}` };
}

export function checkCmsSlugNormalised(): { ok: boolean; detail: string } {
  return { ok: normaliseSlug("  Summer Offer!!  ") === "summer-offer", detail: "slug normalised" };
}

export function checkCmsDuplicateSlugFindsMatch(): { ok: boolean; detail: string } {
  const pages: CmsPage[] = [
    {
      id: "p1",
      companyId: "c",
      slug: "about-us",
      title: "About",
      kind: "page",
      status: "draft",
      createdById: "u",
      createdAt: "t",
      updatedAt: "t",
    },
  ];
  const dupes = findDuplicateSlug(pages, "About Us");
  return { ok: dupes.length === 1, detail: `matches=${dupes.length}` };
}

export async function checkCmsVersionIncrements(): Promise<{ ok: boolean; detail: string }> {
  const t = await createTenant({ name: "CMS Ver", kind: "agency", plan: "starter", status: "active", timezone: "Australia/Sydney" });
  const user = await createUser({ email: `cms-ver-${Date.now()}@example.dev`, name: "CMS Ver", role: "admin" });
  await addMembership({ tenantId: t.id, userId: user.id, role: "owner" });
  const company = await createCompany({ tenantId: t.id, name: "CMS Ver Co", createdBy: user.id });
  await updateCompany(company.id, { status: "approved" });
  const { page } = await createPageDraft({
    companyId: company.id,
    title: "Home",
    slug: "home",
    kind: "page",
    bodyHtml: "<p>v1</p>",
    createdById: user.id,
  });
  await savePageVersion({ pageId: page.id, title: "Home", bodyHtml: "<p>v2</p>", createdById: user.id });
  const versions = await listCmsPageVersionsForPage(page.id);
  const ok = versions[0]?.versionNumber === 2 && versions.length === 2;
  try {
    await purgeTenant(t.id);
  } catch {
    /* ignore */
  }
  return { ok, detail: `latest=${versions[0]?.versionNumber}` };
}

export function checkCmsSeoDefaults(): { ok: boolean; detail: string } {
  const seo = defaultSeoForPage({ title: "Book now" }, "Harbour Motel");
  return { ok: seo.metaTitle.includes("Book now") && seo.metaTitle.includes("Harbour Motel") && !seo.noIndex, detail: seo.metaTitle };
}

export async function checkCmsApprovalGate(): Promise<{ ok: boolean; detail: string }> {
  const t = await createTenant({ name: "CMS Gate", kind: "agency", plan: "starter", status: "active", timezone: "Australia/Sydney" });
  const user = await createUser({ email: `cms-gate-${Date.now()}@example.dev`, name: "CMS Gate", role: "admin" });
  await addMembership({ tenantId: t.id, userId: user.id, role: "owner" });
  const company = await createCompany({ tenantId: t.id, name: "CMS Gate Co", createdBy: user.id });
  await updateCompany(company.id, { status: "approved" });
  const { version } = await createPageDraft({
    companyId: company.id,
    title: "Gate",
    slug: "gate",
    kind: "page",
    bodyHtml: "<p>x</p>",
    createdById: user.id,
  });
  const blocked = await publishApprovedPage(version.id);
  await submitPageForReview(version.id);
  const stillBlocked = await publishApprovedPage(version.id);
  await approvePageVersion(version.id, user.id);
  const published = await publishApprovedPage(version.id);
  try {
    await purgeTenant(t.id);
  } catch {
    /* ignore */
  }
  const ok = !blocked.ok && !stillBlocked.ok && published.ok;
  return { ok, detail: `blocked=${!blocked.ok} published=${published.ok}` };
}

export async function checkCmsImportSimulated(): Promise<{ ok: boolean; detail: string }> {
  const r = await importPagesExternal("t", "c", "u");
  return { ok: r.mode === "simulated", detail: r.detail };
}

export async function runCmsSelfTest() {
  const start = Date.now();
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const purgeFailed: string[] = [];
  async function expect(name: string, fn: () => Promise<{ ok: boolean; detail?: string }> | { ok: boolean; detail?: string }) {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  await expect("cms.simulatedWhenLiveOff", () => checkCmsSimulatedWhenLiveOff());
  await expect("cms.slugNormalised", () => checkCmsSlugNormalised());
  await expect("cms.duplicateSlug", () => checkCmsDuplicateSlugFindsMatch());
  await expect("cms.versionIncrements", () => checkCmsVersionIncrements());
  await expect("cms.seoDefaults", () => checkCmsSeoDefaults());
  await expect("cms.approvalGate", () => checkCmsApprovalGate());
  await expect("cms.importSimulated", () => checkCmsImportSimulated());

  const t = await createTenant({ name: "CMS Persist", kind: "agency", plan: "starter", status: "active", timezone: "Australia/Sydney" });
  const user = await createUser({ email: `cms-persist-${Date.now()}@example.dev`, name: "CMS Persist", role: "admin" });
  await addMembership({ tenantId: t.id, userId: user.id, role: "owner" });
  const company = await createCompany({ tenantId: t.id, name: "CMS Persist Co", createdBy: user.id });
  await updateCompany(company.id, { status: "approved" });
  const { page } = await createPageDraft({
    companyId: company.id,
    title: "Persist",
    slug: "persist",
    kind: "landing",
    bodyHtml: "<p>ok</p>",
    createdById: user.id,
  });
  checks.push({ name: "cms.pagePersisted", ok: !!(await getCmsPage(page.id)) });
  try {
    await purgeTenant(t.id);
  } catch {
    purgeFailed.push(t.id);
  }
  const failed = checks.filter((c) => !c.ok).length;
  return { ok: failed === 0 && !purgeFailed.length, passed: checks.length - failed, failed, purgeFailed, durationMs: Date.now() - start, checks };
}
