// Managed-service quality routing after AI draft:
//
//   AI generates → quality gate (PASS/WARN/FAIL/ESCALATE)
//     PASS/WARN + fully_managed | managed_exceptions → auto-submit to client
//     PASS/WARN + approval → hold for agency
//     FAIL/ESCALATE → hold for agency
//
// Auto-submit never publishes — only puts content in client review.
// Critique / scheduleOne gates for go-live remain untouched.

import { logAction } from "@/lib/audit";
import { critiqueForPublish } from "@/lib/ai/critique";
import {
  getCompany,
  getContent,
  getTenant,
  createManagedApprovalRequest,
  listManagedApprovalRequests,
  listManagedChannelAdaptations,
  listManagedPlannedSlots,
  updateManagedApprovalRequest,
  updateContent,
} from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { defaultServiceLevel } from "@/lib/managed-service/authority";
import { canClientApproveRoute, routeContent } from "@/lib/routing";
import { signPayload } from "@/lib/token";
import { hashApprovalToken } from "@/lib/managed-service/workflow";
import type {
  ActingUser,
  AiCritique,
  ApprovalRoute,
  ContentItem,
  ManagedServiceLevel,
  QualityGateStatus,
  QualityRoutingDecision,
  QualityRoutingRecord,
} from "@/lib/types";
import { now } from "@/lib/utils";

export function mapCritiqueToQualityGate(
  critique: AiCritique,
  route: ApprovalRoute,
): QualityGateStatus {
  // Senior / compliance routes always need staff eyes.
  if (route === "compliance" || route === "senior") return "escalate";
  if (critique.status === "block") return "fail";
  if (critique.status === "warn") return "warn";
  return "pass";
}

export function decideQualityRouting(
  gate: QualityGateStatus,
  serviceLevel: ManagedServiceLevel,
): { decision: QualityRoutingDecision; reason: string } {
  if (gate === "fail" || gate === "escalate") {
    return {
      decision: "hold_agency",
      reason:
        gate === "escalate"
          ? "Quality gate ESCALATE — compliance/senior review required"
          : "Quality gate FAIL — staff must resolve before client sees it",
    };
  }
  // PASS or WARN
  if (serviceLevel === "fully_managed" || serviceLevel === "managed_exceptions") {
    return {
      decision: "auto_submit_client",
      reason: `Quality ${gate.toUpperCase()} + service level ${serviceLevel} → auto-submit to client`,
    };
  }
  return {
    decision: "hold_agency",
    reason: `Quality ${gate.toUpperCase()} + service level approval → hold for staff review`,
  };
}

export function isInClientReview(content: ContentItem): boolean {
  return (
    content.status === "pending_approval" &&
    content.clientReview?.status === "pending" &&
    content.qualityRouting?.decision === "auto_submit_client"
  );
}

export function isInAgencyReview(content: ContentItem): boolean {
  if (content.qualityRouting?.decision === "hold_agency") {
    return (
      content.status === "pending_approval" ||
      content.status === "ai_draft" ||
      content.status === "user_edited"
    );
  }
  // Held pending_approval without a client link = agency queue
  return (
    content.status === "pending_approval" &&
    !content.clientReview &&
    !!content.qualityRouting
  );
}

export function listAgencyQualityHolds(content: ContentItem[]): ContentItem[] {
  return content.filter(isInAgencyReview);
}

async function stampClientReview(input: {
  content: ContentItem;
  company: { id: string; name: string; profile: { approvalContact?: string }; tenantId: string };
  actor: ActingUser;
  origin: string;
  email?: string;
}): Promise<{ email: string; link: string }> {
  const contact = (input.email ?? input.company.profile.approvalContact ?? "")
    .trim()
    .toLowerCase();
  if (!contact || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
    throw new Error(
      "Client email required for auto-submit (set approval contact email on the client profile).",
    );
  }

  const issuedAt = Date.now();
  const ttlMs = 7 * 24 * 60 * 60 * 1000;
  const token = signPayload(
    {
      tenantId: input.company.tenantId,
      companyId: input.content.companyId,
      contentId: input.content.id,
      clientEmail: contact,
      purpose: "client_approval",
    },
    { issuedAt, ttlMs },
  );
  const link = `${input.origin.replace(/\/+$/, "")}/approve/${token}`;
  const tenant = await getTenant(input.company.tenantId);
  const priorRequests = (await listManagedApprovalRequests(
    input.company.tenantId,
    input.company.id,
  ))
    .filter((request) => request.contentId === input.content.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = priorRequests.filter((request) => request.status === "pending");
  let plannedSlotId: string | null = null;
  if (input.content.managedConceptId) {
    const adaptations = await listManagedChannelAdaptations(
      input.company.tenantId,
      input.content.managedConceptId,
    );
    const adaptation = adaptations.find(
      (item) => item.channelKey === input.content.managedChannelKey,
    );
    if (adaptation) {
      plannedSlotId =
        (await listManagedPlannedSlots(input.company.tenantId, input.company.id))
          .find((slot) => slot.adaptationId === adaptation.id)?.id ?? null;
    }
  }
  const durable = await createManagedApprovalRequest({
    tenantId: input.company.tenantId,
    companyId: input.company.id,
    contentId: input.content.id,
    conceptId: input.content.managedConceptId ?? null,
    plannedSlotId,
    adCampaignId: null,
    scope: "standard_content",
    recipientEmail: contact,
    tokenHash: hashApprovalToken(token),
    status: "pending",
    dueAt: new Date(issuedAt + ttlMs).toISOString(),
    revisionRound: priorRequests[0]?.revisionRound ?? 0,
    supersededById: null,
    reminder7dAt: null,
    reminder3dAt: null,
    staffEscalationAt: null,
    reminder7dKey: null,
    reminder3dKey: null,
    staffEscalationKey: null,
    respondedAt: null,
    directChargeDisclosureAcceptedAt: null,
  });
  for (const request of pending) {
    await updateManagedApprovalRequest(request.id, {
      status: "superseded",
      supersededById: durable.id,
    });
  }

  await updateContent(input.content.id, {
    status: "pending_approval",
    clientReview: {
      email: contact,
      sharedById: input.actor.id,
      sharedAt: now(),
      expiresAt: new Date(issuedAt + ttlMs).toISOString(),
      link,
      status: "pending",
    },
  });

  await sendEmail({
    to: contact,
    fromName: tenant?.branding?.emailFromName,
    subject: `Your content is ready for review: ${input.content.title}`,
    html: `<p>${input.company.name} — your content is ready for review.</p>
           <p><a href="${link}">Review &amp; approve →</a></p>
           <p style="color:#888">This secure link expires in 7 days. No account needed.</p>`,
  });

  return { email: contact, link };
}

/**
 * Run quality gate on a fresh AI draft and route to client or agency queue.
 * Never publishes. Returns the decision applied.
 */
export async function applyQualityRoutingAfterDraft(input: {
  contentId: string;
  actor: ActingUser;
  origin: string;
  platform?: string;
  /** Prefer when the ordering client is known (Extras Buy / portal). */
  clientEmail?: string;
}): Promise<{
  gate: QualityGateStatus;
  decision: QualityRoutingDecision;
  record: QualityRoutingRecord;
  content: ContentItem;
}> {
  const content = await getContent(input.contentId);
  if (!content) throw new Error("Content not found");
  const company = await getCompany(content.companyId);
  if (!company) throw new Error("Company not found");

  const route =
    content.routedTo ??
    routeContent({
      type: content.type,
      compliance: content.compliance,
      claimAudit: content.claimAudit,
    });

  // Only apply platform length limits when a real channel is known. Defaulting
  // to Facebook (~500 chars) incorrectly fails long Instagram/blog drafts.
  const platform = input.platform?.trim() || "";
  const critique = await critiqueForPublish({ content, company, platform });
  const gate = mapCritiqueToQualityGate(critique, route);
  const serviceLevel =
    company.profile.managedService?.serviceLevel ?? defaultServiceLevel();
  const { decision, reason } = decideQualityRouting(gate, serviceLevel);

  // Client-facing auto-submit only when the route is client-approvable.
  // Content-library shelf (industry/general) has no client contact — hold for agency.
  let finalDecision = decision;
  let finalReason = reason;
  const isShelf = Boolean(company.profile.contentLibraryShelf);
  if (decision === "auto_submit_client" && isShelf) {
    finalDecision = "hold_agency";
    finalReason = "Agency library content (industry/general) — held for staff review";
  } else if (decision === "auto_submit_client" && !canClientApproveRoute(route)) {
    finalDecision = "hold_agency";
    finalReason = `Route ${route} is not client-approvable — held for agency`;
  }

  const record: QualityRoutingRecord = {
    gate,
    decision: finalDecision,
    serviceLevel,
    decidedAt: now(),
    decidedById: input.actor.id,
    reason: finalReason,
    queue:
      finalDecision === "auto_submit_client"
        ? "in_client_review"
        : "in_agency_review",
  };

  await updateContent(content.id, {
    aiCritique: critique,
    routedTo: route,
    qualityRouting: record,
    status: "pending_approval",
    ...(finalDecision === "hold_agency"
      ? { clientReview: undefined }
      : {}),
  });
  const afterRoute = await getContent(content.id);
  if (!afterRoute || afterRoute.status !== "pending_approval") {
    throw new Error(
      "Failed to move content to pending approval (database update did not stick).",
    );
  }

  if (finalDecision === "auto_submit_client") {
    try {
      await stampClientReview({
        content: (await getContent(content.id))!,
        company,
        actor: input.actor,
        origin: input.origin,
        email: input.clientEmail,
      });
      await logAction(input.actor, "content.quality_auto_submit_client", {
        targetType: "content",
        targetId: content.id,
        companyId: content.companyId,
        detail: `${gate} → client review`,
      });
    } catch (err) {
      // Missing client email → fall back to agency hold (still quality-gated).
      const msg = err instanceof Error ? err.message : String(err);
      const holdRecord: QualityRoutingRecord = {
        ...record,
        decision: "hold_agency",
        queue: "in_agency_review",
        reason: `${record.reason} — auto-submit failed (${msg.slice(0, 120)}); held for agency`,
      };
      await updateContent(content.id, {
        qualityRouting: holdRecord,
        status: "pending_approval",
        clientReview: undefined,
      });
      await logAction(input.actor, "content.quality_hold_agency", {
        targetType: "content",
        targetId: content.id,
        companyId: content.companyId,
        detail: holdRecord.reason,
      });
      const updated = (await getContent(content.id))!;
      return {
        gate,
        decision: "hold_agency",
        record: holdRecord,
        content: updated,
      };
    }
  } else {
    await logAction(input.actor, "content.quality_hold_agency", {
      targetType: "content",
      targetId: content.id,
      companyId: content.companyId,
      detail: finalReason,
    });
  }

  const updated = (await getContent(content.id))!;
  return { gate, decision: finalDecision, record, content: updated };
}

/** Staff manually submits a held item to the client Approvals queue. */
export async function submitHeldContentToClient(input: {
  contentId: string;
  actor: ActingUser;
  origin: string;
  clientEmail?: string;
}): Promise<ContentItem> {
  const content = await getContent(input.contentId);
  if (!content) throw new Error("Content not found");
  const company = await getCompany(content.companyId);
  if (!company) throw new Error("Company not found");

  if (content.status !== "pending_approval" && content.status !== "ai_draft") {
    throw new Error("Only held drafts can be submitted to the client.");
  }

  const route = content.routedTo ?? "admin";
  if (!canClientApproveRoute(route)) {
    throw new Error("This item requires internal compliance/senior approval first.");
  }

  await stampClientReview({
    content,
    company,
    actor: input.actor,
    origin: input.origin,
    email: input.clientEmail,
  });

  const serviceLevel =
    company.profile.managedService?.serviceLevel ?? defaultServiceLevel();
  const record: QualityRoutingRecord = {
    gate: content.qualityRouting?.gate ?? "pass",
    decision: "auto_submit_client",
    serviceLevel,
    decidedAt: now(),
    decidedById: input.actor.id,
    reason: "Staff manually submitted held item to client",
    queue: "in_client_review",
  };
  await updateContent(content.id, { qualityRouting: record });

  await logAction(input.actor, "content.quality_manual_submit_client", {
    targetType: "content",
    targetId: content.id,
    companyId: content.companyId,
    detail: "held → client review",
  });

  return (await getContent(content.id))!;
}
