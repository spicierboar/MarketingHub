"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  CheckSquare,
  LogOut,
  CalendarDays,
  CreditCard,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/actions";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Short label for mobile quick strip */
  short?: string;
  /** Extra path prefixes that keep this item active */
  matchPrefixes?: string[];
};

/**
 * Wave A — four review surfaces only.
 * Promos / Files / Profile / Help stay reachable via deep links or Account.
 */
const NAV_ITEMS: NavItem[] = [
  { href: "/client", label: "Needs you", icon: Home, short: "Home" },
  {
    href: "/client/approvals",
    label: "Approvals",
    icon: CheckSquare,
    short: "Approve",
  },
  {
    href: "/client/calendar",
    label: "Schedule & results",
    icon: CalendarDays,
    short: "Schedule",
    matchPrefixes: ["/client/calendar", "/client/reports", "/client/schedule"],
  },
  {
    href: "/client/account",
    label: "Account",
    icon: CreditCard,
    short: "Account",
    matchPrefixes: [
      "/client/account",
      "/client/connect",
      "/client/payments",
      "/client/billing",
      "/client/requests",
      "/client/assets",
      "/client/help",
      "/client/profile",
      "/client/strategy",
      "/client/content",
      "/client/promos",
      "/client/value-add",
    ],
  },
];

/** Mobile quick strip: Approvals · Schedule · Results · Account */
const MOBILE_QUICK: { href: string; label: string }[] = [
  { href: "/client/approvals", label: "Approvals" },
  { href: "/client/calendar", label: "Schedule" },
  { href: "/client/reports", label: "Results" },
  { href: "/client/account", label: "Account" },
];

function isActive(pathname: string, item: NavItem) {
  if (pathname === item.href) return true;
  if (item.href === "/client") return false;
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
    <div className="space-y-0.5">
      {NAV_ITEMS.map((item) => {
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
  );
}

export function ClientShell({
  user,
  companyName,
  tenantName,
  branding = null,
  children,
}: {
  user: { name: string; email: string };
  companyName: string;
  tenantName: string;
  branding?: { accentColor?: string; logoUrl?: string } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const brandStyle = branding?.accentColor
    ? ({ ["--primary"]: branding.accentColor } as React.CSSProperties)
    : undefined;

  return (
    <div className="flex min-h-screen flex-1" style={brandStyle}>
      <aside className="hidden w-52 shrink-0 flex-col border-r border-border bg-card md:flex">
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
            <p className="text-[10px] font-medium text-primary">Client Approver</p>
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
          <span className="text-[10px] font-medium text-primary">Client Approver</span>
          <form action={signOut}>
            <button type="submit" className="text-xs text-muted-foreground">
              Sign out
            </button>
          </form>
        </header>

        {mobileOpen && (
          <nav className="border-b border-border bg-card p-2 md:hidden">
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
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
                    ? "page"
                    : undefined
                }
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-center text-[11px] font-medium",
                  pathname === item.href || pathname.startsWith(`${item.href}/`)
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
