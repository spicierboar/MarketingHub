import { z } from "zod";
import { MANAGED_CHANNELS } from "@/lib/types";

const Identifier = z.string().trim().min(1).max(200);
const ManagedChannelSchema = z.enum(MANAGED_CHANNELS);

/** Caller intent only. Tenant, strategy, quota, channels and rights are derived. */
export const StaffManagedContentJobRequestSchema = z
  .object({
    companyId: Identifier,
    requestId: Identifier,
    conceptId: Identifier,
    plannedSlotId: Identifier,
    assetIds: z.array(Identifier).max(100).default([]),
    brief: z.string().trim().min(1).max(20_000),
  })
  .strict();

export const ManagedAssetReferenceSchema = z
  .object({
    assetId: Identifier,
    rightsConfirmed: z.literal(true),
    usageRights: z.string().trim().min(1).max(500),
    instructions: z.string().trim().max(2_000).optional(),
  })
  .strict();

export const SubmitManagedContentJobInputSchema = z
  .object({
    tenantId: Identifier,
    companyId: Identifier,
    requestId: Identifier,
    conceptId: Identifier,
    strategyCycleId: Identifier.nullish(),
    packagePeriod: z.string().trim().min(1).max(50),
    theme: z.string().trim().min(1).max(500),
    brief: z.string().trim().min(1).max(20_000),
    strategyContext: z.record(z.string(), z.unknown()),
    channels: z.array(ManagedChannelSchema).min(1).max(20),
    assetReferences: z.array(ManagedAssetReferenceSchema).max(100).default([]),
    plannedPublishAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.channels).size !== value.channels.length) {
      ctx.addIssue({
        code: "custom",
        path: ["channels"],
        message: "channels must be unique",
      });
    }
  });

const AttemptSchema = z
  .object({
    status: z.string(),
    at: z.string().datetime({ offset: true }),
    attempt: z.number().int().positive(),
    error: z.string().optional(),
  })
  .passthrough();

const CallbackDeliverySchema = z
  .object({
    eventId: Identifier,
    eventType: z.string(),
    status: z.string(),
  })
  .passthrough();

export const ManagedJobResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    primaryConcept: z
      .object({
        title: z.string().trim().min(1).max(2_000),
        narrative: z.string().trim().min(1).max(100_000),
      })
      .strict(),
    channelAdaptations: z
      .array(
        z
          .object({
            channel: ManagedChannelSchema,
            content: z.string().trim().min(1).max(100_000),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    visualMetadata: z.array(ManagedAssetReferenceSchema).max(100),
    plannedPublishAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const ManagedJobDataSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    jobId: Identifier,
    organisationId: Identifier,
    companyId: Identifier,
    commandCentreRequestId: Identifier,
    status: z.enum([
      "accepted",
      "queued",
      "processing",
      "ready",
      "paused",
      "failed",
    ]),
    attempts: z.number().int().nonnegative(),
    timestamps: z
      .object({
        acceptedAt: z.string().datetime({ offset: true }),
        updatedAt: z.string().datetime({ offset: true }),
        startedAt: z.string().datetime({ offset: true }).optional(),
        completedAt: z.string().datetime({ offset: true }).optional(),
      })
      .strict(),
    plannedPublishAt: z.string().datetime({ offset: true }),
    statusHistory: z.array(AttemptSchema),
    callbackDeliveries: z.array(CallbackDeliverySchema),
    result: ManagedJobResultSchema.optional(),
    error: z
      .object({
        code: Identifier,
        message: z.string().trim().min(1).max(20_000),
      })
      .strict()
      .optional(),
  })
  .strict();

export const ManagedContentEventSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    eventId: Identifier,
    type: z.enum([
      "request.accepted",
      "content.processing",
      "content.ready",
      "content.failed",
    ]),
    occurredAt: z.string().datetime({ offset: true }),
    data: ManagedJobDataSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const expectedStatus = {
      "request.accepted": ["accepted", "queued"],
      "content.processing": ["processing"],
      "content.ready": ["ready"],
      "content.failed": ["paused", "failed"],
    }[value.type];
    if (!expectedStatus.includes(value.data.status)) {
      ctx.addIssue({
        code: "custom",
        path: ["data", "status"],
        message: `status ${value.data.status} is invalid for ${value.type}`,
      });
    }
    if (value.type === "content.ready" && !value.data.result) {
      ctx.addIssue({
        code: "custom",
        path: ["data", "result"],
        message: "ready events require a result",
      });
    }
    if (value.type === "content.failed" && !value.data.error) {
      ctx.addIssue({
        code: "custom",
        path: ["data", "error"],
        message: "failed events require an error",
      });
    }
  });

export type SubmitManagedContentJobInput = z.infer<
  typeof SubmitManagedContentJobInputSchema
>;
export type StaffManagedContentJobRequest = z.infer<
  typeof StaffManagedContentJobRequestSchema
>;
export type ManagedContentEvent = z.infer<typeof ManagedContentEventSchema>;
export type ManagedJobData = z.infer<typeof ManagedJobDataSchema>;
