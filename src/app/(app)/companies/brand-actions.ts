"use server";

// Server actions for the Brand Brain, Service Catalogue and Governance pages
// (Phases 2–3). All are admin-only, matching master prompt §7 ("Admins must be
// able to manage brand documents and Brand Brain sources").

import { revalidatePath } from "next/cache";
import {
  createClaim,
  createConsent,
  createEvidence,
  createOffer,
  createResponse,
  createService,
  getClaim,
  getConsent,
  getKnowledgeDoc,
  getOffer,
  getResponse,
  getService,
  setClaimActive,
  setKnowledgeDocStatus,
  setResponseActive,
  updateOffer,
  updateService,
  upsertLocalProfile,
  withdrawConsent,
} from "@/lib/db";
import {
  assertAdminCompanyAccess,
  canAccessCompany,
  requireAdmin,
} from "@/lib/auth/rbac";
import { logAction } from "@/lib/audit";
import type {
  EvidenceType,
  KnowledgeSourceType,
  OfferStatus,
  ResponseCategory,
  ServiceRecord,
} from "@/lib/types";
import {
  approveKnowledgeDocument,
  archiveKnowledgeDocument,
  extractTextFromUpload,
  restoreKnowledgeDocument,
  reviseRagDocument,
  uploadKnowledgeDocument,
} from "@/lib/brand-brain-rag";

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}
function lines(fd: FormData, key: string): string[] {
  return text(fd, key)
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---- Knowledge documents ------------------------------------------------------

export async function addKnowledgeDocAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const title = text(formData, "title");
  const content = text(formData, "content");
  if (!companyId || !title || !content) throw new Error("Title and content are required");

  const doc = await uploadKnowledgeDocument({
    companyId,
    title,
    content,
    sourceType: (text(formData, "sourceType") || "other") as KnowledgeSourceType,
    addedById: user.id,
  });
  await logAction(user, "knowledge.added", {
    targetType: "knowledge_doc",
    targetId: doc.id,
    companyId,
    detail: `${title} (draft)`,
  });
  revalidatePath(`/companies/${companyId}/brand-brain`);
}

export async function uploadRagDocumentAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  if (!companyId) throw new Error("Company is required");

  const pasted = text(formData, "content");
  const titleOverride = text(formData, "title");
  const file = formData.get("file");
  let fileName = text(formData, "fileName");
  let contentType = text(formData, "contentType");
  let rawText = pasted;

  if (file instanceof File && file.size > 0) {
    fileName = file.name;
    contentType = file.type || "application/octet-stream";
    const isText =
      file.type.startsWith("text/") ||
      /\.(txt|csv|md)$/i.test(file.name);
    if (!rawText && isText) {
      rawText = await file.text();
    }
  }

  const extracted = extractTextFromUpload(
    fileName || titleOverride || "upload",
    contentType || "text/plain",
    rawText,
  );
  const title = titleOverride || extracted.title;
  if (!title) throw new Error("Title is required");

  const doc = await uploadKnowledgeDocument({
    companyId,
    title,
    content: extracted.content,
    sourceType: (text(formData, "sourceType") || extracted.sourceType) as KnowledgeSourceType,
    addedById: user.id,
    fileName: fileName || undefined,
    contentType: contentType || undefined,
  });
  await logAction(user, "knowledge.uploaded", {
    targetType: "knowledge_doc",
    targetId: doc.id,
    companyId,
    detail: `${title} (draft${fileName ? ` · ${fileName}` : ""})`,
  });
  revalidatePath(`/companies/${companyId}/brand-brain`);
}

export async function reviseKnowledgeDocAction(formData: FormData) {
  const user = await requireAdmin();
  const docId = text(formData, "docId");
  const doc = await getKnowledgeDoc(docId);
  if (!doc) throw new Error("Document not found");
  if (!(await canAccessCompany(user, doc.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  const title = text(formData, "title") || doc.title;
  const content = text(formData, "content");
  if (!content) throw new Error("Content is required");

  await reviseRagDocument(docId, { title, content }, user.id);
  await logAction(user, "knowledge.revised", {
    targetType: "knowledge_doc",
    targetId: docId,
    companyId: doc.companyId,
    detail: `${title} → v${doc.version}`,
  });
  revalidatePath(`/companies/${doc.companyId}/brand-brain`);
}

export async function setKnowledgeDocStatusAction(formData: FormData) {
  const user = await requireAdmin();
  const docId = text(formData, "docId");
  const status = text(formData, "status") as "draft" | "approved" | "archived";
  const doc = await getKnowledgeDoc(docId);
  if (!doc) throw new Error("Document not found");
  if (!(await canAccessCompany(user, doc.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }

  if (status === "approved") {
    await approveKnowledgeDocument(docId);
  } else if (status === "archived") {
    await archiveKnowledgeDocument(docId);
  } else if (status === "draft") {
    await restoreKnowledgeDocument(docId);
  } else {
    await setKnowledgeDocStatus(docId, status);
  }

  const action =
    status === "archived"
      ? "knowledge.archived"
      : status === "approved"
        ? "knowledge.approved"
        : "knowledge.restored";
  await logAction(user, action, {
    targetType: "knowledge_doc",
    targetId: docId,
    companyId: doc.companyId,
    detail: doc.title,
  });
  revalidatePath(`/companies/${doc.companyId}/brand-brain`);
}

// ---- Local Area Intelligence Profile -------------------------------------------

export async function saveLocalProfileAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  if (!companyId) throw new Error("Company is required");

  await upsertLocalProfile({
    companyId,
    suburbs: lines(formData, "suburbs"),
    demographics: text(formData, "demographics") || undefined,
    commonNeeds: text(formData, "commonNeeds") || undefined,
    competitors: lines(formData, "competitors"),
    localEvents: text(formData, "localEvents") || undefined,
    seasonalPatterns: text(formData, "seasonalPatterns") || undefined,
    searchTerms: lines(formData, "searchTerms"),
    buyingTriggers: text(formData, "buyingTriggers") || undefined,
  });
  await logAction(user, "local_profile.saved", {
    targetType: "company",
    targetId: companyId,
    companyId,
  });
  revalidatePath(`/companies/${companyId}/brand-brain`);
}

// ---- Service catalogue ----------------------------------------------------------

export async function addServiceAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const name = text(formData, "name");
  if (!companyId || !name) throw new Error("Service name is required");

  const svc = await createService({
    companyId,
    name,
    description: text(formData, "description"),
    targetCustomer: text(formData, "targetCustomer") || undefined,
    priceRange: text(formData, "priceRange") || undefined,
    priceApproved: formData.get("priceApproved") === "on",
    marginPriority: (text(formData, "marginPriority") ||
      "medium") as ServiceRecord["marginPriority"],
    seasonality: text(formData, "seasonality") || undefined,
    locations: lines(formData, "locations"),
    requiredDisclaimer: text(formData, "requiredDisclaimer") || undefined,
    restrictions: text(formData, "restrictions") || undefined,
    active: true,
  });
  await logAction(user, "service.added", {
    targetType: "service",
    targetId: svc.id,
    companyId,
    detail: name,
  });
  revalidatePath(`/companies/${companyId}/services`);
}

export async function setServiceActiveAction(formData: FormData) {
  const user = await requireAdmin();
  const serviceId = text(formData, "serviceId");
  const companyId = text(formData, "companyId");
  const active = formData.get("active") === "true";
  const svc = await getService(serviceId);
  if (!svc) throw new Error("Service not found");
  if (!(await canAccessCompany(user, svc.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  await updateService(serviceId, { active });
  await logAction(user, active ? "service.reactivated" : "service.deactivated", {
    targetType: "service",
    targetId: serviceId,
    companyId,
  });
  revalidatePath(`/companies/${companyId}/services`);
}

// ---- Consent Register ------------------------------------------------------------

export async function addConsentAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const personShown = text(formData, "personShown");
  if (!companyId || !personShown) throw new Error("Person is required");

  const rec = await createConsent({
    companyId,
    personShown,
    consentObtained: formData.get("consentObtained") === "on",
    documentName: text(formData, "documentName") || undefined,
    permittedChannels: lines(formData, "permittedChannels"),
    expiryDate: text(formData, "expiryDate") || undefined,
    restrictions: text(formData, "restrictions") || undefined,
    approvedById: user.id,
    withdrawn: false,
  });
  await logAction(user, "consent.added", {
    targetType: "consent",
    targetId: rec.id,
    companyId,
    detail: personShown,
  });
  revalidatePath(`/companies/${companyId}/governance`);
}

export async function withdrawConsentAction(formData: FormData) {
  const user = await requireAdmin();
  const consentId = text(formData, "consentId");
  const companyId = text(formData, "companyId");
  const consent = await getConsent(consentId);
  if (!consent) throw new Error("Consent record not found");
  if (!(await canAccessCompany(user, consent.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  await withdrawConsent(consentId);
  await logAction(user, "consent.withdrawn", {
    targetType: "consent",
    targetId: consentId,
    companyId,
  });
  revalidatePath(`/companies/${companyId}/governance`);
}

// ---- Evidence Locker ---------------------------------------------------------------

export async function addEvidenceAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const title = text(formData, "title");
  if (!companyId || !title) throw new Error("Title is required");

  const rec = await createEvidence({
    companyId,
    title,
    evidenceType: (text(formData, "evidenceType") || "other") as EvidenceType,
    detail: text(formData, "detail"),
    documentName: text(formData, "documentName") || undefined,
    validUntil: text(formData, "validUntil") || undefined,
    createdById: user.id,
  });
  await logAction(user, "evidence.added", {
    targetType: "evidence",
    targetId: rec.id,
    companyId,
    detail: title,
  });
  revalidatePath(`/companies/${companyId}/governance`);
}

// ---- Claims Library ----------------------------------------------------------------

export async function addClaimAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const claimText = text(formData, "claimText");
  if (!companyId || !claimText) throw new Error("Claim wording is required");

  const rec = await createClaim({
    companyId,
    claimText,
    evidenceId: text(formData, "evidenceId") || null,
    allowedChannels: lines(formData, "allowedChannels"),
    active: true,
  });
  await logAction(user, "claim.added", {
    targetType: "claim",
    targetId: rec.id,
    companyId,
    detail: claimText,
  });
  revalidatePath(`/companies/${companyId}/governance`);
}

export async function setClaimActiveAction(formData: FormData) {
  const user = await requireAdmin();
  const claimId = text(formData, "claimId");
  const companyId = text(formData, "companyId");
  const active = formData.get("active") === "true";
  const claim = await getClaim(claimId);
  if (!claim) throw new Error("Claim not found");
  if (!(await canAccessCompany(user, claim.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  await setClaimActive(claimId, active);
  await logAction(user, active ? "claim.reactivated" : "claim.deactivated", {
    targetType: "claim",
    targetId: claimId,
    companyId,
  });
  revalidatePath(`/companies/${companyId}/governance`);
}

// ---- Approved Response Library --------------------------------------------------------

export async function addResponseAction(formData: FormData) {
  const user = await requireAdmin();
  const companyId = text(formData, "companyId");
  // Company-scoped responses must target a company in the actor's tenant;
  // empty companyId = tenant-wide (pinned via tenantId below).
  if (companyId && !(await canAccessCompany(user, companyId))) {
    throw new Error("Forbidden: no access to this company");
  }
  const title = text(formData, "title");
  const responseText = text(formData, "responseText");
  if (!title || !responseText) throw new Error("Title and response text are required");

  const rec = await createResponse({
    tenantId: user.tenantId,
    companyId: companyId || null,
    category: (text(formData, "category") ||
      "compliment_thanks") as ResponseCategory,
    title,
    responseText,
    active: true,
  });
  await logAction(user, "response.added", {
    targetType: "approved_response",
    targetId: rec.id,
    companyId: companyId || undefined,
    detail: title,
  });
  revalidatePath(`/companies/${companyId}/governance`);
}

// ---- Offer & Promotion Manager (Phase 4, §30) -----------------------------------

export async function addOfferAction(formData: FormData) {
  const companyId = text(formData, "companyId");
  const user = await assertAdminCompanyAccess(companyId);
  const name = text(formData, "name");
  const approvedWording = text(formData, "approvedWording");
  if (!companyId || !name || !approvedWording) {
    throw new Error("Offer name and approved wording are required");
  }

  const offer = await createOffer({
    companyId,
    name,
    startDate: text(formData, "startDate") || undefined,
    endDate: text(formData, "endDate") || undefined,
    terms: text(formData, "terms") || undefined,
    exclusions: text(formData, "exclusions") || undefined,
    approvedWording,
    requiredDisclaimer: text(formData, "requiredDisclaimer") || undefined,
    channelsAllowed: lines(formData, "channelsAllowed"),
    status: "draft",
  });
  await logAction(user, "offer.added", {
    targetType: "offer",
    targetId: offer.id,
    companyId,
    detail: name,
  });
  revalidatePath(`/companies/${companyId}/offers`);
}

export async function setOfferStatusAction(formData: FormData) {
  const user = await requireAdmin();
  const offerId = text(formData, "offerId");
  const status = text(formData, "status") as OfferStatus;
  const offer = await getOffer(offerId);
  if (!offer) throw new Error("Offer not found");
  if (!(await canAccessCompany(user, offer.companyId))) {
    throw new Error("Forbidden: no access to this company");
  }

  await updateOffer(offerId, { status });
  await logAction(user, `offer.${status}`, {
    targetType: "offer",
    targetId: offerId,
    companyId: offer.companyId,
    detail: offer.name,
  });
  revalidatePath(`/companies/${offer.companyId}/offers`);
}

export async function setResponseActiveAction(formData: FormData) {
  const user = await requireAdmin();
  const responseId = text(formData, "responseId");
  const companyId = text(formData, "companyId");
  const active = formData.get("active") === "true";
  const response = await getResponse(responseId);
  if (!response) throw new Error("Response not found");
  if (response.tenantId === null) {
    // Platform library rows are read-only to tenants — only the platform
    // operator may mutate them.
    if (user.platformAdmin !== true) {
      throw new Error("Forbidden: platform responses are read-only");
    }
  } else if (response.tenantId !== user.tenantId) {
    throw new Error("Forbidden: no access to this response");
  }
  await setResponseActive(responseId, active);
  await logAction(user, active ? "response.reactivated" : "response.deactivated", {
    targetType: "approved_response",
    targetId: responseId,
    companyId: companyId || undefined,
  });
  revalidatePath(`/companies/${companyId}/governance`);
}
