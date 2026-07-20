import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { logAction } from "@/lib/audit";
import {
  createContent,
  createManagedChannelAdaptation,
  createManagedContentConcept,
  createManagedPlannedSlot,
  getCompany,
  getTenant,
  listAssetsForCompany,
  listContent,
  listManagedChannelAdaptations,
  listManagedContentConcepts,
  listManagedPlannedSlots,
  listManagedStrategyCycles,
  updateContent,
  updateManagedChannelAdaptation,
  updateManagedContentConcept,
} from "@/lib/db";
import type {
  ActingUser,
  ManagedChannelKey,
  ManagedStrategyCycle,
  RequestType,
} from "@/lib/types";
import { resolveCompanyPackage } from "@/lib/marketing-packages";
import { liveIntegrationsAllowed } from "@/lib/env";
import {
  consumedConceptUnits,
  strategyInputsConfirmed,
} from "@/lib/managed-service/workflow";
import { serviceOperationsAllowed } from "@/lib/managed-service-billing";
import { runInServiceContext } from "@/lib/db/service-context";
import {
  ManagedContentEventSchema,
  ManagedJobDataSchema,
  SubmitManagedContentJobInputSchema,
  type ManagedContentEvent,
  type ManagedJobData,
  type SubmitManagedContentJobInput,
  type StaffManagedContentJobRequest,
} from "./schemas";
import {
  claimManagedEvent,
  completeManagedEvent,
  createManagedJob,
  createManagedJobException,
  getManagedJobByExternalId,
  listDueManagedJobs,
  renewManagedEventLease,
  updateManagedJob,
  type ManagedContentJobRecord,
} from "./repository";

const CONTRACT_VERSION = "1.0" as const;

export class ManagedContentContractError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function envPositiveInt(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function enabled(name: string): boolean {
  return ["1", "true", "yes", "on"].includes(
    (process.env[name] ?? "").trim().toLowerCase(),
  );
}

export function managedContentJobsLive(): boolean {
  return (
    enabled("CONTENT_ENGINE_MANAGED_JOBS_LIVE") && liveIntegrationsAllowed()
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: string, length = 64): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

export function managedContentIdempotencyKey(
  input: Pick<
    SubmitManagedContentJobInput,
    "tenantId" | "companyId" | "requestId" | "conceptId"
  >,
): string {
  return `cc_${digest(
    [
      CONTRACT_VERSION,
      input.tenantId,
      input.companyId,
      input.requestId,
      input.conceptId,
    ].join("\0"),
    48,
  )}`;
}

export function signManagedContentEvent(
  secret: string,
  timestamp: string,
  eventId: string,
  rawBody: string,
): string {
  return `v1=${createHmac("sha256", secret)
    .update(`${timestamp}.${eventId}.${rawBody}`)
    .digest("hex")}`;
}

export function verifyManagedContentEventSignature(args: {
  secret: string;
  timestamp: string;
  eventId: string;
  rawBody: string;
  signature: string;
  nowMs?: number;
  replayWindowSeconds?: number;
}): boolean {
  const timestampSeconds = Number(args.timestamp);
  if (!Number.isInteger(timestampSeconds) || timestampSeconds < 0) return false;
  const nowSeconds = Math.floor((args.nowMs ?? Date.now()) / 1_000);
  const replayWindow =
    args.replayWindowSeconds ??
    envPositiveInt("MANAGED_CONTENT_CALLBACK_REPLAY_WINDOW_SECONDS", 300);
  if (Math.abs(nowSeconds - timestampSeconds) > replayWindow) return false;
  const expected = signManagedContentEvent(
    args.secret,
    args.timestamp,
    args.eventId,
    args.rawBody,
  );
  const actualBuffer = Buffer.from(args.signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

type CallbackSelector =
  { callbackTarget: "command-centre" } | { callbackUrl: string };

function validatedCallbackUrl(value: string): string {
  let target: URL;
  try {
    target = new URL(value);
  } catch {
    throw new ManagedContentContractError(
      "Managed-content callback URL is invalid",
      503,
    );
  }
  if (target.username || target.password || target.hash) {
    throw new ManagedContentContractError(
      "Managed-content callback URL must not contain credentials or a fragment",
      503,
    );
  }
  if (
    target.protocol !== "https:" &&
    !(process.env.NODE_ENV !== "production" && target.protocol === "http:")
  ) {
    throw new ManagedContentContractError(
      "Managed-content callback URL must use HTTPS",
      503,
    );
  }
  return target.toString();
}

function callbackSelector(): CallbackSelector {
  const configuredTarget = process.env.CONTENT_ENGINE_CALLBACK_TARGET?.trim();
  const explicit = process.env.CONTENT_ENGINE_CALLBACK_URL?.trim();
  if (configuredTarget && explicit) {
    throw new ManagedContentContractError(
      "Configure exactly one of CONTENT_ENGINE_CALLBACK_TARGET or CONTENT_ENGINE_CALLBACK_URL",
      503,
    );
  }
  if (configuredTarget) {
    if (configuredTarget !== "command-centre") {
      throw new ManagedContentContractError(
        "CONTENT_ENGINE_CALLBACK_TARGET must be command-centre",
        503,
      );
    }
    return { callbackTarget: "command-centre" };
  }
  if (explicit) return { callbackUrl: validatedCallbackUrl(explicit) };
  const origin = process.env.COMMAND_CENTRE_PUBLIC_URL?.trim();
  if (!origin) {
    throw new ManagedContentContractError(
      "CONTENT_ENGINE_CALLBACK_TARGET, CONTENT_ENGINE_CALLBACK_URL, or COMMAND_CENTRE_PUBLIC_URL is required",
      503,
    );
  }
  let callback: string;
  try {
    callback = new URL("/api/content-engine/events", origin).toString();
  } catch {
    throw new ManagedContentContractError(
      "COMMAND_CENTRE_PUBLIC_URL is invalid",
      503,
    );
  }
  return { callbackUrl: validatedCallbackUrl(callback) };
}

function endpoint(path: string): string {
  const base = process.env.CONTENT_ENGINE_BASE_URL?.trim();
  if (!base) {
    throw new ManagedContentContractError(
      "CONTENT_ENGINE_BASE_URL is required for live managed-content jobs",
      503,
    );
  }
  return new URL(path, base.endsWith("/") ? base : `${base}/`).toString();
}

function contentEngineHeaders(): HeadersInit {
  const apiKey = process.env.CONTENT_ENGINE_API_KEY?.trim();
  if (!apiKey) {
    throw new ManagedContentContractError(
      "CONTENT_ENGINE_API_KEY is required for live managed-content jobs",
      503,
    );
  }
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
  };
}

async function contentEngineFetch(
  fetcher: typeof fetch,
  input: string,
  init: RequestInit,
): Promise<Response> {
  if (!managedContentJobsLive()) {
    throw new ManagedContentContractError(
      "Live Content Engine requests are not allowed in this runtime",
      503,
    );
  }
  return fetcher(input, init);
}

function nextPollAt(atMs = Date.now(), attempts = 0): string {
  const baseMs = envPositiveInt("MANAGED_CONTENT_POLL_BASE_MS", 60_000);
  const maxMs = envPositiveInt("MANAGED_CONTENT_POLL_MAX_MS", 15 * 60_000);
  return new Date(atMs + Math.min(baseMs * 2 ** attempts, maxMs)).toISOString();
}

function currentApprovedStrategy(
  cycles: ManagedStrategyCycle[],
): ManagedStrategyCycle | undefined {
  return cycles
    .filter(
      (cycle) =>
        cycle.status === "approved" &&
        Boolean(cycle.approvedAt) &&
        !cycle.supersededAt,
    )
    .sort((left, right) =>
      (right.approvedAt ?? "").localeCompare(left.approvedAt ?? ""),
    )[0];
}

function publicJob(job: ManagedContentJobRecord) {
  return {
    id: job.id,
    tenantId: job.tenantId,
    companyId: job.companyId,
    requestId: job.requestId,
    conceptId: job.conceptId,
    externalJobId: job.externalJobId,
    status: job.status,
    schemaVersion: job.schemaVersion,
    pollAttempts: job.pollAttempts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function submitManagedContentJob(
  unparsed: SubmitManagedContentJobInput,
  options: {
    fetcher?: typeof fetch;
    live?: boolean;
    nowMs?: number;
  } = {},
) {
  const input = SubmitManagedContentJobInputSchema.parse(unparsed);
  const company = await getCompany(input.companyId);
  if (
    !company ||
    company.status === "archived" ||
    company.tenantId !== input.tenantId
  ) {
    throw new ManagedContentContractError(
      "Company does not belong to tenant",
      404,
    );
  }
  const approvedStrategy = currentApprovedStrategy(
    await listManagedStrategyCycles(input.tenantId, input.companyId),
  );
  if (
    !input.strategyCycleId ||
    input.strategyCycleId !== approvedStrategy?.id
  ) {
    throw new ManagedContentContractError(
      "Managed-content jobs require the company's approved current strategy",
      409,
    );
  }
  const idempotencyKey = managedContentIdempotencyKey(input);
  const selector = callbackSelector();
  const requestPayload = {
    schemaVersion: CONTRACT_VERSION,
    organisationId: input.tenantId,
    companyId: input.companyId,
    commandCentreRequestId: input.requestId,
    idempotencyKey,
    brief: input.brief,
    strategyContext: {
      ...input.strategyContext,
      commandCentreConceptId: input.conceptId,
      ...(input.strategyCycleId
        ? { commandCentreStrategyCycleId: input.strategyCycleId }
        : {}),
    },
    channels: input.channels,
    assetReferences: input.assetReferences,
    plannedPublishAt: input.plannedPublishAt,
    ...selector,
  };
  const requestFingerprint = digest(stableJson(requestPayload));
  const localId = `ccmj_${digest(`${input.tenantId}\0${idempotencyKey}`, 32)}`;
  const created = await createManagedJob({
    id: localId,
    tenantId: input.tenantId,
    companyId: input.companyId,
    requestId: input.requestId,
    conceptId: input.conceptId,
    strategyCycleId: input.strategyCycleId,
    idempotencyKey,
    requestFingerprint,
    request: input,
    schemaVersion: CONTRACT_VERSION,
    callbackUrl: "callbackUrl" in selector ? selector.callbackUrl : null,
    callbackTarget:
      "callbackTarget" in selector ? selector.callbackTarget : null,
    status: "submitting",
    pollAttempts: 0,
  });
  if (created.existing) {
    if (created.job.requestFingerprint !== requestFingerprint) {
      throw new ManagedContentContractError(
        "The immutable idempotency key was already used with a different payload",
        409,
      );
    }
    if (created.job.externalJobId) {
      return { job: publicJob(created.job), idempotentReplay: true };
    }
  }

  const liveRequested = options.live ?? managedContentJobsLive();
  const live = liveRequested && liveIntegrationsAllowed();
  if (!live) {
    const simulated = await updateManagedJob(localId, {
      externalJobId: `sim_${digest(idempotencyKey, 32)}`,
      status: "accepted",
      nextPollAt: null,
      privateProvenance: {
        contractVersion: CONTRACT_VERSION,
        transport: "simulated",
        submittedAt: new Date(options.nowMs ?? Date.now()).toISOString(),
      },
    });
    return {
      job: publicJob(simulated),
      idempotentReplay: false,
      simulated: true,
    };
  }

  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await contentEngineFetch(
      fetcher,
      endpoint(`/v1/orgs/${encodeURIComponent(input.tenantId)}/content-jobs`),
      {
        method: "POST",
        headers: contentEngineHeaders(),
        body: JSON.stringify(requestPayload),
        redirect: "error",
        signal: AbortSignal.timeout(
          envPositiveInt("CONTENT_ENGINE_REQUEST_TIMEOUT_MS", 10_000),
        ),
      },
    );
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        typeof body.error === "object"
          ? JSON.stringify(body.error)
          : `Content Engine returned HTTP ${response.status}`,
      );
    }
    if (
      body.schemaVersion !== CONTRACT_VERSION ||
      typeof body.jobId !== "string" ||
      typeof body.statusUrl !== "string"
    ) {
      throw new Error("Content Engine returned an invalid acceptance response");
    }
    const accepted = await updateManagedJob(localId, {
      externalJobId: body.jobId,
      externalStatusUrl: endpoint(
        `/v1/orgs/${encodeURIComponent(input.tenantId)}/content-jobs/${encodeURIComponent(body.jobId)}`,
      ),
      status: "accepted",
      nextPollAt: nextPollAt(options.nowMs),
      lastError: null,
      privateProvenance: {
        contractVersion: CONTRACT_VERSION,
        transport: "content-engine",
        submittedAt: new Date(options.nowMs ?? Date.now()).toISOString(),
      },
    });
    return {
      job: publicJob(accepted),
      idempotentReplay: Boolean(body.idempotentReplay),
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Managed content submission failed";
    await updateManagedJob(localId, {
      status: "submit_failed",
      lastError: message,
    });
    throw new ManagedContentContractError(message, 502);
  }
}

export async function submitManagedContentJobForStaff(
  actor: ActingUser,
  intent: StaffManagedContentJobRequest,
  options: Parameters<typeof submitManagedContentJob>[1] = {},
) {
  const company = await getCompany(intent.companyId);
  if (
    !company ||
    company.status === "archived" ||
    company.tenantId !== actor.tenantId
  ) {
    throw new ManagedContentContractError("Company not found", 404);
  }
  const managed = company.profile.managedService;
  if (!serviceOperationsAllowed(managed?.serviceBilling)) {
    throw new ManagedContentContractError(
      "Managed service is not entitled while payment is unresolved",
      409,
    );
  }
  const cycles = await listManagedStrategyCycles(actor.tenantId, company.id);
  const strategy = currentApprovedStrategy(cycles);
  if (!strategy || !strategyInputsConfirmed(strategy)) {
    throw new ManagedContentContractError(
      "An approved current strategy is required",
      409,
    );
  }
  const concepts = await listManagedContentConcepts(actor.tenantId, company.id);
  const concept = concepts.find((item) => item.id === intent.conceptId);
  if (!concept || concept.strategyCycleId !== strategy.id) {
    throw new ManagedContentContractError(
      "Concept does not belong to the approved current strategy",
      409,
    );
  }
  if (!strategy.guardrails.themes.includes(concept.theme)) {
    throw new ManagedContentContractError(
      "Concept theme is outside approved strategy guardrails",
      409,
    );
  }
  const tenant = await getTenant(actor.tenantId);
  const entitlement = resolveCompanyPackage(company, tenant);
  const periodConcepts = concepts.filter(
    (item) => item.packagePeriod === concept.packagePeriod,
  );
  if (
    !concept.quotaConsumedAt ||
    consumedConceptUnits(periodConcepts) > entitlement.campaignConceptsPerMonth
  ) {
    throw new ManagedContentContractError(
      "Managed-content concept quota is unavailable",
      409,
    );
  }
  const slot = (await listManagedPlannedSlots(actor.tenantId, company.id)).find(
    (item) =>
      item.id === intent.plannedSlotId &&
      item.conceptId === concept.id &&
      item.status !== "cancelled",
  );
  if (!slot) {
    throw new ManagedContentContractError(
      "An explicit planned slot for the concept is required",
      409,
    );
  }
  const adaptation = (
    await listManagedChannelAdaptations(actor.tenantId, concept.id)
  ).find((item) => item.id === slot.adaptationId);
  if (
    !adaptation ||
    !strategy.guardrails.channels.includes(adaptation.channelKey)
  ) {
    throw new ManagedContentContractError(
      "Planned slot channel is outside approved strategy guardrails",
      409,
    );
  }
  const requestedAssetIds = new Set(intent.assetIds);
  if (concept.reusableAssetId) requestedAssetIds.add(concept.reusableAssetId);
  const assets = (await listAssetsForCompany(company.id)).filter((asset) =>
    requestedAssetIds.has(asset.id),
  );
  if (assets.length !== requestedAssetIds.size) {
    throw new ManagedContentContractError(
      "One or more assets are unavailable",
      409,
    );
  }
  const atDate = new Date().toISOString().slice(0, 10);
  for (const asset of assets) {
    const rights = asset.usageRights;
    const allowed =
      rights.allowedChannels.length === 0 ||
      rights.allowedChannels.includes(adaptation.channelKey);
    if (
      asset.status !== "approved" ||
      !rights.consentObtained ||
      !allowed ||
      (rights.expiryDate && rights.expiryDate <= atDate) ||
      (asset.source === "upload" &&
        (!asset.rightsConfirmedAt || !asset.rightsConfirmationEmail)) ||
      (asset.source === "ai_generated" && !asset.privateProvenance)
    ) {
      throw new ManagedContentContractError(
        `Asset rights are not valid for ${adaptation.channelKey}`,
        409,
      );
    }
  }
  const result = await submitManagedContentJob(
    {
      tenantId: actor.tenantId,
      companyId: company.id,
      requestId: intent.requestId,
      conceptId: concept.id,
      strategyCycleId: strategy.id,
      packagePeriod: concept.packagePeriod,
      theme: concept.theme,
      brief: intent.brief,
      strategyContext: {
        quarterStart: strategy.quarterStart,
        confirmedInputs: strategy.confirmedInputs,
        guardrails: strategy.guardrails,
        package: {
          id: entitlement.id,
          campaignConceptsPerMonth: entitlement.campaignConceptsPerMonth,
        },
        plannedSlotId: slot.id,
      },
      channels: [adaptation.channelKey],
      assetReferences: assets.map((asset) => ({
        assetId: asset.id,
        rightsConfirmed: true as const,
        usageRights: JSON.stringify(asset.usageRights),
      })),
      plannedPublishAt: slot.plannedPublishAt,
    },
    options,
  );
  await logAction(actor, "managed_content.job_submitted", {
    targetType: "managed_content_job",
    targetId: result.job.id,
    companyId: company.id,
    detail: result.idempotentReplay
      ? "Delegated Admin/Staff actor replayed caller intent."
      : "Delegated Admin/Staff actor submitted caller intent; authoritative job data was derived by Command Centre.",
  });
  return result;
}

function requestType(channel: ManagedChannelKey): RequestType {
  if (channel === "email") return "email_newsletter";
  if (channel === "website_blog_cms") return "blog_article";
  if (channel === "paid_media") return "ad_copy";
  if (channel === "aeo_geo" || channel === "local_technical_seo")
    return "seo_meta";
  return "social_post";
}

async function importReadyResult(
  job: ManagedContentJobRecord,
  data: ManagedJobData,
): Promise<string> {
  const result = data.result;
  if (!result) throw new Error("Ready result is missing");
  const company = await getCompany(job.companyId);
  if (!company || company.tenantId !== job.tenantId) {
    throw new Error("Ready result company correlation failed");
  }
  const unitKey = `content-engine:${job.conceptId}`;
  let concept = (
    await listManagedContentConcepts(job.tenantId, job.companyId)
  ).find(
    (item) =>
      item.id === job.conceptId ||
      (item.packagePeriod === job.request.packagePeriod &&
        item.unitKey === unitKey),
  );
  if (!concept) {
    concept = await createManagedContentConcept({
      tenantId: job.tenantId,
      companyId: job.companyId,
      strategyCycleId: job.strategyCycleId ?? null,
      campaignId: null,
      packagePeriod: job.request.packagePeriod,
      unitKey,
      title: result.primaryConcept.title,
      theme: job.request.theme,
      status: "drafting",
      reusableAssetId: result.visualMetadata[0]?.assetId ?? null,
      quotaConsumedAt: new Date().toISOString(),
    });
  } else {
    concept =
      (await updateManagedContentConcept(concept.id, {
        title: result.primaryConcept.title,
        status: "drafting",
      })) ?? concept;
  }

  const content = await listContent(job.tenantId);
  const existingAdaptations = await listManagedChannelAdaptations(
    job.tenantId,
    concept.id,
  );
  const existingSlots = await listManagedPlannedSlots(
    job.tenantId,
    job.companyId,
  );
  const existingPrimary = content.find(
    (candidate) =>
      candidate.companyId === job.companyId &&
      candidate.managedConceptId === concept.id &&
      candidate.managedChannelKey == null,
  );
  if (!existingPrimary) {
    const primary = await createContent({
      companyId: job.companyId,
      managedConceptId: concept.id,
      managedChannelKey: null,
      requestId: null,
      type: "campaign",
      title: result.primaryConcept.title,
      body: result.primaryConcept.narrative,
      status: "ai_draft",
      createdById: "system:content-engine",
      assetIds: result.visualMetadata.map((asset) => asset.assetId),
    });
    content.push(primary);
  } else {
    await updateContent(existingPrimary.id, {
      title: result.primaryConcept.title,
      body: result.primaryConcept.narrative,
      status: "ai_draft",
      assetIds: result.visualMetadata.map((asset) => asset.assetId),
    });
  }
  for (const item of result.channelAdaptations) {
    const channel = item.channel as ManagedChannelKey;
    let adaptation = existingAdaptations.find(
      (candidate) => candidate.channelKey === channel,
    );
    if (!adaptation) {
      adaptation = await createManagedChannelAdaptation({
        tenantId: job.tenantId,
        companyId: job.companyId,
        conceptId: concept.id,
        channelKey: channel,
        copy: item.content,
        status: "ready",
      });
      existingAdaptations.push(adaptation);
    } else {
      adaptation =
        (await updateManagedChannelAdaptation(adaptation.id, {
          copy: item.content,
          status: "ready",
        })) ?? adaptation;
    }
    if (!adaptation)
      throw new Error("Channel adaptation could not be persisted");
    const existingContent = content.find(
      (candidate) =>
        candidate.companyId === job.companyId &&
        candidate.managedConceptId === concept.id &&
        candidate.managedChannelKey === channel,
    );
    if (!existingContent) {
      const created = await createContent({
        companyId: job.companyId,
        managedConceptId: concept.id,
        managedChannelKey: channel,
        requestId: null,
        type: requestType(channel),
        title: result.primaryConcept.title,
        body: item.content,
        status: "ai_draft",
        createdById: "system:content-engine",
        assetIds: result.visualMetadata.map((asset) => asset.assetId),
      });
      content.push(created);
    } else {
      await updateContent(existingContent.id, {
        title: result.primaryConcept.title,
        body: item.content,
        status: "ai_draft",
        assetIds: result.visualMetadata.map((asset) => asset.assetId),
      });
    }
    if (
      !existingSlots.some(
        (slot) =>
          slot.adaptationId === adaptation.id &&
          slot.plannedPublishAt === result.plannedPublishAt,
      )
    ) {
      const slot = await createManagedPlannedSlot({
        tenantId: job.tenantId,
        companyId: job.companyId,
        conceptId: concept.id,
        adaptationId: adaptation.id,
        plannedPublishAt: result.plannedPublishAt,
        status: "planned",
        scheduledPostId: null,
      });
      existingSlots.push(slot);
    }
  }
  return concept.id;
}

async function applyManagedEvent(
  job: ManagedContentJobRecord,
  event: ManagedContentEvent,
): Promise<void> {
  if (event.type === "request.accepted") {
    if (!["ready", "paused", "failed"].includes(job.status)) {
      await updateManagedJob(job.id, {
        status: "accepted",
        nextPollAt: nextPollAt(),
        lastError: null,
      });
    }
    return;
  }
  if (event.type === "content.processing") {
    if (!["ready", "paused", "failed"].includes(job.status)) {
      await updateManagedJob(job.id, {
        status: "processing",
        nextPollAt: nextPollAt(),
        lastError: null,
      });
    }
    return;
  }
  if (event.type === "content.ready") {
    if (job.status === "paused" || job.status === "failed") return;
    const importedConceptId =
      job.importedConceptId ?? (await importReadyResult(job, event.data));
    await updateManagedJob(job.id, {
      status: "ready",
      nextPollAt: null,
      lastError: null,
      importedConceptId,
      resultPayload: event.data.result as unknown as Record<string, unknown>,
      privateProvenance: {
        ...(job.privateProvenance ?? {}),
        contractVersion: event.schemaVersion,
        externalEventId: event.eventId,
        externalJobId: event.data.jobId,
        importedAt: new Date().toISOString(),
      },
    });
    return;
  }
  const paused = event.data.status === "paused";
  const status = paused ? "paused" : "failed";
  const exceptionKind = paused
    ? "managed_service_paused"
    : "content_generation_failed";
  const message =
    event.data.error?.message ??
    (paused
      ? "Managed content service is paused"
      : "Content generation failed");
  if (job.status === "ready") return;
  await updateManagedJob(job.id, {
    status,
    nextPollAt: null,
    lastError: message,
  });
  await createManagedJobException({
    jobId: job.id,
    tenantId: job.tenantId,
    companyId: job.companyId,
    kind: exceptionKind,
    message,
  });
}

async function processManagedEvent(
  event: ManagedContentEvent,
  payloadDigest: string,
): Promise<"processed" | "duplicate"> {
  const job = await getManagedJobByExternalId(event.data.jobId);
  if (!job) {
    throw new ManagedContentContractError("Unknown external job", 404);
  }
  if (
    job.tenantId !== event.data.organisationId ||
    job.companyId !== event.data.companyId ||
    job.requestId !== event.data.commandCentreRequestId
  ) {
    throw new ManagedContentContractError("Job correlation mismatch", 403);
  }
  const leaseOwner = `callback:${randomUUID()}`;
  const claim = await claimManagedEvent({
    eventId: event.eventId,
    jobId: job.id,
    tenantId: job.tenantId,
    companyId: job.companyId,
    eventType: event.type,
    payloadDigest,
    leaseOwner,
    nowIso: new Date().toISOString(),
  });
  if (claim === "duplicate") return "duplicate";
  try {
    // Fence side effects with the currently-owned, unexpired lease. A worker
    // that was superseded after a stalled claim must fail before any mutation.
    await renewManagedEventLease(event.eventId, leaseOwner);
    await runInServiceContext(job.tenantId, () =>
      applyManagedEvent(job, event),
    );
    await completeManagedEvent(event.eventId, leaseOwner);
    return "processed";
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Event processing failed";
    try {
      await completeManagedEvent(event.eventId, leaseOwner, message);
    } catch {
      // Lease loss is already a hard failure; never let a stale worker mark it.
    }
    throw error;
  }
}

export async function receiveManagedContentEvent(args: {
  rawBody: string;
  eventId: string;
  timestamp: string;
  signature: string;
  nowMs?: number;
}): Promise<"processed" | "duplicate"> {
  const secret = process.env.MANAGED_CONTENT_CALLBACK_SECRET?.trim();
  if (!secret) {
    throw new ManagedContentContractError(
      "Managed content callback secret is not configured",
      503,
    );
  }
  if (
    !verifyManagedContentEventSignature({
      secret,
      timestamp: args.timestamp,
      eventId: args.eventId,
      rawBody: args.rawBody,
      signature: args.signature,
      nowMs: args.nowMs,
    })
  ) {
    throw new ManagedContentContractError(
      "Invalid or expired callback signature",
      401,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(args.rawBody);
  } catch {
    throw new ManagedContentContractError("Invalid callback JSON", 400);
  }
  const validated = ManagedContentEventSchema.safeParse(parsed);
  if (!validated.success) {
    throw new ManagedContentContractError("Unsupported callback schema", 400);
  }
  if (validated.data.eventId !== args.eventId) {
    throw new ManagedContentContractError("Event ID header mismatch", 400);
  }
  return processManagedEvent(validated.data, digest(args.rawBody));
}

function eventForPolledStatus(data: ManagedJobData): ManagedContentEvent {
  let type: ManagedContentEvent["type"];
  switch (data.status) {
    case "ready":
      type = "content.ready";
      break;
    case "failed":
    case "paused":
      type = "content.failed";
      break;
    case "processing":
      type = "content.processing";
      break;
    default:
      type = "request.accepted";
  }
  return ManagedContentEventSchema.parse({
    schemaVersion: CONTRACT_VERSION,
    eventId: `poll_${digest(
      `${data.jobId}\0${type}\0${data.timestamps.updatedAt}`,
      40,
    )}`,
    type,
    occurredAt: data.timestamps.updatedAt,
    data,
  });
}

async function exhaustManagedJobPolling(
  job: ManagedContentJobRecord,
  attempt: number,
  message: string,
): Promise<void> {
  await updateManagedJob(job.id, {
    status: "poll_exhausted",
    pollAttempts: attempt,
    nextPollAt: null,
    lastError: message,
  });
  await createManagedJobException({
    jobId: job.id,
    tenantId: job.tenantId,
    companyId: job.companyId,
    kind: "content_job_polling_exhausted",
    message,
  });
}

export async function pollDueManagedContentJobs(
  tenantId: string,
  options: {
    fetcher?: typeof fetch;
    nowMs?: number;
    deadlineMs?: number;
    maxJobs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<{
  processed: number;
  recovered: number;
  exhausted: number;
  deadlineExceeded: boolean;
  deferred: number;
}> {
  if (!managedContentJobsLive()) {
    return {
      processed: 0,
      recovered: 0,
      exhausted: 0,
      deadlineExceeded: false,
      deferred: 0,
    };
  }
  const fetcher = options.fetcher ?? fetch;
  const nowMs = options.nowMs ?? Date.now();
  const maxAttempts = envPositiveInt("MANAGED_CONTENT_POLL_MAX_ATTEMPTS", 8);
  let processed = 0;
  let recovered = 0;
  let exhausted = 0;
  let visited = 0;
  let deadlineExceeded = false;
  const maxJobs =
    options.maxJobs ?? envPositiveInt("MANAGED_CONTENT_POLL_MAX_JOBS_PER_TICK", 5);
  const dueJobs = await listDueManagedJobs(
    tenantId,
    new Date(nowMs).toISOString(),
    maxJobs,
  );
  for (const job of dueJobs) {
    if (
      options.signal?.aborted ||
      (options.deadlineMs && Date.now() + 250 >= options.deadlineMs)
    ) {
      deadlineExceeded = true;
      break;
    }
    visited += 1;
    const attempt = job.pollAttempts + 1;
    let budgetLimitedRequest = false;
    try {
      if (!job.externalJobId) throw new Error("External job ID is missing");
      const statusUrl =
        job.externalStatusUrl ??
        endpoint(
          `/v1/orgs/${encodeURIComponent(job.tenantId)}/content-jobs/${encodeURIComponent(job.externalJobId)}`,
        );
      const configuredTimeout = envPositiveInt(
        "CONTENT_ENGINE_REQUEST_TIMEOUT_MS",
        10_000,
      );
      const remainingMs = options.deadlineMs
        ? Math.max(1, options.deadlineMs - Date.now())
        : configuredTimeout;
      budgetLimitedRequest = remainingMs < configuredTimeout;
      const requestTimeout = AbortSignal.timeout(
        Math.min(configuredTimeout, remainingMs),
      );
      const signal = options.signal
        ? AbortSignal.any([options.signal, requestTimeout])
        : requestTimeout;
      const response = await contentEngineFetch(fetcher, statusUrl, {
        headers: contentEngineHeaders(),
        redirect: "error",
        signal,
      });
      if (!response.ok) {
        throw new Error(
          `Content Engine polling returned HTTP ${response.status}`,
        );
      }
      const parsed = ManagedJobDataSchema.parse(await response.json());
      if (
        parsed.jobId !== job.externalJobId ||
        parsed.organisationId !== job.tenantId ||
        parsed.companyId !== job.companyId ||
        parsed.commandCentreRequestId !== job.requestId
      ) {
        throw new Error("Polled job correlation mismatch");
      }
      await updateManagedJob(job.id, { pollAttempts: attempt });
      await processManagedEvent(
        eventForPolledStatus(parsed),
        digest(stableJson(parsed)),
      );
      processed += 1;
      const terminal =
        parsed.status === "ready" ||
        parsed.status === "paused" ||
        parsed.status === "failed";
      if (terminal) {
        recovered += 1;
      } else if (attempt >= maxAttempts) {
        const message = `Content Engine remained ${parsed.status} after ${attempt} polling attempts`;
        await exhaustManagedJobPolling(job, attempt, message);
        exhausted += 1;
      }
    } catch (error) {
      const budgetCancellation =
        options.signal?.aborted ||
        (budgetLimitedRequest &&
          (error instanceof DOMException ||
            (error instanceof Error &&
              ["AbortError", "TimeoutError"].includes(error.name))));
      if (budgetCancellation) {
        deadlineExceeded = true;
        await updateManagedJob(job.id, {
          nextPollAt: new Date(
            Date.now() +
              envPositiveInt("MANAGED_CONTENT_POLL_DEFER_MS", 1_000),
          ).toISOString(),
        });
        break;
      }
      const message = error instanceof Error ? error.message : "Polling failed";
      if (attempt >= maxAttempts) {
        await exhaustManagedJobPolling(job, attempt, message);
        exhausted += 1;
      } else {
        await updateManagedJob(job.id, {
          pollAttempts: attempt,
          nextPollAt: nextPollAt(nowMs, attempt),
          lastError: message,
        });
      }
    }
  }
  return {
    processed,
    recovered,
    exhausted,
    deadlineExceeded,
    deferred: dueJobs.length - visited + (deadlineExceeded && visited > 0 ? 1 : 0),
  };
}
