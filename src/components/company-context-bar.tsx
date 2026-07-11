"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * When a module page is opened with ?company=, show that we are in
 * **agency tools for this client** (not the client portal).
 * Company layout already has CompanyToolsNav — skip there.
 */
export function CompanyContextBar({
  companies,
}: {
  companies: { id: string; name: string }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (pathname.startsWith("/companies/")) return null;
  const companyId = searchParams.get("company");
  if (!companyId) return null;
  const company = companies.find((c) => c.id === companyId);
  if (!company) return null;

  const moduleLabel = moduleLabelForPath(pathname);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs">
      <Link
        href={`/companies/${company.id}`}
        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3 w-3" />
        {company.name}
      </Link>
      <span className="text-muted-foreground">/</span>
      <span className="font-medium text-foreground">{moduleLabel}</span>
      <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        Agency tools
      </span>
      <span className="text-muted-foreground">
        — not the client portal · data scoped to this client where applicable
      </span>
    </div>
  );
}

function moduleLabelForPath(pathname: string): string {
  if (pathname.startsWith("/calendar")) return "Delivery calendar";
  if (pathname.startsWith("/content")) return "Content";
  if (pathname.startsWith("/campaigns")) return "Campaigns";
  if (pathname.startsWith("/studio")) return "Studio";
  if (pathname.startsWith("/publishing")) return "Publishing";
  if (pathname.startsWith("/approvals")) return "Approvals";
  if (pathname.startsWith("/assets")) return "Assets";
  if (pathname.startsWith("/analytics")) return "Analytics";
  if (pathname.startsWith("/ads")) return "Paid ads";
  if (pathname.startsWith("/inbox")) return "Social inbox";
  if (pathname.startsWith("/requests")) return "Client asks";
  return "Module";
}
