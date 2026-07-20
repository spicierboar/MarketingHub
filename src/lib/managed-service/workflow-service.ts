// Temporary no-op until split/07 managed-workflow lands the real implementation.
// Keeps scheduler ticks buildable on the scheduler-cursors slice.

import type { ActingUser } from "@/lib/types";

export async function processManagedApprovalReminders(
  _actor: ActingUser,
  _nowIso: string,
  _options: { deadlineMs?: number; signal?: AbortSignal } = {},
): Promise<number> {
  return 0;
}
