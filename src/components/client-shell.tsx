"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  CheckSquare,
  LogOut,
  BarChart3,
  CalendarDays,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/actions";

const NAV = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard },
  { href: "/client/requests", label: "Requests", icon: Inbox },
  { href: "/client/approvals", label: "Approvals", icon: CheckSquare },
  { href: "/client/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/client/payments", label: "Payments", icon: CreditCard },
  { href: "/client/reports", label: "Reports", icon: BarChart3 },
] as const;

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
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/client" && pathname.startsWith(item.href + "/"));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <form action={signOut}>
            <button type="submit" className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
          <span className="font-semibold">{companyName}</span>
          <form action={signOut}>
            <button type="submit" className="text-sm text-muted-foreground">Sign out</button>
          </form>
        </header>
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
