// Restaurant menu design engine (Module 4 / Phase 5). State machine for designed-
// menu deliverables plus the 2-free-menus/year entitlement counter.

import type { MenuBillingClass, MenuDesign, MenuDesignStatus } from "@/lib/types";

/** Free professionally designed menus per restaurant per calendar year. */
export const MENUS_INCLUDED_PER_YEAR = 2;

export const MENU_DESIGN_TRANSITIONS: Record<
  MenuDesignStatus,
  MenuDesignStatus[]
> = {
  requested: ["in_design", "cancelled"],
  in_design: ["client_review", "cancelled"],
  client_review: ["delivered", "in_design", "cancelled"],
  delivered: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function canTransitionMenuDesign(
  from: MenuDesignStatus,
  to: MenuDesignStatus,
): boolean {
  return MENU_DESIGN_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertMenuDesignTransition(
  from: MenuDesignStatus,
  to: MenuDesignStatus,
): void {
  if (!canTransitionMenuDesign(from, to)) {
    throw new Error(`Cannot move a menu design from "${from}" to "${to}".`);
  }
}

export function menuDesignStatusLabel(status: MenuDesignStatus): string {
  switch (status) {
    case "requested":
      return "Requested";
    case "in_design":
      return "In design";
    case "client_review":
      return "Client review";
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

/** Non-cancelled included menus that consume a quota slot for the given year. */
export function includedMenusUsedInYear(
  designs: MenuDesign[],
  year: number,
): number {
  return designs.filter(
    (d) =>
      d.billingClass === "included" &&
      d.quotaYear === year &&
      d.status !== "cancelled",
  ).length;
}

export function menuQuotaSummary(
  designs: MenuDesign[],
  year: number = new Date().getFullYear(),
): { used: number; limit: number; remaining: number } {
  const used = includedMenusUsedInYear(designs, year);
  const limit = MENUS_INCLUDED_PER_YEAR;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/** Resolve billing class for a new menu request (included while quota remains). */
export function resolveMenuBillingClass(
  designs: MenuDesign[],
  year: number = new Date().getFullYear(),
): MenuBillingClass {
  const { remaining } = menuQuotaSummary(designs, year);
  return remaining > 0 ? "included" : "billable";
}

export function menuDesignSummary(design: MenuDesign): string {
  const parts = [menuDesignStatusLabel(design.status)];
  parts.push(design.billingClass === "included" ? "included" : "billable");
  if (design.deliverableAssetIds.length) {
    parts.push(`${design.deliverableAssetIds.length} file(s)`);
  }
  return parts.join(" · ");
}
