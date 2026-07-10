"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Inbox,
  AtSign,
  Megaphone,
  Sparkles,
  FileText,
  BookOpen,
  Images,
  CalendarDays,
  CheckSquare,
  ListTodo,
  Lightbulb,
  Mail,
  MessageSquare,
  Star,
  Bot,
  Radar,
  BarChart3,
  Target,
  Smartphone,
  Clapperboard,
  Camera,
  UtensilsCrossed,
  ShoppingBag,
  Building2,
  Users,
  Handshake,
  ScrollText,
  Send,
  ShieldCheck,
  ShieldAlert,
  CreditCard,
  Palette,
  ContactRound,
  Landmark,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/login/actions";
import { switchTenantAction } from "@/app/(app)/tenant/actions";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  ownerOnly?: boolean; // tenant owner only (billing / commercial)
  platformAdminOnly?: boolean; // platform operator only (cross-tenant surface)
  salesAccess?: boolean;
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/requests", label: "Support Requests", icon: Inbox },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/studio", label: "Content Studio", icon: Sparkles },
  { href: "/visuals", label: "AI Visuals", icon: Clapperboard, adminOnly: true },
  { href: "/photographers", label: "Photographers", icon: Camera, adminOnly: true },
  { href: "/menus", label: "Menus", icon: UtensilsCrossed, adminOnly: true },
  { href: "/ordering", label: "Order Now", icon: ShoppingBag, adminOnly: true },
  { href: "/content", label: "Content", icon: FileText },
  { href: "/assets", label: "Creative Assets", icon: Images },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/library", label: "Reuse Library", icon: BookOpen },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, adminOnly: true },
  { href: "/inbox", label: "Social Inbox", icon: AtSign },
  { href: "/social", label: "Social Responses", icon: MessageSquare },
  { href: "/reviews", label: "Reviews", icon: Star, adminOnly: true },
  { href: "/recommendations", label: "Recommendations", icon: Lightbulb },
  { href: "/ai-mos", label: "AI-MOS", icon: Radar, adminOnly: true },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/automations", label: "Automations", icon: Bot, adminOnly: true },
  { href: "/analytics", label: "Analytics", icon: BarChart3, adminOnly: true },
  { href: "/email-marketing", label: "Email Marketing", icon: Mail, adminOnly: true },
  { href: "/ads", label: "Paid Advertising", icon: Target, adminOnly: true },
  { href: "/sms", label: "SMS Marketing", icon: Smartphone, adminOnly: true },
  { href: "/crm", label: "CRM", icon: ContactRound, adminOnly: true },
  { href: "/companies", label: "Companies", icon: Building2, adminOnly: true },
  { href: "/sales/new-client", label: "New client", icon: Handshake, salesAccess: true },
  { href: "/publishing", label: "Publishing", icon: Send, adminOnly: true },
  { href: "/users", label: "Users", icon: Users, adminOnly: true },
  { href: "/branding", label: "Branding", icon: Palette, ownerOnly: true },
  { href: "/billing", label: "Billing & Plan", icon: CreditCard, ownerOnly: true },
  { href: "/admin", label: "Admin & Security", icon: ShieldAlert, adminOnly: true },
  { href: "/developers", label: "Developers & API", icon: Handshake, adminOnly: true },
  { href: "/ai-control", label: "AI Control", icon: ShieldCheck, adminOnly: true },
  { href: "/audit", label: "Audit Log", icon: ScrollText, adminOnly: true },
  { href: "/platform-admin", label: "Platform Admin", icon: Landmark, platformAdminOnly: true },
];

export function AppShell({
  user,
  tenantName,
  activeTenantId,
  tenants = [],
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
  isAdmin: boolean;
  isOwner?: boolean;
  isPlatformAdmin?: boolean;
  canFieldSales?: boolean;
  branding?: { accentColor?: string; logoUrl?: string } | null;
  banner?: { tone: "danger" | "warning"; text: string } | null;
  envLabel?: string | null; // "STAGING"/"DEVELOPMENT" ribbon; null in production
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const items = NAV.filter(
    (n) =>
      (!n.adminOnly || isAdmin) &&
      (!n.ownerOnly || isOwner) &&
      (!n.platformAdminOnly || isPlatformAdmin) &&
      (!n.salesAccess || canFieldSales),
  );
  // T6 white-label: override the theme accent for this tenant.
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
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(item.href + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
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
        {/* Non-production environment ribbon (STAGING/DEVELOPMENT). */}
        {envLabel && (
          <div className="bg-fuchsia-700 px-4 py-1 text-center text-xs font-semibold uppercase tracking-wider text-white">
            {envLabel} — test environment, not live
          </div>
        )}
        {/* Mobile top bar */}
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
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
