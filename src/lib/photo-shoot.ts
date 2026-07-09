// Photo shoot workflow engine (Phase 4). State machine for managed shoots —
// human photographer, automated booking → DAM upload → approval → attach.

import type { PhotoShoot, PhotoShootStatus } from "@/lib/types";

export const PHOTO_SHOOT_TRANSITIONS: Record<
  PhotoShootStatus,
  PhotoShootStatus[]
> = {
  requested: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["delivered", "cancelled"],
  delivered: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionPhotoShoot(
  from: PhotoShootStatus,
  to: PhotoShootStatus,
): boolean {
  return PHOTO_SHOOT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertPhotoShootTransition(
  from: PhotoShootStatus,
  to: PhotoShootStatus,
): void {
  if (!canTransitionPhotoShoot(from, to)) {
    throw new Error(`Cannot move a photo shoot from "${from}" to "${to}".`);
  }
}

export function photoShootStatusLabel(status: PhotoShootStatus): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "scheduled":
      return "Scheduled";
    case "in_progress":
      return "In progress";
    case "delivered":
      return "Delivered";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function photoShootSummary(shoot: PhotoShoot): string {
  const parts = [photoShootStatusLabel(shoot.status)];
  if (shoot.scheduledAt) parts.push(`booked ${shoot.scheduledAt.slice(0, 10)}`);
  if (shoot.deliverableAssetIds.length) {
    parts.push(`${shoot.deliverableAssetIds.length} asset(s)`);
  }
  return parts.join(" · ");
}
