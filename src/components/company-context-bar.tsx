"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * When a module page is opened with ?company=, remind the user they are
 * working inside a company context (tools live on the company workspace).
 * Does not claim the screen is filtered — some pages only prefill forms.
 */
export function CompanyContextBar({
  companies,
}: {
  companies: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Company layout already shows the full tools hub.
  if (pathname.startsWith("/companies/")) return null;
  const companyId = searchParams.get("company");
  if (!companyId) return null;
  const company = companies.find((c) => c.id === companyId);
  if (!company) return null;

  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs">
      <Link
        href={`/companies/${company.id}`}
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3 w-3" />
        {company.name}
      </Link>
      <span className="text-muted-foreground">· client context</span>
    </div>
  );
}
