"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/client/calendar", label: "Calendar" },
  { href: "/client/reports", label: "Results" },
] as const;

/** Sub-nav under Schedule & results — calendar glance + reports. */
export function ClientScheduleTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-1 border-b border-border px-4 pt-2 sm:px-5">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
