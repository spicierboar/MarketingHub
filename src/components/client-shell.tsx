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
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/actions";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Short label for mobile quick strip */
  short?: string;
};

/** Review first, then account, then support — matches managed-service mental model. */
const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Review",
    items: [
      { href: "/client", label: "Home", icon: Home, short: "Home" },
      { href: "/client/approvals", label: "Approvals", icon: CheckSquare, short: "Approve" },
      { href: "/client/promos", label: "Promotions", icon: Megaphone, short: "Promos" },
      { href: "/client/calendar", label: "Calendar", icon: CalendarDays, short: "Calendar" },
      { href: "/client/reports", label: "Results", icon: BarChart3, short: "Results" },
    ],
  },
  {
    label: "Account",
    items: [
      { href: "/client/assets", label: "Files", icon: Image, short: "Files" },
      { href: "/client/profile", label: "Business", icon: Building2, short: "Business" },
      { href: "/client/payments", label: "Billing", icon: CreditCard, short: "Billing" },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/client/requests", label: "Ask us", icon: Inbox, short: "Ask" },
      { href: "/client/help", label: "Help", icon: LifeBuoy, short: "Help" },
    ],
  },
];

const MOBILE_QUICK = [
  "/client/approvals",
  "/client/calendar",
  "/client/reports",
  "/client/payments",
] as const;

function isActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/client" && pathname.startsWith(href + "/"))
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
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="mb-2.5">
          <p className="mb-0.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
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

  const quickItems = NAV_GROUPS.flatMap((g) => g.items).filter((i) =>
    (MOBILE_QUICK as readonly string[]).includes(i.href),
  );

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
            {quickItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1 text-center text-[11px] font-medium",
                  isActive(pathname, item.href)
                    ? "bg-accent text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {item.short ?? item.label}
              </Link>
            ))}
          </div>
        )}

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
