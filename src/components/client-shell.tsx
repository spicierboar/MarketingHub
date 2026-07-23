"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  CheckSquare,
  LogOut,
  CalendarDays,
  BarChart3,
  CreditCard,
  Package,
  MessageSquare,
  User,
  Share2,
  Map,
  FileText,
  FolderOpen,
  HelpCircle,
  LayoutDashboard,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/actions";
import { CLIENT_ROLE_LABEL } from "@/lib/managed-service/client-ux";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPrefixes?: string[];
  /** Only exact path matches (e.g. /client account overview). */
  exact?: boolean;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

/**
 * Client rail — sectioned so Account destinations live in the menu,
 * not as a second hub grid on /client/account.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    id: "action",
    label: "Action",
    items: [
      { href: "/client", label: "Attention", icon: Home, exact: true },
      {
        href: "/client/approvals",
        label: "Approvals",
        icon: CheckSquare,
        matchPrefixes: ["/client/approvals"],
      },
      {
        href: "/client/requests",
        label: "Ask us",
        icon: MessageSquare,
        matchPrefixes: ["/client/requests"],
      },
    ],
  },
  {
    id: "delivery",
    label: "Delivery",
    items: [
      {
        href: "/client/calendar",
        label: "Schedule",
        icon: CalendarDays,
        matchPrefixes: ["/client/calendar", "/client/schedule"],
      },
      {
        href: "/client/reports",
        label: "Results",
        icon: BarChart3,
        matchPrefixes: ["/client/reports"],
      },
    ],
  },
  {
    id: "order",
    label: "Add-ons",
    items: [
      {
        href: "/client/order",
        label: "Buy",
        icon: Package,
        matchPrefixes: ["/client/order"],
      },
    ],
  },
  {
    id: "business",
    label: "Your business",
    items: [
      {
        href: "/client/account",
        label: "Overview",
        icon: LayoutDashboard,
        exact: true,
      },
      {
        href: "/client/profile",
        label: "Business info",
        icon: User,
        matchPrefixes: ["/client/profile"],
      },
      {
        href: "/client/connect",
        label: "Social accounts",
        icon: Share2,
        matchPrefixes: ["/client/connect"],
      },
      {
        href: "/client/strategy",
        label: "Strategy",
        icon: Map,
        matchPrefixes: ["/client/strategy"],
      },
      {
        href: "/client/content",
        label: "Content status",
        icon: FileText,
        matchPrefixes: ["/client/content"],
      },
      {
        href: "/client/payments",
        label: "Billing",
        icon: CreditCard,
        matchPrefixes: ["/client/payments", "/client/billing"],
      },
      {
        href: "/client/assets",
        label: "Files",
        icon: FolderOpen,
        matchPrefixes: ["/client/assets"],
      },
      {
        href: "/client/help",
        label: "Help",
        icon: HelpCircle,
        matchPrefixes: ["/client/help"],
      },
    ],
  },
];

const MOBILE_QUICK: { href: string; label: string }[] = [
  { href: "/client", label: "Home" },
  { href: "/client/approvals", label: "Approvals" },
  { href: "/client/calendar", label: "Schedule" },
  { href: "/client/order", label: "Buy" },
  { href: "/client/account", label: "Account" },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  if (pathname === item.href) return true;
  const prefixes = item.matchPrefixes ?? [item.href];
  return prefixes.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="space-y-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.id}>
          <p className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
            {section.label}
          </p>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActive(pathname, item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-accent text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ClientShell({
  user,
  companyName,
  tenantName,
  branding = null,
  envLabel = null,
  children,
}: {
  user: { name: string; email: string };
  companyName: string;
  tenantName: string;
  branding?: { accentColor?: string; logoUrl?: string } | null;
  envLabel?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const brandStyle = branding?.accentColor
    ? ({ ["--primary"]: branding.accentColor } as React.CSSProperties)
    : undefined;

  return (
    <div className="flex min-h-screen flex-1" style={brandStyle}>
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-12 items-center gap-2 border-b border-border px-3">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={branding.logoUrl}
              alt=""
              className="h-7 w-7 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
              {companyName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              {companyName}
            </p>
            <p className="truncate text-[10px] text-muted-foreground">
              {tenantName}
            </p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="border-t border-border p-2">
          <div className="mb-1 px-2">
            <p className="truncate text-xs font-medium">{user.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {user.email}
            </p>
            <p className="text-[10px] font-medium text-primary">{CLIENT_ROLE_LABEL}</p>
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
          <div className="bg-slate-800 px-3 py-0.5 text-center text-[10px] font-medium tracking-wide text-slate-100">
            {envLabel}
          </div>
        )}
        <header className="flex h-12 items-center justify-between gap-2 border-b border-border bg-card px-3 md:hidden">
          <button
            type="button"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {companyName}
          </span>
          <span className="text-[10px] font-medium text-primary">{CLIENT_ROLE_LABEL}</span>
          <form action={signOut}>
            <button type="submit" className="text-xs text-muted-foreground">
              Sign out
            </button>
          </form>
        </header>

        {mobileOpen && (
          <nav className="max-h-[70vh] overflow-y-auto border-b border-border bg-card p-2 md:hidden">
            <NavLinks
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </nav>
        )}

        {!mobileOpen && (
          <div className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-1.5 md:hidden">
            {MOBILE_QUICK.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={
                  pathname === item.href ||
                  (item.href !== "/client" && pathname.startsWith(`${item.href}/`))
                    ? "page"
                    : undefined
                }
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-center text-[11px] font-medium",
                  pathname === item.href ||
                    (item.href !== "/client" && pathname.startsWith(`${item.href}/`))
                    ? "bg-accent text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
