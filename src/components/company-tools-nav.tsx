"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import type { AddonId, BusinessType, ManagedServiceLevel } from "@/lib/types";

type ToolLink = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

type ToolGroup = {
  id: "brand" | "produce" | "channels" | "ads";
  label: string;
  items: ToolLink[];
};

function pathOf(href: string) {
  return href.split("?")[0];
}

function linkActive(pathname: string, item: ToolLink): boolean {
  const pathOnly = pathOf(item.href);
  if (item.match === "exact") {
    return pathname === pathOnly;
  }
  return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
}

/** Vertical tools only when the business type or an active add-on makes them real. */
function verticalTools(
  companyId: string,
  businessType: BusinessType,
  activeAddons: AddonId[],
): ToolLink[] {
  const q = `company=${companyId}`;
  const has = (id: AddonId) => activeAddons.includes(id);
  const items: ToolLink[] = [];

  if (has("video")) {
    items.push({ href: `/visuals?${q}`, label: "AI visuals" });
  }
  if (has("photo")) {
    items.push({ href: `/photographers?${q}`, label: "Photographers" });
  }
  if (businessType === "restaurant_cafe" || has("menus")) {
    items.push({ href: `/menus?${q}`, label: "Menus" });
  }
  if (businessType === "restaurant_cafe" || has("order_button")) {
    items.push({ href: `/ordering?${q}`, label: "Order Now" });
  }
  if (
    businessType === "hotel" ||
    businessType === "restaurant_cafe" ||
    has("bookings")
  ) {
    items.push({ href: `/bookings?${q}`, label: "Bookings" });
  }

  return items;
}

export type CompanyToolsAccess = {
  isAdmin: boolean;
  canApprove: boolean;
  canViewAudit: boolean;
  canCreate: boolean;
};

function buildTools(
  companyId: string,
  businessType: BusinessType,
  activeAddons: AddonId[],
  access: CompanyToolsAccess,
): { primary: ToolLink[]; groups: ToolGroup[]; vertical: ToolLink[] } {
  const q = `company=${companyId}`;
  const base = `/companies/${companyId}`;

  // Daily loop — members only see routes they can actually open.
  const primary: ToolLink[] = [];
  if (access.isAdmin) {
    primary.push(
      { href: base, label: "Overview", match: "exact" },
      { href: `${base}/strategy`, label: "Strategy", match: "prefix" },
    );
  }
  primary.push(
    { href: `/calendar?${q}`, label: "Calendar" },
    { href: `/content?${q}`, label: "Content" },
    { href: `/campaigns?${q}`, label: "Campaigns" },
  );
  if (access.canApprove) {
    primary.push({ href: `/approvals?${q}`, label: "Approvals" });
  }
  if (access.isAdmin) {
    primary.push({ href: `/publishing?${q}`, label: "Publishing" });
  }
  primary.push({ href: `/requests?${q}`, label: "Asks" });

  const vertical = access.isAdmin
    ? verticalTools(companyId, businessType, activeAddons)
    : [];

  const groups: ToolGroup[] = [];
  if (access.isAdmin) {
    groups.push({
      id: "brand",
      label: "Brand",
      items: [
        { href: `${base}/brand-brain`, label: "Brand Brain", match: "prefix" },
        { href: `${base}/services`, label: "Services", match: "prefix" },
        { href: `${base}/offers`, label: "Offers", match: "prefix" },
        { href: `${base}/governance`, label: "Governance", match: "prefix" },
        { href: `${base}/local-seo`, label: "Local SEO & AI", match: "prefix" },
      ],
    });
  }
  const produceItems: ToolLink[] = [
    { href: `/assets?${q}`, label: "Assets" },
    { href: `/library?${q}`, label: "Reuse library" },
  ];
  // Studio is secondary to Content — only when the user can create.
  if (access.canCreate) {
    produceItems.unshift({ href: `/studio?${q}`, label: "Studio" });
  }
  groups.push({
    id: "produce",
    label: "Produce",
    items: produceItems,
  });
  const channelItems: ToolLink[] = [
    { href: `/inbox?${q}`, label: "Social inbox" },
    { href: `/social?${q}`, label: "Social" },
    { href: `/reviews?${q}`, label: "Reviews" },
  ];
  if (access.isAdmin) {
    channelItems.push({ href: `/analytics?${q}`, label: "Analytics" });
  }
  if (access.canViewAudit) {
    channelItems.push({ href: `/audit?${q}`, label: "Audit trail" });
  }
  groups.push({ id: "channels", label: "Channels", items: channelItems });
  if (access.isAdmin) {
    groups.push({
      id: "ads",
      label: "Ads",
      items: [{ href: `/ads?${q}`, label: "Paid ads" }],
    });
  }

  return { primary, groups, vertical };
}

function serviceLevelLabel(level?: ManagedServiceLevel): string | null {
  if (!level) return null;
  if (level === "fully_managed") return "Fully managed";
  if (level === "managed_exceptions") return "Managed exceptions";
  return "Approval mode";
}

function ToolChip({
  item,
  active,
}: {
  item: ToolLink;
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      className={cn(
        "rounded-md px-2.5 py-1 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {item.label}
    </Link>
  );
}

function groupHasActive(
  pathname: string,
  group: ToolGroup,
  vertical: ToolLink[],
): boolean {
  if (group.items.some((item) => linkActive(pathname, item))) return true;
  if (group.id === "produce") {
    return vertical.some((item) => linkActive(pathname, item));
  }
  return false;
}

function groupIdForPath(
  pathname: string,
  groups: ToolGroup[],
  vertical: ToolLink[],
): ToolGroup["id"] | null {
  for (const group of groups) {
    if (groupHasActive(pathname, group, vertical)) return group.id;
  }
  return null;
}

export function CompanyToolsNav({
  companyId,
  companyName,
  status,
  businessType,
  activeAddons = [],
  serviceLevel,
  access = { isAdmin: true, canApprove: true, canViewAudit: true, canCreate: true },
}: {
  companyId: string;
  companyName: string;
  status: string;
  businessType: BusinessType;
  activeAddons?: AddonId[];
  serviceLevel?: ManagedServiceLevel;
  /** Defaults to full admin strip (company workspace layout is admin-only). */
  access?: CompanyToolsAccess;
}) {
  const pathname = usePathname();
  const { primary, groups, vertical } = buildTools(
    companyId,
    businessType,
    activeAddons,
    access,
  );

  const panelId = useId();
  const routeKey = `${pathname}\0${companyId}\0${businessType}\0${activeAddons.join(",")}`;
  const routeGroupId = groupIdForPath(pathname, groups, vertical);
  const [groupSelection, setGroupSelection] = useState<{
    routeKey: string;
    groupId: ToolGroup["id"] | null;
  }>(() => ({ routeKey, groupId: routeGroupId }));
  // A manual collapse belongs to the current route. A new route derives its
  // active group immediately without an extra effect/render cycle.
  const openGroupId =
    groupSelection.routeKey === routeKey ? groupSelection.groupId : routeGroupId;

  useEffect(() => {
    if (!openGroupId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setGroupSelection({ routeKey, groupId: null });
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openGroupId, routeKey]);

  const openGroup = groups.find((g) => g.id === openGroupId) ?? null;
  const levelLabel = serviceLevelLabel(serviceLevel);
  const showVertical = openGroup?.id === "produce" && vertical.length > 0;

  return (
    <div className="border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <Link
          href={access.isAdmin ? "/companies" : "/dashboard"}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {access.isAdmin ? "Clients" : "Home"}
        </Link>
        <div className="h-4 w-px bg-border" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold tracking-tight">
              {companyName}
            </h1>
            {levelLabel && (
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {levelLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Working on this client — drafts stay here until approved; clients review in
            their portal
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <nav
        className="flex flex-wrap items-center gap-1 px-6 pb-2"
        aria-label={`${companyName} tools`}
      >
        {primary.map((item) => (
          <ToolChip
            key={item.href}
            item={item}
            active={linkActive(pathname, item)}
          />
        ))}
      </nav>

      <div className="px-6 pb-3">
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="toolbar"
          aria-label="More tools"
        >
          {groups.map((group) => {
            const open = openGroupId === group.id;
            const routeActive = groupHasActive(pathname, group, vertical);
            return (
              <button
                key={group.id}
                type="button"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                onClick={() =>
                  setGroupSelection({
                    routeKey,
                    groupId: openGroupId === group.id ? null : group.id,
                  })
                }
                className={cn(
                  "rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  open
                    ? "border-border bg-muted text-foreground"
                    : routeActive
                      ? "border-border bg-accent/60 text-primary"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {group.label}
              </button>
            );
          })}
        </div>

        {openGroup && (
          <div
            id={panelId}
            className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-border/60 pt-2"
          >
            {openGroup.items.map((item) => (
              <ToolChip
                key={item.href}
                item={item}
                active={linkActive(pathname, item)}
              />
            ))}
            {showVertical && (
              <>
                <span
                  className="mx-1 hidden h-3 w-px bg-border sm:inline-block"
                  aria-hidden
                />
                <span className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Also for this business
                </span>
                {vertical.map((item) => (
                  <ToolChip
                    key={item.href}
                    item={item}
                    active={linkActive(pathname, item)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
