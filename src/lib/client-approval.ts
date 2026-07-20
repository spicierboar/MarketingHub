// Client approval pipeline — shared by token route (/approve) and portal UI (M17).

import {
  advanceRequest,
  getCompany,
  getContent,
  isUnderLegalHold,
  listContent,
  listManagedApprovalRequests,
  maybeCompleteCampaign,
  respondManagedApprovalAsClient,
  respondManagedApprovalWithToken,
  updateCampaignItem,
  updateContent,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import { canAccessCompany } from "@/lib/auth/rbac";
import { autoPublishOnApprove } from "@/lib/auto-publish-on-approve";
import { governContent } from "@/lib/content-governance";
import { canClientApproveRoute, ROUTE_LABEL } from "@/lib/routing";
import { now } from "@/lib/utils";
import { hashApprovalToken, nextRevisionRoute } from "@/lib/managed-service/workflow";
import type { ActingUser, ManagedApprovalRequest } from "@/lib/types";

export type ClientApprovalActor =
  | {
      kind: "token";
      token: string;
      clientEmail: string;
      tenantId: string;
      companyId: string;
    }
  | {
      kind: "portal";
      user: ActingUser;
      companyId: string;
    };

export type ClientApprovalDecision = "approved" | "changes_requested";

export type ClientApprovalResult = {
  ok: true;
  autoPublish?: "scheduled" | "published" | "skipped" | "blocked";
};

function approvalActor(actor: ClientApprovalActor): {
  id: string;
  email: string;
  tenantId: string;
} {
  if (actor.kind === "token") {
    return {
      id: `client:${actor.clientEmail}`,
      email: actor.clientEmail,
      tenantId: actor.tenantId,
    };
  }
  return {
    id: actor.user.id,
    email: actor.user.email,
    tenantId: actor.user.tenantId,
  };
}

async function assertCanAct(
  contentId: string,
  actor: ClientApprovalActor,
): Promise<{
  content: NonNullable<Awaited<ReturnType<typeof getContent>>>;
  company: NonNullable<Awaited<ReturnType<typeof getCompany>>>;
  logActor: ReturnType<typeof approvalActor>;
  durableRequest?: ManagedApprovalRequest;
}> {
  const content = await getContent(contentId);
  if (!content) throw new Error("Content not found");

  const companyId = actor.kind === "token" ? actor.companyId : actor.companyId;
  if (content.companyId !== companyId) {
    throw new Error("Forbidden: content does not belong to this company");
  }

  const company = await getCompany(content.companyId);
  if (!company) throw new Error("Company not found");
  let durableRequest: ManagedApprovalRequest | undefined;

  if (actor.kind === "token") {
    if (company.tenantId !== actor.tenantId) {
      throw new Error("This approval link is invalid or has expired.");
    }
    const review = content.clientReview;
    if (
      !review ||
      review.status !== "pending" ||
      review.email !== actor.clientEmail
    ) {
      throw new Error(
        "This approval link has already been used or has been superseded — please ask for a fresh link.",
      );
    }
    const durable = (await listManagedApprovalRequests(actor.tenantId, actor.companyId))
      .filter((request) => request.contentId === content.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const pendingDurable = durable.find((request) => request.status === "pending");
    if (
      durable.length > 0 &&
      (!pendingDurable ||
        pendingDurable.recipientEmail !== actor.clientEmail)
    ) {
      throw new Error("This approval link is invalid, expired or superseded.");
    }
    durableRequest = pendingDurable;
  } else {
    if (!(await canAccessCompany(actor.user, actor.companyId))) {
      throw new Error("Forbidden: no access to this company");
    }
    if (content.clientReview?.status !== "pending") {
      throw new Error("This item is not awaiting your approval.");
    }
    if (
      content.clientReview.email.toLowerCase() !==
      actor.user.email.toLowerCase()
    ) {
      throw new Error(
        "This item was shared with a different contact on your account.",
      );
    }
  }

  if (await isUnderLegalHold("content", content.id, content.companyId)) {
    throw new Error("This content is on hold and cannot be approved right now.");
  }

  if (content.status !== "pending_approval") {
    throw new Error("This content is no longer awaiting approval.");
  }

  durableRequest ??= (await listManagedApprovalRequests(company.tenantId, company.id))
    .filter((request) => request.contentId === content.id && request.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return { content, company, logActor: approvalActor(actor), durableRequest };
}

export async function completeClientApproval(args: {
  contentId: string;
  actor: ClientApprovalActor;
  decision: ClientApprovalDecision;
  note?: string;
}): Promise<ClientApprovalResult> {
  const { content, company, logActor, durableRequest } = await assertCanAct(
    args.contentId,
    args.actor,
  );

  if (args.decision === "changes_requested") {
    const revision = durableRequest ? nextRevisionRoute(durableRequest) : null;
    if (durableRequest) {
      if (args.actor.kind === "portal") {
        if (
          !(await respondManagedApprovalAsClient(
            durableRequest.id,
            "changes_requested",
          ))
        ) {
          throw new Error("This approval is no longer available.");
        }
      } else if (
        !(await respondManagedApprovalWithToken(
          hashApprovalToken(args.actor.token),
          company.id,
          "changes_requested",
          { note: args.note?.trim() || null, contentId: content.id },
        ))
      ) {
        throw new Error("This approval link is invalid, expired, superseded, or has used both revisions.");
      }
    }
    await updateContent(content.id, {
      status: revision?.route === "staff_exception" ? "pending_approval" : "changes_required",
      approvedById: null,
      approvedAt: null,
      clientReview: {
        ...content.clientReview!,
        status: "changes_requested",
        respondedAt: now(),
        note: args.note || undefined,
      },
    });
    if (content.requestId) {
      await advanceRequest(
        content.requestId,
        "changes_required",
        logActor.id,
        args.note,
      );
    }
    await logAction(logActor, "content.client_changes_requested", {
      targetType: "content",
      targetId: content.id,
      companyId: content.companyId,
      tenantId: logActor.tenantId,
      detail: revision?.route === "staff_exception"
        ? "Third revision request routed to staff exception review"
        : args.note
        ? `Client ${logActor.email}: ${args.note}`
        : `Client ${logActor.email} requested changes`,
    });
    return { ok: true };
  }

  const governed = await governContent(content, content.body);
  if (!canClientApproveRoute(governed.routedTo)) {
    throw new Error(
      `This item is routed to "${ROUTE_LABEL[governed.routedTo]}" and must be cleared by the agency's own reviewer before client sign-off.`,
    );
  }
  if (!governed.compliance.canProceed) {
    throw new Error("This item has open compliance issues and cannot be approved yet.");
  }

  // Durable ACK first — never mark content approved if the managed request
  // is already gone (avoids approved content with a failed client response).
  if (durableRequest) {
    if (args.actor.kind === "portal") {
      if (
        !(await respondManagedApprovalAsClient(
          durableRequest.id,
          "approved",
        ))
      ) {
        throw new Error("This approval is no longer available.");
      }
    } else if (
      !(await respondManagedApprovalWithToken(
        hashApprovalToken(args.actor.token),
        company.id,
        "approved",
        { contentId: content.id },
      ))
    ) {
      throw new Error("This approval link is invalid, expired or superseded.");
    }
  }

  await updateContent(content.id, {
    ...governed,
    status: "approved",
    approvedById: logActor.id,
    approvedAt: now(),
    clientReview: {
      ...content.clientReview!,
      status: "approved",
      respondedAt: now(),
    },
  });

  if (content.requestId) {
    await advanceRequest(content.requestId, "approved", logActor.id);
  }
  if (content.campaignItemId) {
    await updateCampaignItem(content.campaignItemId, { status: "approved" });
    if (content.campaignId) await maybeCompleteCampaign(content.campaignId);
  }
  if (content.variantGroupId) {
    const tenantId = logActor.tenantId;
    for (const sibling of await listContent(tenantId)) {
      if (
        sibling.variantGroupId === content.variantGroupId &&
        sibling.id !== content.id &&
        !["approved", "published", "archived"].includes(sibling.status)
      ) {
        await updateContent(sibling.id, { status: "archived" });
      }
    }
  }

  await logAction(logActor, "content.client_approved", {
    targetType: "content",
    targetId: content.id,
    companyId: content.companyId,
    tenantId: logActor.tenantId,
    detail: `Client ${logActor.email} approved (${ROUTE_LABEL[governed.routedTo]})`,
  });

  const autoPublish = await autoPublishOnApprove({
    content: { ...content, status: "approved" },
    company,
    userId: logActor.id,
    actorEmail: logActor.email,
    tenantId: logActor.tenantId,
  });

  return { ok: true, autoPublish };
}
