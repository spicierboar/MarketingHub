// Self-test helpers for W5 M40 Full RAG.

import { draftContent } from "@/lib/ai/draft";
import {
  approveKnowledgeDocument,
  governedStatusGates,
  importKnowledgeExternal,
  isBlockedFromRetrieval,
  markKnowledgeOutdated,
  markKnowledgeProhibited,
  retrieveApprovedSnippets,
  reviseRagDocument,
  uploadKnowledgeDocument,
} from "@/lib/rag";
import { ragLive } from "@/lib/rag-connectors";
import {
  addMembership,
  createCompany,
  createTenant,
  createUser,
  getRagKnowledgeSource,
  getRagKnowledgeVersion,
  listRagKnowledgeVersionsForSource,
  purgeTenant,
  updateCompany,
} from "@/lib/db";
import type { Company } from "@/lib/types";

export function checkSimulatedWhenLiveOff(): { ok: boolean; detail: string } {
  return { ok: !ragLive(), detail: `RAG_LIVE=${ragLive()}` };
}

export function checkGovernedStatusGates(): { ok: boolean; detail: string } {
  const ok =
    governedStatusGates("approved") &&
    !governedStatusGates("draft") &&
    isBlockedFromRetrieval("outdated") &&
    isBlockedFromRetrieval("prohibited");
  return { ok, detail: "approved-only retrieval" };
}

export async function checkUploadCreatesDraftVersion(
  companyId: string,
  userId: string,
): Promise<{ ok: boolean; detail: string }> {
  const doc = await uploadKnowledgeDocument({
    companyId,
    title: "RAG self-test menu",
    content: "Soup $8\nFish $28",
    sourceType: "menu",
    addedById: userId,
    fileName: "menu.txt",
    contentType: "text/plain",
  });
  const source = await getRagKnowledgeSource(doc.id);
  const ok = doc.status === "draft" && doc.version === 1 && source?.status === "draft";
  return { ok, detail: `status=${doc.status} v=${doc.version} source=${source?.status}` };
}

export async function checkVersionSupersedes(
  companyId: string,
  userId: string,
): Promise<{ ok: boolean; detail: string }> {
  const doc = await uploadKnowledgeDocument({
    companyId,
    title: "RAG revise test",
    content: "v1 body",
    sourceType: "other",
    addedById: userId,
  });
  await reviseRagDocument(doc.id, { title: "RAG revise test", content: "v2 body" }, userId);
  const versions = await listRagKnowledgeVersionsForSource(doc.id);
  const ok = versions.length === 2 && versions[0]?.versionNumber === 2 && !!versions[1]?.supersededById;
  return { ok, detail: `versions=${versions.length} latest=${versions[0]?.versionNumber}` };
}

export async function checkOutdatedBlocked(
  companyId: string,
  userId: string,
): Promise<{ ok: boolean; detail: string }> {
  const doc = await uploadKnowledgeDocument({
    companyId,
    title: "Outdated price list",
    content: "Lunch special $15 weekday only.",
    sourceType: "price_list",
    addedById: userId,
  });
  await approveKnowledgeDocument(doc.id, userId);
  await markKnowledgeOutdated(doc.id);
  const snippets = await retrieveApprovedSnippets(companyId, "lunch special weekday", 3);
  const blocked = !snippets.some((s) => s.sourceId === doc.id);
  return { ok: blocked, detail: `retrieved=${!blocked}` };
}

export async function checkApprovedCited(
  companyId: string,
  userId: string,
): Promise<{ ok: boolean; detail: string }> {
  const doc = await uploadKnowledgeDocument({
    companyId,
    title: "RAG cite test",
    content: "Weekday lunch special $18 includes soup and bread.",
    sourceType: "price_list",
    addedById: userId,
  });
  await approveKnowledgeDocument(doc.id, userId);
  const snippets = await retrieveApprovedSnippets(companyId, "weekday lunch special", 3);
  const hasApproved = snippets.some((s) => s.sourceId === doc.id);
  const company = {
    id: companyId,
    tenantId: "tn",
    name: "Test Co",
    status: "ai_ready",
    createdBy: userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      industry: "restaurant",
      serviceAreas: [],
      services: [],
      callsToAction: [],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
    },
    documents: [],
  } as Company;
  const draft = await draftContent({
    company,
    requestType: "social_post",
    topic: "Weekday lunch",
    objective: "Promote lunch",
    platform: "Facebook",
  });
  const ok = hasApproved && draft.body.includes("Sources (Brand Brain)");
  return { ok, detail: `retrieved=${hasApproved} cited=${draft.body.includes("Sources (Brand Brain)")}` };
}

export async function checkProhibitedLifecycle(
  companyId: string,
  userId: string,
): Promise<{ ok: boolean; detail: string }> {
  const doc = await uploadKnowledgeDocument({
    companyId,
    title: "Prohibited doc",
    content: "Do not use this claim.",
    sourceType: "other",
    addedById: userId,
  });
  await markKnowledgeProhibited(doc.id);
  const source = await getRagKnowledgeSource(doc.id);
  const snippets = await retrieveApprovedSnippets(companyId, "prohibited claim", 3);
  const ok = source?.status === "prohibited" && !snippets.some((s) => s.sourceId === doc.id);
  return { ok, detail: `status=${source?.status}` };
}

export async function checkImportSimulated(): Promise<{ ok: boolean; detail: string }> {
  const r = await importKnowledgeExternal("t", "c", "u");
  return { ok: r.mode === "simulated", detail: r.detail };
}

export async function checkSourcePersisted(
  companyId: string,
  userId: string,
): Promise<{ ok: boolean; detail: string }> {
  const doc = await uploadKnowledgeDocument({
    companyId,
    title: "Persist test",
    content: "Persisted body",
    sourceType: "faq",
    addedById: userId,
  });
  const source = await getRagKnowledgeSource(doc.id);
  const version = source?.currentVersionId
    ? await getRagKnowledgeVersion(source.currentVersionId)
    : undefined;
  const ok = !!source && !!version && version.versionNumber === 1;
  return { ok, detail: `source=${!!source} version=${version?.versionNumber}` };
}

export async function runRagSelfTest() {
  const start = Date.now();
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const purgeFailed: string[] = [];
  async function expect(
    name: string,
    fn: () => Promise<{ ok: boolean; detail?: string }> | { ok: boolean; detail?: string },
  ) {
    try {
      const r = await fn();
      checks.push({ name, ok: r.ok, detail: r.detail });
    } catch (e) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  await expect("rag.simulatedWhenLiveOff", () => checkSimulatedWhenLiveOff());
  await expect("rag.governedStatusGates", () => checkGovernedStatusGates());
  const t = await createTenant({
    name: "RAG SelfTest",
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const user = await createUser({
    email: `rag-selftest-${Date.now()}@example.dev`,
    name: "RAG Test",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: user.id, role: "owner" });
  const company = await createCompany({ tenantId: t.id, name: "RAG Co", createdBy: user.id });
  await updateCompany(company.id, { status: "approved" });
  await expect("rag.uploadCreatesDraftVersion", () => checkUploadCreatesDraftVersion(company.id, user.id));
  await expect("rag.versionSupersedes", () => checkVersionSupersedes(company.id, user.id));
  await expect("rag.outdatedBlocked", () => checkOutdatedBlocked(company.id, user.id));
  await expect("rag.approvedCited", () => checkApprovedCited(company.id, user.id));
  await expect("rag.prohibitedLifecycle", () => checkProhibitedLifecycle(company.id, user.id));
  await expect("rag.importSimulated", () => checkImportSimulated());
  await expect("rag.sourcePersisted", () => checkSourcePersisted(company.id, user.id));
  try {
    await purgeTenant(t.id);
  } catch (e) {
    purgeFailed.push(e instanceof Error ? e.message : String(e));
  }
  const failed = checks.filter((c) => !c.ok).length;
  return {
    ok: failed === 0 && purgeFailed.length === 0,
    passed: checks.length - failed,
    failed,
    checks,
    purgeFailed,
    durationMs: Date.now() - start,
  };
}
