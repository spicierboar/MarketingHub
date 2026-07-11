"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import {
  LayoutDashboard,
  CheckSquare,
  ListTodo,
  Lightbulb,
  Megaphone,
  Sparkles,
  FileText,
  CalendarDays,
  Building2,
  Users,
  Handshake,
  ScrollText,
  ShieldCheck,
  ShieldAlert,
  Shield,
  CreditCard,
  Palette,
  Landmark,
  Radar,
  LogOut,
  ChevronDown,
  MessageSquareCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/actions";
import { switchTenantAction } from "@/app/(app)/tenant/actions";
import { CompanyContextBar } from "@/components/company-context-bar";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  ownerOnly?: boolean;
  platformAdminOnly?: boolean;
  salesAccess?: boolean;
  /** Non-admin members only — admins use the company workspace hub */
  memberOnly?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  pinned?: boolean;
  adminOnly?: boolean;
  items: NavItem[];
}

/**
 * Agency shell — only cross-company queues, portfolio, and workspace.
 * Company-scoped modules live on `/companies/[id]` (CompanyToolsNav).
 */
const NAV_GROUPS: NavGroup[] = [
  {
    id: "today",
    label: "Today",
    pinned: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/tasks", label: "Tasks", icon: ListTodo },
      { href: "/approvals", label: "Approvals", icon: CheckSquare, adminOnly: true },
      { href: "/recommendations", label: "Recommendations", icon: Lightbulb },
    ],
  },
  {
    id: "create-member",
    label: "Delivery",
    pinned: true,
    items: [
      { href: "/campaigns", label: "Campaigns", icon: Megaphone, memberOnly: true },
      { href: "/studio", label: "Content Studio", icon: Sparkles, memberOnly: true },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, memberOnly: true },
      { href: "/content", label: "Content library", icon: FileText, memberOnly: true },
    ],
  },
  {
    id: "portfolio",
    label: "Portfolio",
    pinned: true,
    adminOnly: true,
    items: [
      { href: "/companies", label: "Companies", icon: Building2, adminOnly: true },
      { href: "/executive", label: "Executive", icon: Landmark, adminOnly: true },
      { href: "/ai-mos", label: "AI-MOS", icon: Radar, adminOnly: true },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    adminOnly: true,
    items: [
      { href: "/sales/new-client", label: "New client", icon: Handshake, salesAccess: true },
      { href: "/users", label: "Users", icon: Users, adminOnly: true },
      { href: "/branding", label: "Branding", icon: Palette, ownerOnly: true },
      { href: "/billing", label: "Billing & plan", icon: CreditCard, ownerOnly: true },
      { href: "/admin", label: "Admin & security", icon: ShieldAlert, adminOnly: true },
      { href: "/privacy", label: "Privacy", icon: Shield, adminOnly: true },
      { href: "/ai-control", label: "AI control", icon: ShieldCheck, adminOnly: true },
      { href: "/ai-prompts", label: "AI prompts", icon: MessageSquareCode, adminOnly: true },
      { href: "/developers", label: "Developers & API", icon: Handshake, adminOnly: true },
      { href: "/audit", label: "Audit log", icon: ScrollText, adminOnly: true },
      { href: "/platform-admin", label: "Platform admin", icon: Landmark, platformAdminOnly: true },
    ],
  },
];

function itemVisible(
  n: NavItem,
  opts: {
    isAdmin: boolean;
    isOwner: boolean;
    isPlatformAdmin: boolean;
    canFieldSales: boolean;
  },
) {
  if (n.memberOnly && opts.isAdmin) return false;
  return (
    (!n.adminOnly || opts.isAdmin) &&
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
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-accent text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavSection({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) {
  const hasActive = group.items.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
  const [open, setOpen] = useState(hasActive);
  const expanded = group.pinned || open || hasActive;

  if (group.items.length === 0) return null;

  return (
    <div className="mb-2">
      {group.pinned ? (
        <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
          {group.label}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mb-1 flex w-full items-center justify-between rounded-md px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground"
          aria-expanded={expanded}
        >
          {group.label}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
          />
        </button>
      )}
      {expanded && (
        <div className="space-y-0.5">
          {group.items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return <NavLink key={item.href} item={item} active={active} />;
          })}
        </div>
      )}
    </div>
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
  canFieldSales = false,
  branding = null,
  banner,
  envLabel = null,
  children,
}: {
  user: { name: string; email: string; role: string };
  tenantName?: string;
  activeTenantId?: string;
  tenants?: { id: string; name: string }[];
  companies?: { id: string; name: string }[];
  isAdmin: boolean;
  isOwner?: boolean;
  isPlatformAdmin?: boolean;
  canFieldSales?: boolean;
  branding?: { accentColor?: string; logoUrl?: string } | null;
  banner?: { tone: "danger" | "warning"; text: string } | null;
  envLabel?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const visibility = { isAdmin, isOwner, isPlatformAdmin, canFieldSales };

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => itemVisible(n, visibility)),
  })).filter((g) => {
    if (g.items.length === 0) return false;
    if (g.adminOnly) {
      return (
        isAdmin ||
        isOwner ||
        isPlatformAdmin ||
        g.items.some((i) => i.salesAccess)
      );
    }
    return true;
  });

  const brandStyle = branding?.accentColor
    ? ({ ["--primary"]: branding.accentColor } as React.CSSProperties)
    : undefined;

  return (
    <div className="flex min-h-screen flex-1" style={brandStyle}>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              {(tenantName ?? "MC").slice(0, 2).toUpperCase()}
            </div>
          )}
          <span className="min-w-0 text-sm font-semibold leading-tight">
            {tenantName ? (
              <>
                <span className="block truncate">{tenantName}</span>
                <span className="block text-[11px] font-normal text-muted-foreground">
                  Marketing Command Centre
                </span>
              </>
            ) : (
              <>
                Marketing
                <br />
                Command Centre
              </>
            )}
          </span>
        </div>
        {tenants.length > 1 && (
          <div className="border-b border-border px-3 py-2">
            <form action={switchTenantAction}>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Workspace
              </label>
              <select
                name="tenantId"
                defaultValue={activeTenantId}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
                className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
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
        <nav className="flex-1 overflow-y-auto p-3">
          {groups.map((group) => (
            <NavSection
              key={group.id}
              group={group}
              pathname={pathname}
            />
          ))}
          {isAdmin && (
            <p className="mt-3 px-3 text-[11px] leading-relaxed text-muted-foreground">
              Campaigns, inbox, CRM, ads, and the rest live inside each{" "}
              <Link href="/companies" className="text-primary hover:underline">
                company
              </Link>
              .
            </p>
          )}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        {envLabel && (
          <div className="bg-fuchsia-700 px-4 py-1 text-center text-xs font-semibold uppercase tracking-wider text-white">
            {envLabel} — test environment, not live
          </div>
        )}
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
          <span className="font-semibold">Command Centre</span>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted-foreground">
              Sign out
            </button>
          </form>
        </header>
        {banner && (
          <div
            className={cn(
              "px-4 py-2 text-center text-sm font-medium",
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
            <CompanyContextBar companies={companies} />
          </Suspense>
        )}
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
