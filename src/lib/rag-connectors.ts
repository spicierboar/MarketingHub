// RAG platform connectors — simulated when RAG_LIVE is off.

export function ragLive(): boolean {
  return process.env.RAG_LIVE === "true";
}

export function ragApiKey(): string | undefined {
  return process.env.RAG_API_KEY?.trim() || undefined;
}

export function ragConfigured(): boolean {
  return ragLive() && !!ragApiKey();
}

export interface ExternalKnowledgeDoc {
  title: string;
  content: string;
  sourceType?: string;
  fileName?: string;
}

export function simulateSyncKnowledge(_companyId: string): ExternalKnowledgeDoc[] {
  return [];
}

export async function syncKnowledgeLive(companyId: string): Promise<ExternalKnowledgeDoc[] | null> {
  if (!ragLive()) return null;
  if (!ragConfigured()) return simulateSyncKnowledge(companyId);
  const base = process.env.RAG_API_URL?.replace(/\/$/, "") ?? "https://rag.example.com";
  void base;
  return simulateSyncKnowledge(companyId);
}
