"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";

type ToolLink = {
  href: string;
  label: string;
  /** Match company-native paths (no query) for active state */
  match?: "exact" | "prefix";
};

type ToolGroup = {
  id: string;
  label: string;
  items: ToolLink[];
};

function companyTools(companyId: string): ToolGroup[] {
  const q = `company=${companyId}`;
  const base = `/companies/${companyId}`;
  return [
    {
      id: "profile",
      label: "Profile",
      items: [
        { href: base, label: "Overview", match: "exact" },
        { href: `${base}/brand-brain`, label: "Brand Brain", match: "prefix" },
        { href: `${base}/services`, label: "Services", match: "prefix" },
        { href: `${base}/offers`, label: "Offers", match: "prefix" },
        { href: `${base}/governance`, label: "Governance", match: "prefix" },
        { href: `${base}/local-seo`, label: "Local SEO", match: "prefix" },
      ],
    },
    {
      id: "create",
      label: "Create & publish",
      items: [
        { href: `/campaigns?${q}`, label: "Campaigns" },
        { href: `/studio?${q}`, label: "Studio" },
        { href: `/calendar?${q}`, label: "Calendar" },
        { href: `/publishing?${q}`, label: "Publishing" },
        { href: `/content?${q}`, label: "Content" },
        { href: `/assets?${q}`, label: "Assets" },
        { href: `/library?${q}`, label: "Reuse library" },
      ],
    },
    {
      id: "engage",
      label: "Engage",
      items: [
        { href: `/inbox?${q}`, label: "Inbox" },
        { href: `/social?${q}`, label: "Social" },
        { href: `/reviews?${q}`, label: "Reviews" },
        { href: `/requests?${q}`, label: "Requests" },
      ],
    },
    {
      id: "audience",
      label: "Audience",
      items: [
        { href: `/crm?${q}`, label: "CRM" },
        { href: `/email-marketing?${q}`, label: "Email" },
        { href: `/sms?${q}`, label: "SMS" },
        { href: `/loyalty?${q}`, label: "Loyalty" },
        { href: `/ads?${q}`, label: "Paid ads" },
      ],
    },
    {
      id: "insights",
      label: "Insights",
      items: [
        { href: `/analytics?${q}`, label: "Analytics" },
        { href: `/learning?${q}`, label: "Learning" },
      ],
    },
    {
      id: "growth",
      label: "Website & growth",
      items: [
        { href: `/cms?${q}`, label: "CMS" },
        { href: `/funnel?${q}`, label: "Funnels" },
        { href: `/workflows?${q}`, label: "Workflows" },
        { href: `/automations?${q}`, label: "Automations" },
      ],
    },
    {
      id: "vertical",
      label: "Vertical",
      items: [
        { href: `/visuals?${q}`, label: "AI visuals" },
        { href: `/photographers?${q}`, label: "Photographers" },
        { href: `/menus?${q}`, label: "Menus" },
        { href: `/ordering?${q}`, label: "Order Now" },
        { href: `/bookings?${q}`, label: "Bookings" },
      ],
    },
  ];
}

function linkActive(pathname: string, item: ToolLink): boolean {
  const pathOnly = item.href.split("?")[0];
  if (item.match === "exact") {
    return pathname === pathOnly;
  }
  if (item.match === "prefix") {
    return pathname === pathOnly || pathname.startsWith(`${pathOnly}/`);
  }
  return false;
}

export function CompanyToolsNav({
  companyId,
  companyName,
  status,
}: {
  companyId: string;
  companyName: string;
  status: string;
}) {
  const pathname = usePathname();
  const groups = companyTools(companyId);

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
            Company workspace — tools below are for this client only
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <nav className="space-y-2 px-6 pb-4" aria-label={`${companyName} tools`}>
        {groups.map((group) => (
          <div
            key={group.id}
            className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3"
          >
            <span className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {group.label}
            </span>
            <div className="flex flex-wrap gap-x-1 gap-y-1">
              {group.items.map((item) => {
                const active = linkActive(pathname, item);
                return (
                  <Link
                    key={item.href}
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
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
