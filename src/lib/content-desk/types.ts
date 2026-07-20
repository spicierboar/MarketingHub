import { z } from "zod";
import { MANAGED_CHANNELS } from "@/lib/types";

export type RiskLevel = "critical" | "high" | "medium" | "low";
export type OperationsMetricKey =
  | "profile_confirmation"
  | "strategy_due"
  | "calendar_coverage"
  | "content_due"
  | "jobs_processing"
  | "jobs_failed"
  | "approvals_overdue"
  | "publishing_failures"
  | "payment_pauses"
  | "paid_budget_risks";

export interface OperationsOverview {
  generatedAt: string;
  totalClients: number;
  metrics: Array<{
    key: OperationsMetricKey;
    label: string;
    count: number;
    denominator?: number;
    detail: string;
    risk: RiskLevel;
  }>;
  queue: Array<{
    id: string;
    companyId: string;
    clientName: string;
    kind: OperationsMetricKey;
    risk: RiskLevel;
    summary: string;
    dueAt?: string | null;
    nextAction: string;
  }>;
  clients: Array<{
    id: string;
    name: string;
    industry?: string | null;
    serviceMode: "automated" | "staff_directed";
    profileConfirmed: boolean;
    strategyStatus:
      "draft" | "client_review" | "approved" | "superseded" | "missing";
    calendarCoverageDays: number;
    openRiskCount: number;
  }>;
}

export interface ClientWorkspace {
  companyId: string;
  profile: {
    name: string;
    industry?: string | null;
    timezone: string;
    contactEmail?: string | null;
    profileConfirmedAt?: string | null;
    goals: string[];
    locations: string[];
    seasonalInputs: string[];
  };
  strategy?: {
    id: string;
    quarterStart: string;
    status: "draft" | "client_review" | "approved" | "superseded";
    mode: "automated" | "staff_directed";
    guardrails: {
      channels: string[];
      themes: string[];
      publishWindows: string[];
    };
    approvedAt?: string | null;
    updatedAt: string;
  } | null;
  plan: {
    packageId: string;
    billingStatus: string;
    conceptsAllowed: number;
    conceptsUsed: number;
    channels: string[];
    monthlyAdCapAud: number;
  };
  schedule: Array<{
    id: string;
    conceptId: string;
    adaptationId: string;
    channel: string;
    plannedPublishAt: string;
    finalContentDueAt: string;
    status:
      "planned" | "awaiting_approval" | "approved" | "scheduled" | "cancelled";
    explicit: true;
  }>;
  concepts: Array<{
    id: string;
    title: string;
    theme: string;
    status: string;
    visualState: "ready" | "missing" | "rights_required" | "expired";
    adaptations: Array<{
      id: string;
      channel: string;
      status: "draft" | "ready" | "approved" | "superseded";
    }>;
  }>;
  approvals: Array<{
    id: string;
    scope: "standard_content" | "paid_creative" | "paid_budget_targeting";
    status:
      "pending" | "approved" | "changes_requested" | "superseded" | "expired";
    dueAt: string;
    revisionRound: 0 | 1 | 2;
  }>;
  publications: Array<{
    id: string;
    slotId: string;
    channel: string;
    status:
      | "planned"
      | "scheduled"
      | "publishing"
      | "delivery_unknown"
      | "published"
      | "failed";
    lastError?: string | null;
  }>;
  jobs: Array<{
    id: string;
    conceptId: string;
    status:
      | "submitting"
      | "submit_failed"
      | "accepted"
      | "queued"
      | "processing"
      | "ready"
      | "paused"
      | "failed"
      | "poll_exhausted";
    pollAttempts: number;
    updatedAt: string;
    lastError?: string | null;
    provenance?: Record<string, unknown> | null;
  }>;
  audit: Array<{
    id: string;
    action: string;
    actorEmail: string;
    detail?: string | null;
    createdAt: string;
  }>;
}

const NonEmptyText = z.string().trim().min(1).max(500);
export const StrategyMutationSchema = z
  .object({
    kind: z.literal("strategy"),
    guardrails: z
      .object({
        channels: z
          .array(z.enum(MANAGED_CHANNELS))
          .min(1)
          .max(MANAGED_CHANNELS.length),
        themes: z.array(NonEmptyText).min(1).max(50),
        publishWindows: z.array(NonEmptyText).min(1).max(50),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const key of ["channels", "themes", "publishWindows"] as const) {
      if (
        new Set(value.guardrails[key]).size !== value.guardrails[key].length
      ) {
        context.addIssue({
          code: "custom",
          path: ["guardrails", key],
          message: `${key} must be unique`,
        });
      }
    }
  });

export const ModeMutationSchema = z
  .object({
    kind: z.literal("mode"),
    mode: z.enum(["automated", "staff_directed"]),
  })
  .strict();

export const RegenerateMutationSchema = z
  .object({
    kind: z.literal("regenerate"),
    conceptId: z.string().trim().min(1).max(200),
  })
  .strict();
