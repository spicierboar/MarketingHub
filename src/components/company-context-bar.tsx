"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * When a module page is opened with ?company=, remind the user they are
 * working inside a company context (tools live on the company workspace).
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
    <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2 text-sm">
      <Link
        href={`/companies/${company.id}`}
        className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {company.name}
      </Link>
      <span className="text-muted-foreground">
        Company workspace — this screen is filtered to this client
      </span>
    </div>
  );
}
