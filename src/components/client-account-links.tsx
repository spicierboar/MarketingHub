"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/client/account", label: "Overview", exact: true },
  { href: "/client/profile", label: "Profile" },
  { href: "/client/strategy", label: "Strategy" },
  { href: "/client/content", label: "Content" },
  { href: "/client/calendar", label: "Schedule" },
  { href: "/client/payments", label: "Billing" },
  { href: "/client/value-add", label: "Value-add" },
  { href: "/client/requests", label: "Ask us" },
  { href: "/client/assets", label: "Files" },
] as const;

/** Sub-nav under Account — billing, asks, optional file drop. */
export function ClientAccountLinks() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1 border-b border-border px-4 pt-2 sm:px-5">
      {LINKS.map((link) => {
        const exact = "exact" in link && link.exact;
        const active = exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors sm:text-sm",
              active
                ? "bg-accent text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
