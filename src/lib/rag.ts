// W5 M40 — Full RAG knowledge base: versioned sources, governed lifecycle,
// deterministic retrieval + citations. New uploads use rag_knowledge_sources +
// rag_knowledge_versions; legacy knowledge_documents remain readable.

import {
  createKnowledgeDoc,
  createRagKnowledgeSource,
  createRagKnowledgeVersion,
  getKnowledgeDoc,
  getRagKnowledgeSource,
  getRagKnowledgeVersion,
  listKnowledgeDocs,
  listRagKnowledgeSources,
  listRagKnowledgeVersionsForSource,
  reviseKnowledgeDoc,
  setKnowledgeDocStatus,
  updateRagKnowledgeSource,
  updateRagKnowledgeVersion,
} from "@/lib/db";
import {
  ragConfigured,
  ragLive,
  simulateSyncKnowledge,
  syncKnowledgeLive,
  type ExternalKnowledgeDoc,
} from "@/lib/rag-connectors";
import type {
  KnowledgeDocument,
  KnowledgeDocStatus,
  KnowledgeSourceType,
  RagKnowledgeSource,
  RagKnowledgeVersion,
  SourceRef,
} from "@/lib/types";

export { ragLive, ragApiKey, ragConfigured } from "@/lib/rag-connectors";

export interface RagUploadMeta {
  fileName?: string;
  contentType?: string;
  uploadedAt?: string;
}

const META_RE = /^<!--rag-meta:([\s\S]*?)-->\n?/;

export function packContentWithMeta(content: string, meta: RagUploadMeta): string {
  const clean = stripContentMeta(content);
  const payload: RagUploadMeta = {
    ...meta,
    uploadedAt: meta.uploadedAt ?? new Date().toISOString(),
  };
  return `<!--rag-meta:${JSON.stringify(payload)}-->\n${clean}`;
}

export function unpackContentWithMeta(raw: string): {
  content: string;
  meta: RagUploadMeta | null;
} {
  const match = raw.match(META_RE);
  if (!match) return { content: raw, meta: null };
  try {
    const meta = JSON.parse(match[1]) as RagUploadMeta;
    return { content: raw.replace(META_RE, "").trim(), meta };
  } catch {
    return { content: raw.replace(META_RE, "").trim(), meta: null };
  }
}

export function stripContentMeta(raw: string): string {
  return raw.replace(META_RE, "").trim();
}

const RETRIEVABLE: ReadonlySet<KnowledgeDocStatus> = new Set(["approved"]);

export function governedStatusGates(status: KnowledgeDocStatus): boolean {
  return RETRIEVABLE.has(status);
}

export function isBlockedFromRetrieval(status: KnowledgeDocStatus): boolean {
  return status === "outdated" || status === "prohibited" || status === "archived" || status === "draft";
}

export interface RagUploadInput {
  companyId: string;
  title: string;
  content: string;
  sourceType: KnowledgeSourceType;
  addedById: string;
  fileName?: string;
  contentType?: string;
}

export function inferSourceTypeFromFileName(
  fileName: string,
  fallback: KnowledgeSourceType = "other",
): KnowledgeSourceType {
  const lower = fileName.toLowerCase();
  if (/\b(menu|food|drink|catering)\b/.test(lower)) return "menu";
  if (/\b(price|pricing|rate|rates)\b/.test(lower)) return "price_list";
  if (/\b(brand|style|guide|guideline)\b/.test(lower)) return "brand_guide";
  if (/\b(faq|question)\b/.test(lower)) return "faq";
  if (/\b(brochure|flyer)\b/.test(lower)) return "brochure";
  return fallback;
}

export function extractTextFromUpload(
  fileName: string,
  contentType: string,
  rawText: string,
): { title: string; content: string; sourceType: KnowledgeSourceType } {
  const sourceType = inferSourceTypeFromFileName(fileName);
  const title = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || fileName;
  const trimmed = rawText.trim();

  if (trimmed.length > 0) {
    return { title, content: trimmed, sourceType };
  }

  const stub = [
    `[Uploaded file: ${fileName}]`,
    `Content type: ${contentType || "unknown"}`,
    "",
    "Text extraction pending — paste or edit the extracted text in Brand Brain before approving.",
    "Until approved, this document will not ground AI drafts.",
  ].join("\n");

  return { title, content: stub, sourceType };
}

function versionsToPrevious(
  versions: RagKnowledgeVersion[],
  current: RagKnowledgeVersion,
): KnowledgeDocument["previousVersions"] {
  return versions
    .filter((v) => v.versionNumber < current.versionNumber)
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .map((v) => ({
      title: v.title,
      content: stripContentMeta(v.content),
      version: v.versionNumber,
      replacedAt: v.createdAt,
      byId: v.createdById,
    }));
}

export function sourceToKnowledgeDocument(
  source: RagKnowledgeSource,
  version: RagKnowledgeVersion,
  allVersions: RagKnowledgeVersion[],
): KnowledgeDocument {
  return {
    id: source.id,
    companyId: source.companyId,
    title: version.title,
    content: version.content,
    sourceType: source.sourceType,
    status: source.status,
    version: version.versionNumber,
    previousVersions: versionsToPrevious(allVersions, version),
    addedById: source.addedById,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

async function loadSourceAsDocument(source: RagKnowledgeSource): Promise<KnowledgeDocument | null> {
  const versions = await listRagKnowledgeVersionsForSource(source.id);
  if (!versions.length) return null;
  const current =
    versions.find((v) => v.id === source.currentVersionId) ?? versions[0]!;
  return sourceToKnowledgeDocument(source, current, versions);
}

export async function uploadKnowledgeDocument(
  input: RagUploadInput,
): Promise<KnowledgeDocument> {
  const packed = packContentWithMeta(input.content, {
    fileName: input.fileName,
    contentType: input.contentType,
  });
  const source = await createRagKnowledgeSource({
    companyId: input.companyId,
    title: input.title,
    sourceType: input.sourceType,
    status: "draft",
    addedById: input.addedById,
  });
  const version = await createRagKnowledgeVersion({
    sourceId: source.id,
    companyId: input.companyId,
    versionNumber: 1,
    title: input.title,
    content: packed,
    status: "draft",
    fileName: input.fileName,
    contentType: input.contentType,
    createdById: input.addedById,
  });
  await updateRagKnowledgeSource(source.id, { currentVersionId: version.id });
  return sourceToKnowledgeDocument(
    { ...source, currentVersionId: version.id },
    version,
    [version],
  );
}

export async function approveKnowledgeDocument(docId: string, approverId?: string): Promise<void> {
  const source = await getRagKnowledgeSource(docId);
  if (source) {
    if (source.status === "archived") {
      throw new Error("Archived documents must be restored before approval");
    }
    if (source.status === "prohibited") {
      throw new Error("Prohibited sources cannot be approved");
    }
    const version = source.currentVersionId
      ? await getRagKnowledgeVersion(source.currentVersionId)
      : (await listRagKnowledgeVersionsForSource(source.id))[0];
    if (!version) throw new Error("No version to approve");
    const time = new Date().toISOString();
    await updateRagKnowledgeVersion(version.id, {
      status: "approved",
      approvedById: approverId ?? null,
      approvedAt: time,
    });
    await updateRagKnowledgeSource(source.id, {
      status: "approved",
      approvedVersionId: version.id,
    });
    return;
  }

  const doc = await getKnowledgeDoc(docId);
  if (!doc) throw new Error("Document not found");
  if (doc.status === "archived") throw new Error("Archived documents must be restored before approval");
  if (doc.status === "prohibited") throw new Error("Prohibited sources cannot be approved");
  await setKnowledgeDocStatus(docId, "approved");
}

export async function archiveKnowledgeDocument(docId: string): Promise<void> {
  const source = await getRagKnowledgeSource(docId);
  if (source) {
    await updateRagKnowledgeSource(source.id, { status: "archived" });
    return;
  }
  await setKnowledgeDocStatus(docId, "archived");
}

export async function markKnowledgeOutdated(docId: string): Promise<void> {
  const source = await getRagKnowledgeSource(docId);
  if (source) {
    await updateRagKnowledgeSource(source.id, { status: "outdated" });
    if (source.currentVersionId) {
      await updateRagKnowledgeVersion(source.currentVersionId, { status: "outdated" });
    }
    return;
  }
  await setKnowledgeDocStatus(docId, "outdated");
}

export async function markKnowledgeProhibited(docId: string): Promise<void> {
  const source = await getRagKnowledgeSource(docId);
  if (source) {
    await updateRagKnowledgeSource(source.id, { status: "prohibited" });
    if (source.currentVersionId) {
      await updateRagKnowledgeVersion(source.currentVersionId, { status: "prohibited" });
    }
    return;
  }
  await setKnowledgeDocStatus(docId, "prohibited");
}

export async function restoreKnowledgeDocument(docId: string): Promise<void> {
  const source = await getRagKnowledgeSource(docId);
  if (source) {
    const next =
      source.status === "archived" || source.status === "outdated"
        ? "draft"
        : source.status;
    await updateRagKnowledgeSource(source.id, { status: next });
    return;
  }
  const doc = await getKnowledgeDoc(docId);
  if (!doc) throw new Error("Document not found");
  await setKnowledgeDocStatus(docId, doc.status === "archived" ? "draft" : doc.status);
}

export async function reviseRagDocument(
  docId: string,
  patch: { title: string; content: string },
  byId: string,
): Promise<KnowledgeDocument | undefined> {
  const source = await getRagKnowledgeSource(docId);
  if (source) {
    const versions = await listRagKnowledgeVersionsForSource(source.id);
    const latest = versions[0];
    const versionNumber = (latest?.versionNumber ?? 0) + 1;
    const newVersion = await createRagKnowledgeVersion({
      sourceId: source.id,
      companyId: source.companyId,
      versionNumber,
      title: patch.title,
      content: patch.content,
      status: "draft",
      createdById: byId,
    });
    if (latest) {
      await updateRagKnowledgeVersion(latest.id, { supersededById: newVersion.id });
    }
    const demote = source.status === "approved";
    await updateRagKnowledgeSource(source.id, {
      title: patch.title,
      currentVersionId: newVersion.id,
      status: demote ? "draft" : source.status,
      approvedVersionId: demote ? null : source.approvedVersionId,
    });
    const updated = await getRagKnowledgeSource(source.id);
    if (!updated) return undefined;
    const all = await listRagKnowledgeVersionsForSource(source.id);
    return sourceToKnowledgeDocument(updated, newVersion, all);
  }

  const doc = await getKnowledgeDoc(docId);
  if (!doc) return undefined;
  const revised = await reviseKnowledgeDoc(docId, patch, byId);
  if (revised && revised.status === "approved") {
    await setKnowledgeDocStatus(docId, "draft");
    return { ...revised, status: "draft" };
  }
  return revised;
}

export async function listRagVersionHistory(sourceId: string): Promise<RagKnowledgeVersion[]> {
  return listRagKnowledgeVersionsForSource(sourceId);
}

export async function listRagDocuments(companyId: string): Promise<KnowledgeDocument[]> {
  const out: KnowledgeDocument[] = [];
  for (const source of await listRagKnowledgeSources(companyId, true)) {
    const doc = await loadSourceAsDocument(source);
    if (doc) out.push(doc);
  }
  const ragIds = new Set(out.map((d) => d.id));
  for (const legacy of await listKnowledgeDocs(companyId, true, true)) {
    if (!ragIds.has(legacy.id)) out.push(legacy);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function displayContent(doc: KnowledgeDocument): string {
  return stripContentMeta(doc.content);
}

export function uploadMetaOf(doc: KnowledgeDocument): RagUploadMeta | null {
  return unpackContentWithMeta(doc.content).meta;
}

export function statusTone(
  status: KnowledgeDocStatus,
): "neutral" | "success" | "warning" | "danger" {
  switch (status) {
    case "approved":
      return "success";
    case "draft":
      return "warning";
    case "outdated":
    case "prohibited":
      return "danger";
    default:
      return "neutral";
  }
}

export async function importKnowledgeExternal(
  _tenantId: string,
  companyId: string,
  actorId: string,
) {
  if (!ragLive()) {
    return { mode: "simulated" as const, imported: 0, skipped: 0, detail: "RAG_LIVE off" };
  }
  const external = (await syncKnowledgeLive(companyId)) ?? simulateSyncKnowledge(companyId);
  const existing = await listRagKnowledgeSources(companyId, true);
  const titles = new Set(existing.map((s) => s.title.toLowerCase()));
  let imported = 0;
  let skipped = 0;
  for (const ext of external) {
    if (titles.has(ext.title.toLowerCase())) {
      skipped++;
      continue;
    }
    await uploadKnowledgeDocument({
      companyId,
      title: ext.title,
      content: ext.content,
      sourceType: (ext.sourceType as KnowledgeSourceType) ?? "other",
      addedById: actorId,
      fileName: ext.fileName,
    });
    imported++;
  }
  return {
    mode: ragConfigured() ? ("live" as const) : ("simulated" as const),
    imported,
    skipped,
    detail: ragConfigured() ? "live import stub" : "RAG_API_KEY unset",
  };
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "our", "your", "this", "that", "from", "are",
  "was", "were", "have", "has", "will", "can", "into", "over", "about", "them",
  "their", "then", "than", "each", "week", "when", "what", "how",
]);

function queryTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9$&']+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w)),
    ),
  ];
}

function scoreSection(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (lower.includes(term)) score += 1;
  }
  return score;
}

function collectSnippetsFromContent(
  sourceId: string,
  title: string,
  rawContent: string,
  terms: string[],
  scored: { ref: SourceRef; score: number }[],
): void {
  const { content } = unpackContentWithMeta(rawContent);
  for (const section of content.split(/\n\n+/)) {
    const text = section.trim();
    if (!text || text.startsWith("[Uploaded file:")) continue;
    const score = scoreSection(text, terms);
    if (score > 0) {
      scored.push({
        ref: {
          sourceId,
          title,
          snippet: text.length > 320 ? text.slice(0, 317) + "…" : text,
        },
        score,
      });
    }
  }
}

export async function retrieveApprovedSnippets(
  companyId: string,
  query: string,
  k = 3,
): Promise<SourceRef[]> {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const scored: { ref: SourceRef; score: number }[] = [];

  for (const source of await listRagKnowledgeSources(companyId)) {
    if (!governedStatusGates(source.status)) continue;
    const versionId = source.approvedVersionId ?? source.currentVersionId;
    if (!versionId) continue;
    const version = await getRagKnowledgeVersion(versionId);
    if (!version || !governedStatusGates(version.status)) continue;
    collectSnippetsFromContent(source.id, version.title, version.content, terms, scored);
  }

  for (const doc of await listKnowledgeDocs(companyId)) {
    if (!governedStatusGates(doc.status)) continue;
    collectSnippetsFromContent(doc.id, doc.title, doc.content, terms, scored);
  }

  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const { ref } of scored) {
    if (seen.has(ref.sourceId)) continue;
    seen.add(ref.sourceId);
    out.push(ref);
    if (out.length >= k) break;
  }
  return out;
}

export function formatSourceCitations(refs: SourceRef[]): string {
  if (refs.length === 0) return "";
  const lines = refs.map((r, i) => `[${i + 1}] ${r.title}: ${r.snippet}`);
  return `\n\n---\nSources (Brand Brain):\n${lines.join("\n")}`;
}

export function applyCitationsToBody(body: string, refs: SourceRef[]): string {
  if (refs.length === 0) return body;
  if (/\n---\nSources \(Brand Brain\):/.test(body)) return body;
  return body + formatSourceCitations(refs);
}

export function sourceLabelsFromRefs(refs: SourceRef[]): string[] {
  return refs.map((r) => `Knowledge base: ${r.title}`);
}

export function previewCitation(ref: SourceRef, index = 1): string {
  return `[${index}] ${ref.title} — "${ref.snippet}"`;
}

export async function addLegacyKnowledgeDocument(
  input: Omit<RagUploadInput, "fileName" | "contentType">,
): Promise<KnowledgeDocument> {
  const packed = packContentWithMeta(input.content, {});
  return createKnowledgeDoc(
    {
      companyId: input.companyId,
      title: input.title,
      content: packed,
      sourceType: input.sourceType,
      addedById: input.addedById,
    },
    "draft",
  );
}

export type { ExternalKnowledgeDoc };
