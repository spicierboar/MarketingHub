// Lightweight retrieval over the company knowledge base (Phase 2).
//
// Delegates to Brand Brain RAG for deterministic keyword retrieval over
// approved documents only. The production path may swap in pgvector behind
// retrieveApprovedSnippets without changing call sites.

import { retrieveApprovedSnippets } from "@/lib/brand-brain-rag";
import type { SourceRef } from "@/lib/types";

export async function retrieveSnippets(
  companyId: string,
  query: string,
  k = 3,
): Promise<SourceRef[]> {
  return retrieveApprovedSnippets(companyId, query, k);
}
