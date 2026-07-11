"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  Inbox,
  CheckSquare,
  LogOut,
  BarChart3,
  CalendarDays,
  CreditCard,
  Image,
  LifeBuoy,
  Menu,
  X,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/actions";

/** Managed-service order: review first, ask-us last. */
const NAV = [
  { href: "/client", label: "Home", icon: Home },
  { href: "/client/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/client/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/client/reports", label: "Results", icon: BarChart3 },
  { href: "/client/assets", label: "Files", icon: Image },
  { href: "/client/profile", label: "Business", icon: Building2 },
  { href: "/client/payments", label: "Billing", icon: CreditCard },
  { href: "/client/requests", label: "Ask us", icon: Inbox },
  { href: "/client/help", label: "Help", icon: LifeBuoy },
] as const;

function NavLinks({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {NAV.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/client" && pathname.startsWith(item.href + "/"));
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </>
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
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-border px-4">
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              {companyName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{companyName}</p>
            <p className="truncate text-[11px] text-muted-foreground">{tenantName}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <NavLinks pathname={pathname} />
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
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 md:hidden">
          <button
            type="button"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="min-w-0 flex-1 truncate font-semibold">{companyName}</span>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted-foreground">
              Sign out
            </button>
          </form>
        </header>

        {mobileOpen && (
          <nav className="space-y-1 border-b border-border bg-card p-3 md:hidden">
            <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </nav>
        )}

        {/* Quick actions on mobile when menu closed */}
        {!mobileOpen && (
          <div className="flex gap-2 border-b border-border bg-card px-3 py-2 md:hidden">
            <Link
              href="/client/approvals"
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium",
                pathname.startsWith("/client/approvals")
                  ? "bg-accent text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              Approvals
            </Link>
            <Link
              href="/client/calendar"
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-center text-xs font-medium",
                pathname.startsWith("/client/calendar")
                  ? "bg-accent text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              Calendar
            </Link>
          </div>
        )}

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
