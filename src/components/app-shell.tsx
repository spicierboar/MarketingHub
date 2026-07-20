"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  LayoutDashboard,
  CheckSquare,
  Lightbulb,
  Megaphone,
  Package,
  Sparkles,
  FileText,
  CalendarDays,
  Building2,
  UserPlus,
  LogOut,
  ChevronDown,
  Send,
  BarChart3,
  MessageSquare,
  Settings,
  Tag,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/actions";
import { switchTenantAction } from "@/app/(app)/tenant/actions";
import {
  CompanyContextBar,
  type CompanyWorkspaceNavData,
} from "@/components/company-context-bar";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  /** Visible when the user can approve content (admins always can). */
  approveAccess?: boolean;
  ownerOnly?: boolean;
  platformAdminOnly?: boolean;
  salesAccess?: boolean;
  /** Visible on the focused sales_rep shell (wizard + home). */
  salesHome?: boolean;
  /** Non-admin members only — admins use the company workspace hub */
  memberOnly?: boolean;
  /** Extra path prefixes that keep this item highlighted (e.g. Settings hub children). */
  alsoActiveFor?: string[];
}

interface NavGroup {
  id: string;
  label: string;
  pinned?: boolean;
  adminOnly?: boolean;
  items: NavItem[];
}

const SETTINGS_PATHS = [
  "/settings",
  "/settings/legal",
  "/users",
  "/branding",
  "/billing",
  "/admin",
  "/privacy",
  "/ai-control",
  "/ai-prompts",
  "/developers",
  "/audit",
  "/platform-admin",
];

/**
 * Agency shell — ≤7 mental-model destinations for an automation ops desk.
 * Client workspace tools (CompanyToolsNav) also appear via CompanyContextBar
 * when a module is opened with ?company=.
 *
 * Home · Queues · Clients · Catalogs · Content & Delivery · AI Ops · Results · Settings
 */
const NAV_GROUPS: NavGroup[] = [
  {
    id: "home",
    label: "Agency",
    pinned: true,
    items: [
      { href: "/dashboard", label: "Home", icon: LayoutDashboard },
      // Sales-focused home (hidden for admins via salesHome + isSalesRepFocused).
      { href: "/sales", label: "Sales home", icon: LayoutDashboard, salesHome: true },
    ],
  },
  {
    id: "queues",
    label: "Queues",
    pinned: true,
    items: [
      { href: "/approvals", label: "Approvals", icon: CheckSquare, approveAccess: true },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    pinned: true,
    adminOnly: true,
    items: [
      { href: "/companies", label: "Clients", icon: Building2, adminOnly: true },
      {
        href: "/sales/new-client",
        label: "New client",
        icon: UserPlus,
        salesAccess: true,
        salesHome: true,
      },
      { href: "/requests", label: "Client asks", icon: MessageSquare },
    ],
  },
  {
    id: "catalogs",
    label: "Catalogs",
    pinned: true,
    adminOnly: true,
    items: [
      { href: "/promo-catalog", label: "Promo catalog", icon: Tag, adminOnly: true },
      { href: "/marketing-packages", label: "Marketing packages", icon: Package, adminOnly: true },
    ],
  },
  {
    id: "content-delivery",
    label: "Content & Delivery",
    pinned: true,
    items: [
      // Usage order: plan → produce → schedule → publish
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/content", label: "Content", icon: FileText },
      { href: "/studio", label: "Content Studio", icon: Sparkles, memberOnly: true },
      { href: "/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/publishing", label: "Publishing", icon: Send, adminOnly: true },
    ],
  },
  {
    id: "service-quality",
    label: "Service quality",
    pinned: true,
    adminOnly: true,
    items: [
      { href: "/recommendations", label: "Opportunities", icon: Lightbulb },
    ],
  },
  {
    id: "results",
    label: "Results",
    pinned: true,
    adminOnly: true,
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3, adminOnly: true },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    pinned: true,
    adminOnly: true,
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        adminOnly: true,
        alsoActiveFor: SETTINGS_PATHS,
      },
      {
        href: "/settings/legal",
        label: "Terms & Privacy Policy",
        icon: FileText,
        adminOnly: true,
      },
    ],
  },
];

/** Module hubs that keep ?company= — treat as client workspace, not top-level agency nav. */
const COMPANY_WORKSPACE_PREFIXES = [
  "/content",
  "/studio",
  "/calendar",
  "/publishing",
  "/campaigns",
  "/approvals",
  "/assets",
  "/library",
  "/analytics",
  "/ads",
  "/inbox",
  "/social",
  "/reviews",
  "/requests",
  "/audit",
  "/workflows",
  "/learning",
  "/visuals",
  "/photographers",
  "/menus",
  "/ordering",
  "/bookings",
];

function pathMatches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function isCompanyWorkspaceRoute(pathname: string) {
  return COMPANY_WORKSPACE_PREFIXES.some((p) => pathMatches(pathname, p));
}

function itemActive(
  item: NavItem,
  pathname: string,
  companyScoped: boolean,
) {
  // With ?company=, highlight Clients and leave Content & Delivery/etc. quiet —
  // the context bar + company strip are the primary wayfinding.
  if (companyScoped && isCompanyWorkspaceRoute(pathname)) {
    return item.href === "/companies";
  }
  if (pathMatches(pathname, item.href)) return true;
  return (item.alsoActiveFor ?? []).some((p) => pathMatches(pathname, p));
}

function itemVisible(
  n: NavItem,
  opts: {
    isAdmin: boolean;
    isOwner: boolean;
    isPlatformAdmin: boolean;
    canApprove: boolean;
    canFieldSales: boolean;
    /** Non-admin sales_rep — show only salesHome items. */
    isSalesRepFocused: boolean;
  },
) {
  // PLACEHOLDER: confirm exact hide list with product (ops queues, catalogs, AI, etc.).
  if (opts.isSalesRepFocused) {
    return Boolean(n.salesHome);
  }
  if (n.salesHome && !opts.isSalesRepFocused) return false;
  if (n.memberOnly && opts.isAdmin) return false;
  return (
    (!n.adminOnly || opts.isAdmin) &&
    (!n.approveAccess || opts.canApprove) &&
    (!n.ownerOnly || opts.isOwner) &&
    (!n.platformAdminOnly || opts.isPlatformAdmin) &&
    (!n.salesAccess || opts.canFieldSales)
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavSection({
  group,
  pathname,
  companyScoped,
}: {
  group: NavGroup;
  pathname: string;
  companyScoped: boolean;
}) {
  const hasActive = group.items.some((item) =>
    itemActive(item, pathname, companyScoped),
  );
  const [open, setOpen] = useState(hasActive);
  const expanded = group.pinned || open || hasActive;

  if (group.items.length === 0) return null;

  return (
    <div className="mb-1.5">
      {group.pinned ? (
        <p className="mb-0.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          {group.label}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mb-0.5 flex w-full items-center justify-between rounded-md px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground"
          aria-expanded={expanded}
        >
          <span className="inline-flex items-center gap-1.5">
            {group.id === "settings" && <Settings className="h-3 w-3" />}
            {group.label}
          </span>
          <ChevronDown
            className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
          />
        </button>
      )}
      {expanded && (
        <div className="space-y-0.5">
          {group.items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={itemActive(item, pathname, companyScoped)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarNav({
  groups,
  pathname,
}: {
  groups: NavGroup[];
  pathname: string;
}) {
  const searchParams = useSearchParams();
  const companyScoped = Boolean(searchParams.get("company"));
  return (
    <>
      {groups.map((group) => (
        <NavSection
          key={group.id}
          group={group}
          pathname={pathname}
          companyScoped={companyScoped}
        />
      ))}
    </>
  );
}

export function AppShell({
  user,
  tenantName,
  activeTenantId,
  tenants = [],
  companies = [],
  isAdmin,
  isOwner = false,
  isPlatformAdmin = false,
  canApprove = false,
  canViewAudit = false,
  canFieldSales = false,
  isSalesRepFocused = false,
  branding = null,
  banner,
  envLabel = null,
  children,
}: {
  user: { name: string; email: string; role: string };
  tenantName?: string;
  activeTenantId?: string;
  tenants?: { id: string; name: string }[];
  companies?: CompanyWorkspaceNavData[];
  isAdmin: boolean;
  isOwner?: boolean;
  isPlatformAdmin?: boolean;
  canApprove?: boolean;
  canViewAudit?: boolean;
  canFieldSales?: boolean;
  isSalesRepFocused?: boolean;
  branding?: { accentColor?: string; logoUrl?: string } | null;
  banner?: { tone: "danger" | "warning"; text: string } | null;
  envLabel?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const visibility = {
    isAdmin,
    isOwner,
    isPlatformAdmin,
    canApprove,
    canFieldSales,
    isSalesRepFocused,
  };
  const toolsAccess = { isAdmin, canApprove, canViewAudit };

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => itemVisible(n, visibility)),
  })).filter((g) => {
    if (g.items.length === 0) return false;
    if (isSalesRepFocused) return true;
    if (g.adminOnly) {
      return (
        isAdmin ||
        isOwner ||
        isPlatformAdmin ||
        g.items.some((i) => i.salesAccess || i.salesHome)
      );
    }
    return true;
  });

  const brandStyle = branding?.accentColor
    ? ({ ["--primary"]: branding.accentColor } as React.CSSProperties)
    : undefined;

  return (
    <div className="flex min-h-screen flex-1" style={brandStyle}>
      <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
              {(tenantName ?? "MC").slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="min-w-0 text-sm font-semibold leading-tight">
            {tenantName ? (
              <>
                <span className="block truncate">{tenantName}</span>
                <span className="block text-[10px] font-normal text-muted-foreground">
                  Command Centre
                </span>
              </>
            ) : (
              "Command Centre"
            )}
          </span>
        </div>
        {tenants.length > 1 && (
          <div className="border-b border-border px-2 py-1.5">
            <form action={switchTenantAction}>
              <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Workspace
              </label>
              <select
                name="tenantId"
                defaultValue={activeTenantId}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="w-full rounded-md border border-input bg-card px-2 py-1 text-xs"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <noscript>
                <button type="submit" className="mt-1 text-xs text-primary">
                  Switch
                </button>
              </noscript>
            </form>
          </div>
        )}
        <nav className="flex-1 overflow-y-auto p-2">
          <Suspense fallback={null}>
            <SidebarNav groups={groups} pathname={pathname} />
          </Suspense>
        </nav>
        <div className="border-t border-border p-2">
          <div className="mb-1 px-2">
            <p className="truncate text-xs font-medium">{user.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
            <p className="text-[10px] font-medium text-primary">
              {isAdmin ? "Admin" : "Staff"}
            </p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {envLabel && (
          <div className="bg-fuchsia-700 px-3 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-white">
            {envLabel} — test, not live
          </div>
        )}
        <header className="flex h-12 items-center justify-between gap-2 border-b border-border bg-card px-3 md:hidden">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">Command Centre</span>
          <span className="text-[10px] font-medium text-primary">
            {isAdmin ? "Admin" : "Staff"}
          </span>
          <form action={signOut}>
            <button type="submit" className="text-xs text-muted-foreground">
              Sign out
            </button>
          </form>
        </header>
        {mobileOpen && (
          <nav className="max-h-[70vh] overflow-y-auto border-b border-border bg-card p-2 md:hidden">
            <Suspense fallback={null}>
              <SidebarNav groups={groups} pathname={pathname} />
            </Suspense>
          </nav>
        )}
        {banner && (
          <div
            className={cn(
              "px-3 py-1.5 text-center text-xs font-medium",
              banner.tone === "danger"
                ? "bg-red-600 text-white"
                : "bg-amber-500 text-white",
            )}
          >
            {banner.text}
          </div>
        )}
        {companies.length > 0 && (
          <Suspense fallback={null}>
            <CompanyContextBar companies={companies} access={toolsAccess} />
          </Suspense>
        )}
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
