"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import type { AddonId, BusinessType, ManagedServiceLevel } from "@/lib/types";

type ToolLink = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};

type ToolGroup = {
  id: string;
  label: string;
  hint?: string;
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

function buildTools(
  companyId: string,
  businessType: BusinessType,
  activeAddons: AddonId[],
): { primary: ToolLink[]; groups: ToolGroup[]; vertical: ToolLink[] } {
  const q = `company=${companyId}`;
  const base = `/companies/${companyId}`;

  // Daily agency loop — keep this strip short.
  const primary: ToolLink[] = [
    { href: base, label: "Overview", match: "exact" },
    { href: `/calendar?${q}`, label: "Calendar" },
    { href: `/content?${q}`, label: "Content" },
    { href: `/campaigns?${q}`, label: "Campaigns" },
    { href: `/approvals?${q}`, label: "Approvals" },
    { href: `/publishing?${q}`, label: "Publishing" },
  ];

  const vertical = verticalTools(companyId, businessType, activeAddons);

  // Ops-verb groups. Automate stays lean — unfinished Grow modules stay out of
  // the strip so the agency desk doesn't look like a module zoo.
  const groups: ToolGroup[] = [
    {
      id: "produce",
      label: "Produce",
      hint: "Draft and package",
      items: [
        { href: `/studio?${q}`, label: "Studio" },
        { href: `/assets?${q}`, label: "Assets" },
        { href: `/library?${q}`, label: "Reuse library" },
        { href: `/ads?${q}`, label: "Paid ads" },
      ],
    },
    {
      id: "brand",
      label: "Brand",
      hint: "Profile that steers AI",
      items: [
        { href: `${base}/brand-brain`, label: "Brand Brain", match: "prefix" as const },
        { href: `${base}/services`, label: "Services", match: "prefix" as const },
        { href: `${base}/offers`, label: "Offers", match: "prefix" as const },
        { href: `${base}/governance`, label: "Governance", match: "prefix" as const },
        { href: `${base}/local-seo`, label: "Local SEO & AI", match: "prefix" as const },
      ],
    },
    {
      id: "channels",
      label: "Channels",
      hint: "Inbox, social, reputation",
      items: [
        { href: `/inbox?${q}`, label: "Social inbox" },
        { href: `/social?${q}`, label: "Social" },
        { href: `/reviews?${q}`, label: "Reviews" },
        { href: `/requests?${q}`, label: "Client asks" },
        { href: `/analytics?${q}`, label: "Analytics" },
      ],
    },
    {
      id: "automate",
      label: "Automate",
      hint: "Workflows and learning loops",
      items: [
        { href: `/workflows?${q}`, label: "Workflows" },
        { href: `/automations?${q}`, label: "Automations" },
        { href: `/learning?${q}`, label: "Learning" },
      ],
    },
  ].filter((g) => g.items.length > 0);

  return {
    primary,
    groups,
    vertical,
  };
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
  onNavigate,
}: {
  item: ToolLink;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
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

export function CompanyToolsNav({
  companyId,
  companyName,
  status,
  businessType,
  activeAddons = [],
  serviceLevel,
}: {
  companyId: string;
  companyName: string;
  status: string;
  businessType: BusinessType;
  activeAddons?: AddonId[];
  serviceLevel?: ManagedServiceLevel;
}) {
  const pathname = usePathname();
  const { primary, groups, vertical } = buildTools(
    companyId,
    businessType,
    activeAddons,
  );

  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const allSecondary = [...groups.flatMap((g) => g.items), ...vertical];
  const secondaryActive = allSecondary.some((item) => linkActive(pathname, item));
  const activeSecondary = allSecondary.find((item) => linkActive(pathname, item));
  const levelLabel = serviceLevelLabel(serviceLevel);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [menuOpen]);

  return (
    <div className="border-b border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 px-6 py-3">
        <Link
          href="/companies"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Clients
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
            Agency workspace — clients review in their portal; seasonal planning and AI
            drafts stay here until approved
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <nav
        className="flex flex-wrap items-center gap-1 px-6 pb-3"
        aria-label={`${companyName} tools`}
      >
        {primary.map((item) => (
          <ToolChip
            key={item.href}
            item={item}
            active={linkActive(pathname, item)}
          />
        ))}

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            id={menuId}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
              secondaryActive || menuOpen
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {activeSecondary && !menuOpen ? activeSecondary.label : "More tools"}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                menuOpen && "rotate-180",
              )}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              aria-labelledby={menuId}
              className="absolute left-0 z-40 mt-1 w-[min(100vw-3rem,36rem)] rounded-lg border border-border bg-card p-4 shadow-lg"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                {groups.map((group) => (
                  <div key={group.id}>
                    <p className="text-xs font-semibold text-foreground">{group.label}</p>
                    {group.hint && (
                      <p className="mb-1.5 text-[11px] text-muted-foreground">{group.hint}</p>
                    )}
                    <ul className="space-y-0.5">
                      {group.items.map((item) => {
                        const active = linkActive(pathname, item);
                        return (
                          <li key={item.href}>
                            <Link
                              role="menuitem"
                              href={item.href}
                              onClick={() => setMenuOpen(false)}
                              className={cn(
                                "block rounded-md px-2 py-1 text-sm",
                                active
                                  ? "bg-accent font-medium text-primary"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                            >
                              {item.label}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              {vertical.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-1.5 text-xs font-semibold text-foreground">
                    For this business
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {vertical.map((item) => (
                      <ToolChip
                        key={item.href}
                        item={item}
                        active={linkActive(pathname, item)}
                        onNavigate={() => setMenuOpen(false)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>
    </div>
  );
}
