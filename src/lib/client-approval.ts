// Client approval pipeline — M18 implements; M17 portal UI imports this API.
// Token route (approve/[token]) will be wired by M18 to completeClientApproval().

import type { ActingUser } from "@/lib/types";

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

/** Govern content → update status → autoPublishOnApprove() — shipped in M18. */
export async function completeClientApproval(_args: {
  contentId: string;
  actor: ClientApprovalActor;
  decision: ClientApprovalDecision;
  note?: string;
}): Promise<ClientApprovalResult> {
  throw new Error("completeClientApproval is not implemented yet — M18 ships the engine");
}
