"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import type { AddonId, BusinessType } from "@/lib/types";

type ToolLink = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

type ToolGroup = {
  id: string;
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
  if (item.match === "prefix") {
    return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
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
  // Menus / Order Now — restaurant wedge only (or purchased add-on).
  if (businessType === "restaurant_cafe" || has("menus")) {
    items.push({ href: `/menus?${q}`, label: "Menus" });
  }
  if (businessType === "restaurant_cafe" || has("order_button")) {
    items.push({ href: `/ordering?${q}`, label: "Order Now" });
  }
  // Bookings — hotel/restaurant, or bookings add-on.
  if (
    businessType === "hotel" ||
    businessType === "restaurant_cafe" ||
    has("bookings")
  ) {
    items.push({ href: `/bookings?${q}`, label: "Bookings" });
  }

  return items;
}

function buildTools(
  companyId: string,
  businessType: BusinessType,
  activeAddons: AddonId[],
): { primary: ToolLink[]; more: ToolGroup[]; vertical: ToolLink[] } {
  const q = `company=${companyId}`;
  const base = `/companies/${companyId}`;

  const primary: ToolLink[] = [
    { href: base, label: "Overview", match: "exact" },
    { href: `/calendar?${q}`, label: "Calendar" },
    { href: `/inbox?${q}`, label: "Inbox" },
    { href: `/analytics?${q}`, label: "Analytics" },
    { href: `/ads?${q}`, label: "Paid ads" },
  ];

  const more: ToolGroup[] = [
    {
      id: "delivery",
      label: "Delivery tools",
      items: [
        { href: `/campaigns?${q}`, label: "Campaigns" },
        { href: `/studio?${q}`, label: "Studio" },
        { href: `/content?${q}`, label: "Content" },
        { href: `/publishing?${q}`, label: "Publishing" },
        { href: `/assets?${q}`, label: "Assets" },
        { href: `/library?${q}`, label: "Reuse library" },
      ],
    },
    {
      id: "profile",
      label: "Setup & profile",
      items: [
        { href: `${base}/brand-brain`, label: "Brand Brain", match: "prefix" },
        { href: `${base}/services`, label: "Services", match: "prefix" },
        { href: `${base}/offers`, label: "Offers", match: "prefix" },
        { href: `${base}/governance`, label: "Governance", match: "prefix" },
        { href: `${base}/local-seo`, label: "Local SEO", match: "prefix" },
        { href: `/crm?${q}`, label: "CRM" },
      ],
    },
    {
      id: "engage",
      label: "Engage",
      items: [
        { href: `/social?${q}`, label: "Social" },
        { href: `/reviews?${q}`, label: "Reviews" },
        { href: `/requests?${q}`, label: "Requests" },
      ],
    },
    {
      id: "audience",
      label: "Audience",
      items: [
        { href: `/email-marketing?${q}`, label: "Email" },
        { href: `/sms?${q}`, label: "SMS" },
        { href: `/loyalty?${q}`, label: "Loyalty" },
      ],
    },
    {
      id: "growth",
      label: "Growth",
      items: [
        { href: `/cms?${q}`, label: "CMS" },
        { href: `/funnel?${q}`, label: "Funnels" },
        { href: `/workflows?${q}`, label: "Workflows" },
        { href: `/automations?${q}`, label: "Automations" },
        { href: `/learning?${q}`, label: "Learning" },
      ],
    },
  ];

  return {
    primary,
    more,
    vertical: verticalTools(companyId, businessType, activeAddons),
  };
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
        "rounded-md px-2 py-1 text-sm transition-colors",
        active
          ? "bg-accent font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {item.label}
    </Link>
  );
}

export function CompanyToolsNav({
  companyId,
  companyName,
  status,
  businessType,
  activeAddons = [],
}: {
  companyId: string;
  companyName: string;
  status: string;
  businessType: BusinessType;
  activeAddons?: AddonId[];
}) {
  const pathname = usePathname();
  const { primary, more, vertical } = buildTools(
    companyId,
    businessType,
    activeAddons,
  );

  const moreFlat = more.flatMap((g) => g.items);
  const secondaryActive =
    moreFlat.some((item) => linkActive(pathname, item)) ||
    vertical.some((item) => linkActive(pathname, item));
  const [showMore, setShowMore] = useState(secondaryActive);

  return (
    <div className="border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-6 py-4">
        <Link
          href="/companies"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Companies
        </Link>
        <div className="h-4 w-px bg-border" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {companyName}
          </h1>
          <p className="text-xs text-muted-foreground">
            Tools for this client — monitoring first; create tools under More
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <nav className="space-y-2 px-6 pb-4" aria-label={`${companyName} tools`}>
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
          {primary.map((item) => (
            <ToolChip
              key={item.href}
              item={item}
              active={linkActive(pathname, item)}
            />
          ))}
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-expanded={showMore}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                showMore && "rotate-180",
              )}
            />
            {showMore ? "Less" : "More"}
          </button>
        </div>

        {showMore && (
          <div className="space-y-2 border-t border-border pt-2">
            {more.map((group) => (
              <div
                key={group.id}
                className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3"
              >
                <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {group.label}
                </span>
                <div className="flex flex-wrap gap-x-1 gap-y-1">
                  {group.items.map((item) => (
                    <ToolChip
                      key={item.href}
                      item={item}
                      active={linkActive(pathname, item)}
                    />
                  ))}
                </div>
              </div>
            ))}
            {vertical.length > 0 && (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  For this business
                </span>
                <div className="flex flex-wrap gap-x-1 gap-y-1">
                  {vertical.map((item) => (
                    <ToolChip
                      key={item.href}
                      item={item}
                      active={linkActive(pathname, item)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* When More is closed but a vertical tool is primary for this type, keep a thin hint row */}
        {!showMore && vertical.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
            <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              For this business
            </span>
            {vertical.map((item) => (
              <ToolChip
                key={item.href}
                item={item}
                active={linkActive(pathname, item)}
              />
            ))}
          </div>
        )}
      </nav>
    </div>
  );
}
