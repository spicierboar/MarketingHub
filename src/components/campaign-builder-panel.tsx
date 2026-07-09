"use client";

import { useEffect, useMemo, useState } from "react";
import type { BusinessType } from "@/lib/types";
import { CAMPAIGN_GOALS } from "@/lib/business-profiles";

const QUICK_GOALS = [
  "I want more weekday customers",
  "Drive direct bookings",
  "Get more Google reviews",
];

interface CompanyGoalHint {
  id: string;
  name: string;
  businessType: BusinessType;
}

export function CampaignBuilderPanel({
  companies,
  defaultCompanyId,
  defaultStart,
}: {
  companies: CompanyGoalHint[];
  defaultCompanyId?: string;
  defaultStart: string;
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
    const sel = document.getElementById("builderCompanyId") as HTMLSelectElement | null;
    if (!sel) return;
    const onChange = () => setCompanyId(sel.value);
    sel.addEventListener("change", onChange);
    return () => sel.removeEventListener("change", onChange);
  }, []);

  const verticalGoals = goalsByCompany.get(companyId) ?? [];

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-medium">Build from goal</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Describe what you want in plain language — the AI drafts strategy, channel plan,
        KPIs, calendar items, and governed content drafts. Nothing schedules until you approve.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_GOALS.map((g) => (
          <button
            key={g}
            type="button"
            className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
            onClick={() => {
              const ta = document.getElementById("goal") as HTMLTextAreaElement | null;
              if (ta) ta.value = g;
            }}
          >
            {g}
          </button>
        ))}
      </div>

      {verticalGoals.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            For this business type
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {verticalGoals.slice(0, 3).map((g) => (
              <li key={g}>
                <button
                  type="button"
                  className="text-left hover:text-foreground hover:underline"
                  onClick={() => {
                    const ta = document.getElementById("goal") as HTMLTextAreaElement | null;
                    if (ta) ta.value = g;
                  }}
                >
                  {g}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <input type="hidden" name="startDate" value={defaultStart} />
    </div>
  );
}
