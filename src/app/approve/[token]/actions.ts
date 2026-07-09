"use server";

import { revalidatePath } from "next/cache";
import {
  addContentComment,
  getCompany,
  getContent,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import { completeClientApproval } from "@/lib/client-approval";
import { assertPublicRate, clientIp } from "@/lib/ratelimit";
import { verifyPayload } from "@/lib/token";
import type { Company, ContentItem } from "@/lib/types";

export interface ApprovalToken {
  tenantId: string;
  companyId: string;
  contentId: string;
  clientEmail: string;
  purpose: string;
}

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

export async function clientApproveAction(formData: FormData) {
  await assertPublicRate("client_approval", await clientIp());
  const raw = String(formData.get("token") || "");
  const resolved = await resolveApprovalToken(raw);
  if (!resolved) throw new Error("This approval link is invalid or has expired.");
  const { token, content } = resolved;

  await completeClientApproval({
    contentId: content.id,
    actor: {
      kind: "token",
      token: raw,
      clientEmail: token.clientEmail,
      tenantId: token.tenantId,
      companyId: token.companyId,
    },
    decision: "approved",
  });

  revalidatePath(`/approve/${raw}`);
  revalidatePath(`/content/${content.id}`);
  revalidatePath("/approvals");
}

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

  await completeClientApproval({
    contentId: content.id,
    actor: {
      kind: "token",
      token: raw,
      clientEmail: token.clientEmail,
      tenantId: token.tenantId,
      companyId: token.companyId,
    },
    decision: "changes_requested",
    note: note || undefined,
  });

  revalidatePath(`/approve/${raw}`);
  revalidatePath(`/content/${content.id}`);
}
