"use client";

import { useEffect, useMemo, useState } from "react";
import type { BusinessType } from "@/lib/types";
import { CAMPAIGN_GOALS } from "@/lib/business-profiles";

interface CompanyGoalHint {
  id: string;
  name: string;
  businessType: BusinessType;
}

export function CampaignObjectiveHints({
  companies,
  defaultCompanyId,
}: {
  companies: CompanyGoalHint[];
  defaultCompanyId?: string;
}) {
  const goalsByCompany = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of companies) {
      map.set(c.id, CAMPAIGN_GOALS[c.businessType] ?? CAMPAIGN_GOALS.other);
    }
    return map;
  }, [companies]);

  const [companyId, setCompanyId] = useState(
    defaultCompanyId ?? companies[0]?.id ?? "",
  );

  useEffect(() => {
    const sel = document.getElementById("companyId") as HTMLSelectElement | null;
    if (!sel) return;
    const onChange = () => setCompanyId(sel.value);
    sel.addEventListener("change", onChange);
    return () => sel.removeEventListener("change", onChange);
  }, []);

  const goals = goalsByCompany.get(companyId) ?? [];
  if (goals.length === 0) return null;

  return (
    <div className="rounded-md border border-dashed border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Suggested objectives
      </p>
      <ul className="space-y-1 text-sm text-muted-foreground">
        {goals.map((g) => (
          <li key={g}>• {g}</li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Based on the selected company&apos;s business type — copy one into the objective field.
      </p>
    </div>
  );
}
