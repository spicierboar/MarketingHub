// Temporary no-op until split/05 managed-content-jobs lands the real implementation.
// Keeps scheduler ticks buildable on the scheduler-cursors slice.

export async function pollDueManagedContentJobs(
  _tenantId: string,
  _options: { deadlineMs?: number; signal?: AbortSignal } = {},
): Promise<{
  processed: number;
  recovered: number;
  deferred: number;
  deadlineExceeded: boolean;
}> {
  return {
    processed: 0,
    recovered: 0,
    deferred: 0,
    deadlineExceeded: false,
  };
}
