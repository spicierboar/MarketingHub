import type {
  ContentItem,
  ManagedApprovalRequest,
  ScheduledPost,
} from "@/lib/types";
import { CLIENT_REVISION_LIMIT, MANAGED_CHANNEL_LABELS } from "./workflow";

const CLIENT_FORBIDDEN_WORDS =
  /\b(ai|artificial intelligence|model(?:s)?|provider(?:s)?|prompt(?:s)?|generat(?:e|ed|es|ing|ion))\b/i;

export type ClientApprovalSummary = {
  purpose: string;
  channels: string[];
  scheduledFor: string | null;
  revisionsRemaining: number;
  scopeLabel: string;
};

function approvalScopeLabel(
  scope: ManagedApprovalRequest["scope"] | undefined,
): string {
  switch (scope) {
    case "paid_creative":
      return "Paid campaign creative";
    case "paid_budget_targeting":
      return "Audience and budget";
    default:
      return "Campaign content";
  }
}

export function clientApprovalSummary(args: {
  content: ContentItem;
  posts?: ScheduledPost[];
  request?: ManagedApprovalRequest;
}): ClientApprovalSummary {
  const matching = (args.posts ?? []).filter(
    (post) => post.contentId === args.content.id && post.status !== "cancelled",
  );
  const channels = Array.from(
    new Set([
      ...matching.map((post) => post.platform),
      ...(args.content.managedChannelKey
        ? [MANAGED_CHANNEL_LABELS[args.content.managedChannelKey]]
        : []),
    ]),
  );
  const firstPost = matching.sort((a, b) =>
    `${a.scheduledDate}${a.scheduledTime ?? ""}`.localeCompare(
      `${b.scheduledDate}${b.scheduledTime ?? ""}`,
    ),
  )[0];
  const round = args.request?.revisionRound ?? 0;

  return {
    purpose: args.content.title,
    channels: channels.length ? channels : ["Channel shown after scheduling"],
    scheduledFor: firstPost
      ? `${firstPost.scheduledDate}${firstPost.scheduledTime ? ` at ${firstPost.scheduledTime}` : ""}`
      : null,
    revisionsRemaining: Math.max(0, CLIENT_REVISION_LIMIT - round),
    scopeLabel: approvalScopeLabel(args.request?.scope),
  };
}

export function containsClientForbiddenWording(value: string): boolean {
  return CLIENT_FORBIDDEN_WORDS.test(value);
}

export const CLIENT_ROLE_LABEL = "Approver";
export const STAFF_ROLE_LABEL = "Staff";
export const ADMIN_ROLE_LABEL = "Admin";
