// Brand Brain RAG (V1 module 8) — upload menus / price lists / brand PDFs,
// draft → approved → archived lifecycle, and deterministic keyword retrieval
// with source citations for governed AI flows. No vector store in v1.

import {
  createKnowledgeDoc,
  getKnowledgeDoc,
  listKnowledgeDocs,
  reviseKnowledgeDoc,
  setKnowledgeDocStatus,
} from "@/lib/db";
import type {
  KnowledgeDocument,
  KnowledgeDocStatus,
  KnowledgeSourceType,
  SourceRef,
} from "@/lib/types";

// ---- embedded upload metadata (no migration — packed in content) ------------

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

// ---- upload helpers ----------------------------------------------------------

export interface RagUploadInput {
  companyId: string;
  title: string;
  content: string;
  sourceType: KnowledgeSourceType;
  addedById: string;
  fileName?: string;
  contentType?: string;
}

/** Infer source type from filename when not explicitly set. */
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

/**
 * Text extract when possible; otherwise store metadata stub for PDF/binary uploads.
 */
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

// ---- lifecycle ---------------------------------------------------------------

/** Upload creates a draft v1 knowledge document (never auto-approved). */
export async function uploadKnowledgeDocument(
  input: RagUploadInput,
): Promise<KnowledgeDocument> {
  const packed = packContentWithMeta(input.content, {
    fileName: input.fileName,
    contentType: input.contentType,
  });
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

export async function approveKnowledgeDocument(docId: string): Promise<void> {
  const doc = await getKnowledgeDoc(docId);
  if (!doc) throw new Error("Document not found");
  if (doc.status === "archived") throw new Error("Archived documents must be restored before approval");
  await setKnowledgeDocStatus(docId, "approved");
}

export async function archiveKnowledgeDocument(docId: string): Promise<void> {
  await setKnowledgeDocStatus(docId, "archived");
}

export async function restoreKnowledgeDocument(docId: string): Promise<void> {
  const doc = await getKnowledgeDoc(docId);
  if (!doc) throw new Error("Document not found");
  await setKnowledgeDocStatus(docId, doc.status === "archived" ? "draft" : doc.status);
}

export async function reviseRagDocument(
  docId: string,
  patch: { title: string; content: string },
  byId: string,
): Promise<KnowledgeDocument | undefined> {
  const doc = await getKnowledgeDoc(docId);
  if (!doc) return undefined;
  const revised = await reviseKnowledgeDoc(docId, patch, byId);
  if (revised && revised.status === "approved") {
    await setKnowledgeDocStatus(docId, "draft");
    return { ...revised, status: "draft" };
  }
  return revised;
}

/** Admin UI — all statuses (draft, approved, archived). */
export async function listRagDocuments(companyId: string): Promise<KnowledgeDocument[]> {
  return listKnowledgeDocs(companyId, true, true);
}

export function displayContent(doc: KnowledgeDocument): string {
  return stripContentMeta(doc.content);
}

export function uploadMetaOf(doc: KnowledgeDocument): RagUploadMeta | null {
  return unpackContentWithMeta(doc.content).meta;
}

export function statusTone(
  status: KnowledgeDocStatus,
): "neutral" | "success" | "warning" {
  switch (status) {
    case "approved":
      return "success";
    case "draft":
      return "warning";
    default:
      return "neutral";
  }
}

// ---- deterministic retrieval (approved only) ---------------------------------

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

/** Keyword / paragraph retrieval over approved knowledge only (no embeddings). */
export async function retrieveApprovedSnippets(
  companyId: string,
  query: string,
  k = 3,
): Promise<SourceRef[]> {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const scored: { ref: SourceRef; score: number }[] = [];

  for (const doc of await listKnowledgeDocs(companyId)) {
    if (doc.status !== "approved") continue;
    const { content } = unpackContentWithMeta(doc.content);
    for (const section of content.split(/\n\n+/)) {
      const text = section.trim();
      if (!text || text.startsWith("[Uploaded file:")) continue;
      const score = scoreSection(text, terms);
      if (score > 0) {
        scored.push({
          ref: {
            sourceId: doc.id,
            title: doc.title,
            snippet: text.length > 320 ? text.slice(0, 317) + "…" : text,
          },
          score,
        });
      }
    }
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

// ---- citations ---------------------------------------------------------------

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

/** Preview how a snippet would appear in a cited AI output. */
export function previewCitation(ref: SourceRef, index = 1): string {
  return `[${index}] ${ref.title} — "${ref.snippet}"`;
}
