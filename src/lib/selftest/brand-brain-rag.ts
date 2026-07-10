// Self-test helpers for V1 Brand Brain RAG (Module 8).

import { draftContent } from "@/lib/ai/draft";
import {
  approveKnowledgeDocument,
  retrieveApprovedSnippets,
  uploadKnowledgeDocument,
} from "@/lib/rag";
import { getKnowledgeDoc, getRagKnowledgeSource } from "@/lib/db";
import type { Company } from "@/lib/types";

export function stubRagCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_rag_stub",
    tenantId: "tn_rag_stub",
    name: "Harbour Grill",
    status: "ai_ready",
    createdBy: "u_rag",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      industry: "restaurant",
      serviceAreas: ["Harbourfront"],
      services: ["Lunch", "Dinner"],
      callsToAction: ["Book a table"],
      prohibitedClaims: [],
      approvedClaims: ["Fresh local seafood"],
      requiredDisclaimers: [],
      targetCustomers: "locals and tourists",
      brandVoice: "Coastal and relaxed",
    },
    documents: [],
    ...overrides,
  } as Company;
}

export async function checkUploadCreatesDraftVersion(
  companyId: string,
  userId: string,
): Promise<{ ok: boolean; detail: string }> {
  const doc = await uploadKnowledgeDocument({
    companyId,
    title: "Self-test winter menu",
    content: "Entrée: grilled barramundi $32\nMain: seafood platter $68",
    sourceType: "menu",
    addedById: userId,
    fileName: "winter-menu.txt",
    contentType: "text/plain",
  });
  const loaded = (await getRagKnowledgeSource(doc.id)) ?? (await getKnowledgeDoc(doc.id));
  const ok =
    doc.status === "draft" &&
    doc.version === 1 &&
    loaded?.status === "draft" &&
    doc.title === "Self-test winter menu";
  return {
    ok,
    detail: `status=${loaded?.status} v=${doc.version}`,
  };
}

export async function checkApprovedCited(
  companyId: string,
  userId: string,
): Promise<{ ok: boolean; detail: string }> {
  const doc = await uploadKnowledgeDocument({
    companyId,
    title: "Self-test price list",
    content:
      "Weekday lunch special $18 includes soup and bread. Barramundi market price varies daily.",
    sourceType: "price_list",
    addedById: userId,
  });
  await approveKnowledgeDocument(doc.id, userId);

  const snippets = await retrieveApprovedSnippets(
    companyId,
    "weekday lunch barramundi price",
    3,
  );
  const hasApproved = snippets.some((s) => s.sourceId === doc.id);

  const company = stubRagCompany({ id: companyId });
  const draft = await draftContent({
    company,
    requestType: "social_post",
    topic: "Weekday lunch special",
    objective: "Promote the weekday lunch offer",
    platform: "Facebook",
  });
  const citedInBody = draft.body.includes("Sources (Brand Brain)");
  const citedInRefs = draft.sourceRefs.some((r) => r.sourceId === doc.id);

  const ok = hasApproved && citedInBody && citedInRefs;
  return {
    ok,
    detail: `retrieved=${hasApproved} body=${citedInBody} refs=${citedInRefs} refsN=${draft.sourceRefs.length}`,
  };
}
