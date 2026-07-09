"use server";

import { revalidatePath } from "next/cache";
import {
  addContentComment,
  advanceRequest,
  getCompany,
  getContent,
  isUnderLegalHold,
  listContent,
  maybeCompleteCampaign,
  updateCampaignItem,
  updateContent,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import { governContent } from "@/lib/content-governance";
import { canClientApproveRoute, ROUTE_LABEL } from "@/lib/routing";
import { assertPublicRate, clientIp } from "@/lib/ratelimit";
import { verifyPayload } from "@/lib/token";
import { now } from "@/lib/utils";
import type { Company, ContentItem } from "@/lib/types";

export interface ApprovalToken {
  tenantId: string;
  companyId: string;
  contentId: string;
  clientEmail: string;
  purpose: string;
}

// Resolve a token to its (content, company) — the ONLY entry point for the
// public route. Every isolation check lives here: valid signature + unexpired,
// the content really belongs to the token's company, and the company really
// belongs to the token's tenant. Any mismatch → null (never leak another
// tenant's data, never trust the token's ids without cross-checking the store).
function isApprovalToken(p: unknown): p is ApprovalToken {
  const t = p as Partial<ApprovalToken>;
  return (
    typeof t?.tenantId === "string" &&
    typeof t?.companyId === "string" &&
    typeof t?.contentId === "string" &&
    typeof t?.clientEmail === "string" &&
    t?.purpose === "client_approval"
  );
}

export async function resolveApprovalToken(
  raw: string,
): Promise<{ token: ApprovalToken; content: ContentItem; company: Company } | null> {
  const token = verifyPayload<ApprovalToken>(raw, Date.now(), isApprovalToken);
  if (!token) return null;
  const content = await getContent(token.contentId);
  if (!content || content.companyId !== token.companyId) return null;
  const company = await getCompany(content.companyId);
  if (!company || company.tenantId !== token.tenantId) return null;
  return { token, content, company };
}

function clientActor(token: ApprovalToken) {
  return { id: `client:${token.clientEmail}`, email: token.clientEmail, tenantId: token.tenantId };
}

// A token is only usable while its share is un-answered AND belongs to the
// client the token names. This makes each token truly single-use and immune to
// replay after an internal edit re-opens the item to pending_approval.
function assertShareIsLive(content: ContentItem, token: ApprovalToken): void {
  const review = content.clientReview;
  if (!review || review.status !== "pending" || review.email !== token.clientEmail) {
    throw new Error(
      "This approval link has already been used or has been superseded — please ask for a fresh link.",
    );
  }
}

export async function clientApproveAction(formData: FormData) {
  // Throttle the anonymous /approve surface per IP (T7): caps token brute-force
  // and repeated submissions before any token is resolved.
  await assertPublicRate("client_approval", await clientIp());
  const raw = String(formData.get("token") || "");
  const resolved = await resolveApprovalToken(raw);
  if (!resolved) throw new Error("This approval link is invalid or has expired.");
  const { token, content } = resolved;

  if (await isUnderLegalHold("content", content.id, content.companyId)) {
    throw new Error("This content is on hold and cannot be approved right now.");
  }
  // Idempotent + single-use: only content still pending approval can be acted
  // on. Once approved/rejected the link no longer changes anything.
  if (content.status !== "pending_approval") {
    throw new Error("This content is no longer awaiting approval.");
  }
  // TRUE single-use: the token is bound to THIS un-consumed share. content.status
  // alone is not enough — an internal edit legitimately re-opens an item to
  // pending_approval, and a stale token must NOT then re-approve a body the
  // client never saw. Require the share to be un-answered and for this client.
  assertShareIsLive(content, token);

  // The SAME governed pipeline an internal approver runs — never a bypass.
  const governed = await governContent(content, content.body);
  if (!canClientApproveRoute(governed.routedTo)) {
    throw new Error(
      `This item is routed to "${ROUTE_LABEL[governed.routedTo]}" and must be cleared by the agency's own reviewer before client sign-off.`,
    );
  }
  if (!governed.compliance.canProceed) {
    throw new Error("This item has open compliance issues and cannot be approved yet.");
  }

  const actor = clientActor(token);
  await updateContent(content.id, {
    ...governed,
    status: "approved",
    approvedById: actor.id,
    approvedAt: now(),
    clientReview: {
      ...content.clientReview!,
      status: "approved",
      respondedAt: now(),
    },
  });
  if (content.requestId) await advanceRequest(content.requestId, "approved", actor.id);
  if (content.campaignItemId) {
    await updateCampaignItem(content.campaignItemId, { status: "approved" });
    if (content.campaignId) await maybeCompleteCampaign(content.campaignId);
  }
  // Approving one variant archives its siblings (§24) — same as internal.
  if (content.variantGroupId) {
    for (const sibling of await listContent(token.tenantId)) {
      if (
        sibling.variantGroupId === content.variantGroupId &&
        sibling.id !== content.id &&
        !["approved", "published", "archived"].includes(sibling.status)
      ) {
        await updateContent(sibling.id, { status: "archived" });
      }
    }
  }
  await logAction(actor, "content.client_approved", {
    targetType: "content",
    targetId: content.id,
    companyId: content.companyId,
    detail: `Client ${token.clientEmail} approved (${ROUTE_LABEL[governed.routedTo]})`,
  });
  revalidatePath(`/approve/${raw}`);
  revalidatePath(`/content/${content.id}`);
  revalidatePath("/approvals");
}

// A client leaves a comment on the draft without approving/rejecting — feeds
// the same collaborative thread the internal team sees. Allowed while the share
// is live (un-answered) so a stale/expired token can't spam the thread.
export async function clientCommentAction(formData: FormData) {
  await assertPublicRate("client_approval", await clientIp());
  const raw = String(formData.get("token") || "");
  const body = String(formData.get("body") || "").trim();
  const resolved = await resolveApprovalToken(raw);
  if (!resolved) throw new Error("This approval link is invalid or has expired.");
  const { token, content } = resolved;
  if (!body) return;
  if (!content.clientReview || content.clientReview.status !== "pending" || content.clientReview.email !== token.clientEmail) {
    throw new Error("This approval link is no longer active.");
  }
  const actor = clientActor(token);
  await addContentComment({
    contentId: content.id,
    companyId: content.companyId,
    authorId: actor.id,
    authorName: token.clientEmail,
    authorKind: "client",
    body: body.slice(0, 2000),
  });
  await logAction(actor, "content.client_commented", {
    targetType: "content",
    targetId: content.id,
    companyId: content.companyId,
    detail: `Client ${token.clientEmail} commented`,
  });
  revalidatePath(`/approve/${raw}`);
  revalidatePath(`/content/${content.id}`);
}

export async function clientRequestChangesAction(formData: FormData) {
  await assertPublicRate("client_approval", await clientIp());
  const raw = String(formData.get("token") || "");
  const note = String(formData.get("note") || "").trim();
  const resolved = await resolveApprovalToken(raw);
  if (!resolved) throw new Error("This approval link is invalid or has expired.");
  const { token, content } = resolved;

  if (await isUnderLegalHold("content", content.id, content.companyId)) {
    throw new Error("This content is on hold and cannot be changed right now.");
  }
  if (content.status !== "pending_approval") {
    throw new Error("This content is no longer awaiting approval.");
  }
  assertShareIsLive(content, token);

  const actor = clientActor(token);
  await updateContent(content.id, {
    status: "changes_required",
    approvedById: null,
    approvedAt: null,
    clientReview: {
      ...content.clientReview!,
      status: "changes_requested",
      respondedAt: now(),
      note: note || undefined,
    },
  });
  if (content.requestId) {
    await advanceRequest(content.requestId, "changes_required", actor.id, note);
  }
  await logAction(actor, "content.client_changes_requested", {
    targetType: "content",
    targetId: content.id,
    companyId: content.companyId,
    detail: note ? `Client ${token.clientEmail}: ${note}` : `Client ${token.clientEmail} requested changes`,
  });
  revalidatePath(`/approve/${raw}`);
  revalidatePath(`/content/${content.id}`);
}
