import type {
  ManagedContentJobRecord,
  ManagedJobStatus,
} from "./repository";

const CLIENT_SAFE_FAILURES: Partial<Record<ManagedJobStatus, string>> = {
  submit_failed: "Command Centre could not submit the managed content request.",
  paused: "Managed content delivery is paused by Command Centre service controls.",
  failed: "The managed content request did not complete.",
  poll_exhausted: "Command Centre could not confirm a final status in time.",
};

export interface ContentDeskManagedJobStatus {
  id: string;
  conceptId: string;
  status: ManagedJobStatus;
  pollAttempts: number;
  updatedAt: string;
  lastError: string | null;
}

export function contentDeskManagedJobStatus(
  job: ManagedContentJobRecord,
): ContentDeskManagedJobStatus {
  return {
    id: job.id,
    conceptId: job.conceptId,
    status: job.status,
    pollAttempts: job.pollAttempts,
    updatedAt: job.updatedAt,
    lastError: CLIENT_SAFE_FAILURES[job.status] ?? null,
  };
}
