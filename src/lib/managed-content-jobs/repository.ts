import { getServiceSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import type { SubmitManagedContentJobInput } from "./schemas";
import { collectAllPages } from "@/lib/db/pagination";

export type ManagedJobStatus =
  | "submitting"
  | "accepted"
  | "processing"
  | "ready"
  | "paused"
  | "failed"
  | "submit_failed"
  | "poll_exhausted";

export interface ManagedContentJobRecord {
  id: string;
  tenantId: string;
  companyId: string;
  requestId: string;
  conceptId: string;
  strategyCycleId?: string | null;
  idempotencyKey: string;
  requestFingerprint: string;
  request: SubmitManagedContentJobInput;
  schemaVersion: "1.0";
  callbackUrl?: string | null;
  callbackTarget?: "command-centre" | null;
  externalJobId?: string | null;
  externalStatusUrl?: string | null;
  status: ManagedJobStatus;
  pollAttempts: number;
  nextPollAt?: string | null;
  lastError?: string | null;
  resultPayload?: Record<string, unknown> | null;
  privateProvenance?: Record<string, unknown> | null;
  importedConceptId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedContentJobException {
  id: string;
  jobId: string;
  tenantId: string;
  companyId: string;
  kind: string;
  message: string;
  status: "open" | "resolved";
  createdAt: string;
}

interface ManagedEventRecord {
  eventId: string;
  jobId: string;
  tenantId: string;
  companyId: string;
  eventType: string;
  payloadDigest: string;
  processingStatus: "processing" | "completed" | "failed";
  leaseOwner?: string | null;
  leaseAcquiredAt?: string | null;
  leaseExpiresAt?: string | null;
  receivedAt: string;
  completedAt?: string | null;
  lastError?: string | null;
}

interface MemoryState {
  jobs: Map<string, ManagedContentJobRecord>;
  events: Map<string, ManagedEventRecord>;
  exceptions: Map<string, ManagedContentJobException>;
}

const memoryKey = "__ccManagedContentJobs";
function memory(): MemoryState {
  const root = globalThis as typeof globalThis & { [memoryKey]?: MemoryState };
  return (root[memoryKey] ??= {
    jobs: new Map(),
    events: new Map(),
    exceptions: new Map(),
  });
}

/** Local-demo/test helper: replace the isolated in-memory job queue atomically. */
export function resetManagedContentJobMemory(
  jobs: ManagedContentJobRecord[] = [],
  exceptions: ManagedContentJobException[] = [],
): void {
  const state = memory();
  state.jobs = new Map(jobs.map((job) => [job.id, job]));
  state.events = new Map();
  state.exceptions = new Map(exceptions.map((item) => [item.id, item]));
}

function serviceClient() {
  const client = getServiceSupabase();
  if (!client) {
    throw new Error(
      "Managed content persistence requires SUPABASE_SERVICE_ROLE_KEY when Supabase is configured.",
    );
  }
  return client;
}

function toJob(row: Record<string, unknown>): ManagedContentJobRecord {
  return {
    id: row.id as string,
    tenantId: row.tenant_id as string,
    companyId: row.company_id as string,
    requestId: row.request_id as string,
    conceptId: row.concept_id as string,
    strategyCycleId: row.strategy_cycle_id as string | null,
    idempotencyKey: row.idempotency_key as string,
    requestFingerprint: row.request_fingerprint as string,
    request: row.request_payload as SubmitManagedContentJobInput,
    schemaVersion: row.schema_version as "1.0",
    callbackUrl: row.callback_url as string | null,
    callbackTarget: row.callback_target as "command-centre" | null,
    externalJobId: row.external_job_id as string | null,
    externalStatusUrl: row.external_status_url as string | null,
    status: row.status as ManagedJobStatus,
    pollAttempts: Number(row.poll_attempts ?? 0),
    nextPollAt: row.next_poll_at as string | null,
    lastError: row.last_error as string | null,
    resultPayload: row.result_payload as Record<string, unknown> | null,
    privateProvenance: row.private_provenance as Record<string, unknown> | null,
    importedConceptId: row.imported_concept_id as string | null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toException(row: Record<string, unknown>): ManagedContentJobException {
  return {
    id: row.id as string,
    jobId: row.job_id as string,
    tenantId: row.tenant_id as string,
    companyId: row.company_id as string,
    kind: row.kind as string,
    message: row.message as string,
    status: row.status as "open" | "resolved",
    createdAt: row.created_at as string,
  };
}

function jobPatch(
  patch: Partial<ManagedContentJobRecord>,
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  const fields: Array<[keyof ManagedContentJobRecord, string]> = [
    ["externalJobId", "external_job_id"],
    ["externalStatusUrl", "external_status_url"],
    ["callbackUrl", "callback_url"],
    ["callbackTarget", "callback_target"],
    ["status", "status"],
    ["pollAttempts", "poll_attempts"],
    ["nextPollAt", "next_poll_at"],
    ["lastError", "last_error"],
    ["resultPayload", "result_payload"],
    ["privateProvenance", "private_provenance"],
    ["importedConceptId", "imported_concept_id"],
  ];
  for (const [property, column] of fields) {
    if (property in patch) row[column] = patch[property];
  }
  row.updated_at = new Date().toISOString();
  return row;
}

export async function createManagedJob(
  input: Omit<ManagedContentJobRecord, "createdAt" | "updatedAt">,
): Promise<{ job: ManagedContentJobRecord; existing: boolean }> {
  if (!isSupabaseConfigured()) {
    const duplicate = [...memory().jobs.values()].find(
      (job) =>
        job.tenantId === input.tenantId &&
        job.idempotencyKey === input.idempotencyKey,
    );
    if (duplicate) return { job: duplicate, existing: true };
    const stamp = new Date().toISOString();
    const job = { ...input, createdAt: stamp, updatedAt: stamp };
    memory().jobs.set(job.id, job);
    return { job, existing: false };
  }
  const sb = serviceClient();
  const { data, error } = await sb
    .from("managed_content_jobs")
    .insert({
      id: input.id,
      tenant_id: input.tenantId,
      company_id: input.companyId,
      request_id: input.requestId,
      concept_id: input.conceptId,
      strategy_cycle_id: input.strategyCycleId ?? null,
      idempotency_key: input.idempotencyKey,
      request_fingerprint: input.requestFingerprint,
      request_payload: input.request,
      schema_version: input.schemaVersion,
      callback_url: input.callbackUrl,
      callback_target: input.callbackTarget ?? null,
      external_job_id: input.externalJobId ?? null,
      external_status_url: input.externalStatusUrl ?? null,
      status: input.status,
      poll_attempts: input.pollAttempts,
      next_poll_at: input.nextPollAt ?? null,
      last_error: input.lastError ?? null,
      result_payload: input.resultPayload ?? null,
      private_provenance: input.privateProvenance ?? null,
      imported_concept_id: input.importedConceptId ?? null,
    })
    .select("*")
    .single();
  if (!error && data) return { job: toJob(data), existing: false };
  if (error?.code !== "23505")
    throw new Error(error?.message ?? "Managed job insert failed");
  const existing = await getManagedJobByIdempotency(
    input.tenantId,
    input.idempotencyKey,
  );
  if (!existing) throw new Error("Managed job conflict could not be resolved");
  return { job: existing, existing: true };
}

export async function getManagedJob(
  id: string,
): Promise<ManagedContentJobRecord | undefined> {
  if (!isSupabaseConfigured()) return memory().jobs.get(id);
  const { data, error } = await serviceClient()
    .from("managed_content_jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toJob(data) : undefined;
}

export async function getManagedJobForTenant(
  id: string,
  tenantId: string,
): Promise<ManagedContentJobRecord | undefined> {
  if (!isSupabaseConfigured()) {
    const job = memory().jobs.get(id);
    return job?.tenantId === tenantId ? job : undefined;
  }
  const { data, error } = await serviceClient()
    .from("managed_content_jobs")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toJob(data) : undefined;
}

export async function getManagedJobByIdempotency(
  tenantId: string,
  idempotencyKey: string,
): Promise<ManagedContentJobRecord | undefined> {
  if (!isSupabaseConfigured()) {
    return [...memory().jobs.values()].find(
      (job) =>
        job.tenantId === tenantId && job.idempotencyKey === idempotencyKey,
    );
  }
  const { data, error } = await serviceClient()
    .from("managed_content_jobs")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toJob(data) : undefined;
}

export async function getManagedJobByExternalId(
  externalJobId: string,
): Promise<ManagedContentJobRecord | undefined> {
  if (!isSupabaseConfigured()) {
    return [...memory().jobs.values()].find(
      (job) => job.externalJobId === externalJobId,
    );
  }
  const { data, error } = await serviceClient()
    .from("managed_content_jobs")
    .select("*")
    .eq("external_job_id", externalJobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toJob(data) : undefined;
}

export async function listManagedJobs(
  tenantId: string,
  companyId?: string,
): Promise<ManagedContentJobRecord[]> {
  if (!isSupabaseConfigured()) {
    return [...memory().jobs.values()]
      .filter(
        (job) =>
          job.tenantId === tenantId &&
          (!companyId || job.companyId === companyId),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  const sb = serviceClient();
  const data = await collectAllPages<Record<string, unknown>>(
    (from, to) => {
      let query = sb
        .from("managed_content_jobs")
        .select("*")
        .eq("tenant_id", tenantId);
      if (companyId) query = query.eq("company_id", companyId);
      return query
        .order("updated_at", { ascending: false })
        .order("id")
        .range(from, to);
    },
    "listManagedJobs",
  );
  return (data ?? []).map(toJob);
}

export async function updateManagedJob(
  id: string,
  patch: Partial<ManagedContentJobRecord>,
): Promise<ManagedContentJobRecord> {
  if (!isSupabaseConfigured()) {
    const job = memory().jobs.get(id);
    if (!job) throw new Error("Managed content job not found");
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    return job;
  }
  const { data, error } = await serviceClient()
    .from("managed_content_jobs")
    .update(jobPatch(patch))
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Managed job update failed");
  return toJob(data);
}

export async function listDueManagedJobs(
  tenantId: string,
  atIso: string,
  limit = 20,
): Promise<ManagedContentJobRecord[]> {
  if (!isSupabaseConfigured()) {
    return [...memory().jobs.values()]
      .filter(
        (job) =>
          job.tenantId === tenantId &&
          ["accepted", "processing"].includes(job.status) &&
          !!job.nextPollAt &&
          job.nextPollAt <= atIso,
      )
      .sort((a, b) => (a.nextPollAt ?? "").localeCompare(b.nextPollAt ?? ""))
      .slice(0, limit);
  }
  const { data, error } = await serviceClient()
    .from("managed_content_jobs")
    .select("*")
    .eq("tenant_id", tenantId)
    .in("status", ["accepted", "processing"])
    .lte("next_poll_at", atIso)
    .order("next_poll_at")
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toJob);
}

export async function claimManagedEvent(
  input: Omit<ManagedEventRecord, "processingStatus" | "receivedAt"> & {
    leaseOwner: string;
    nowIso: string;
    leaseSeconds?: number;
  },
): Promise<"claimed" | "duplicate"> {
  const leaseSeconds = input.leaseSeconds ?? 300;
  if (!isSupabaseConfigured()) {
    const existing = memory().events.get(input.eventId);
    if (existing && existing.payloadDigest !== input.payloadDigest) {
      throw new Error("Event ID was reused with a different payload");
    }
    if (existing?.processingStatus === "completed") {
      return "duplicate";
    }
    if (
      existing?.processingStatus === "processing" &&
      existing.leaseExpiresAt &&
      Date.parse(existing.leaseExpiresAt) > Date.parse(input.nowIso)
    )
      return "duplicate";
    memory().events.set(input.eventId, {
      ...input,
      processingStatus: "processing",
      receivedAt: existing?.receivedAt ?? new Date().toISOString(),
      leaseAcquiredAt: input.nowIso,
      leaseExpiresAt: new Date(
        Date.parse(input.nowIso) + leaseSeconds * 1_000,
      ).toISOString(),
    });
    return "claimed";
  }
  const sb = serviceClient();
  const { data, error } = await sb.rpc("claim_managed_content_job_event", {
    p_event_id: input.eventId,
    p_job_id: input.jobId,
    p_tenant_id: input.tenantId,
    p_company_id: input.companyId,
    p_event_type: input.eventType,
    p_payload_digest: input.payloadDigest,
    p_lease_owner: input.leaseOwner,
    p_now: input.nowIso,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error(error.message);
  if (data === "payload_mismatch") {
    throw new Error("Event ID was reused with a different payload");
  }
  return data === "claimed" ? "claimed" : "duplicate";
}

export async function completeManagedEvent(
  eventId: string,
  leaseOwner: string,
  errorMessage?: string,
): Promise<void> {
  const processingStatus = errorMessage ? "failed" : "completed";
  if (!isSupabaseConfigured()) {
    const event = memory().events.get(eventId);
    if (!event || event.leaseOwner !== leaseOwner) {
      throw new Error("Managed event lease ownership was lost");
    }
    event.processingStatus = processingStatus;
    event.lastError = errorMessage ?? null;
    event.completedAt = errorMessage ? null : new Date().toISOString();
    event.leaseOwner = null;
    event.leaseAcquiredAt = null;
    event.leaseExpiresAt = null;
    return;
  }
  const { data, error } = await serviceClient()
    .from("managed_content_job_events")
    .update({
      processing_status: processingStatus,
      last_error: errorMessage ?? null,
      completed_at: errorMessage ? null : new Date().toISOString(),
      lease_owner: null,
      lease_acquired_at: null,
      lease_expires_at: null,
    })
    .eq("event_id", eventId)
    .eq("lease_owner", leaseOwner)
    .select("event_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Managed event lease ownership was lost");
}

export async function renewManagedEventLease(
  eventId: string,
  leaseOwner: string,
  nowIso = new Date().toISOString(),
  leaseSeconds = 300,
): Promise<void> {
  const expiresAt = new Date(
    Date.parse(nowIso) + leaseSeconds * 1_000,
  ).toISOString();
  if (!isSupabaseConfigured()) {
    const event = memory().events.get(eventId);
    if (
      !event ||
      event.processingStatus !== "processing" ||
      event.leaseOwner !== leaseOwner ||
      !event.leaseExpiresAt ||
      Date.parse(event.leaseExpiresAt) <= Date.parse(nowIso)
    ) {
      throw new Error("Managed event lease ownership was lost");
    }
    event.leaseExpiresAt = expiresAt;
    return;
  }
  const { data, error } = await serviceClient()
    .from("managed_content_job_events")
    .update({ lease_expires_at: expiresAt })
    .eq("event_id", eventId)
    .eq("lease_owner", leaseOwner)
    .eq("processing_status", "processing")
    .gt("lease_expires_at", nowIso)
    .select("event_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Managed event lease ownership was lost");
}

export async function createManagedJobException(
  input: Omit<ManagedContentJobException, "id" | "createdAt" | "status">,
): Promise<ManagedContentJobException> {
  if (!isSupabaseConfigured()) {
    const existing = [...memory().exceptions.values()].find(
      (item) => item.jobId === input.jobId && item.kind === input.kind,
    );
    if (existing) return existing;
    const exception: ManagedContentJobException = {
      ...input,
      id: `mce_${memory().exceptions.size + 1}`,
      status: "open",
      createdAt: new Date().toISOString(),
    };
    memory().exceptions.set(exception.id, exception);
    return exception;
  }
  const sb = serviceClient();
  const { data, error } = await sb
    .from("managed_content_job_exceptions")
    .upsert(
      {
        job_id: input.jobId,
        tenant_id: input.tenantId,
        company_id: input.companyId,
        kind: input.kind,
        message: input.message,
        status: "open",
      },
      { onConflict: "job_id,kind" },
    )
    .select("*")
    .single();
  if (error || !data)
    throw new Error(error?.message ?? "Exception insert failed");
  return toException(data);
}

export async function listManagedJobExceptions(
  jobId: string,
): Promise<ManagedContentJobException[]> {
  if (!isSupabaseConfigured()) {
    return [...memory().exceptions.values()].filter(
      (item) => item.jobId === jobId,
    );
  }
  const { data, error } = await serviceClient()
    .from("managed_content_job_exceptions")
    .select("*")
    .eq("job_id", jobId);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toException);
}

export function resetManagedContentJobMemoryForTests(): void {
  memory().jobs.clear();
  memory().events.clear();
  memory().exceptions.clear();
}
