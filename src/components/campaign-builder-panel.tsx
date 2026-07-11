"use client";

import { useEffect, useMemo, useState } from "react";
import type { BusinessType } from "@/lib/types";
import { CAMPAIGN_GOALS } from "@/lib/business-profiles";

const CHANNEL_OPTIONS = [
  "Facebook",
  "Instagram",
  "Google Business Profile",
  "Email",
  "Paid ads",
] as const;

const QUICK_GOALS = [
  "I want more weekday customers",
  "Drive direct bookings",
  "Get more Google reviews",
];

/** Structured output sections the AI campaign layer always produces. */
export const AI_CAMPAIGN_PLAN_SECTIONS = [
  {
    key: "userFacts",
    title: "User-provided facts",
    hint: "Your goal, audience, budget, dates, and channel choices — quoted back without invention.",
  },
  {
    key: "systemData",
    title: "System data",
    hint: "Company profile, services, timezone, and Brand Brain context retrieved for this tenant.",
  },
  {
    key: "assumptions",
    title: "AI assumptions",
    hint: "Inferred campaign type, missing budget handling, and other model assumptions to verify.",
  },
  {
    key: "recommendations",
    title: "Recommendations",
    hint: "Objective, channel plan, KPIs, and proposed draft actions — not live changes.",
  },
  {
    key: "risks",
    title: "Risks",
    hint: "Compliance flags, builder warnings, and claim issues that need a human eye.",
  },
  {
    key: "missingInfo",
    title: "Missing info",
    hint: "Gaps (budget, audience, catalogue) that would improve the next plan revision.",
  },
  {
    key: "requiredApprovals",
    title: "Required approvals",
    hint: "Human gates before approve, schedule, publish, spend, or promotion activation.",
  },
] as const;

interface CompanyGoalHint {
  id: string;
  name: string;
  businessType: BusinessType;
}

export function CampaignBuilderPanel({
  companies,
  defaultCompanyId,
  defaultStart,
  showStructuredSections = true,
}: {
  companies: CompanyGoalHint[];
  defaultCompanyId?: string;
  defaultStart: string;
  /** When false, hide the structured-output legend (rare). */
  showStructuredSections?: boolean;
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

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Channels (multi-select)
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          {CHANNEL_OPTIONS.map((ch) => (
            <label key={ch} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                name="channels"
                value={ch}
                defaultChecked={["Facebook", "Instagram", "Google Business Profile"].includes(ch)}
                className="rounded border-border"
              />
              {ch}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Leave defaults for a balanced social + local plan, or pick channels for your goal.
        </p>
      </div>

      {showStructuredSections && (
        <div className="mt-5 rounded-md border border-border/80 bg-background/80 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Structured plan output
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            After you build, the plan review separates facts from assumptions. Full sections
            appear on the campaign detail page — nothing is published or spent automatically.
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            {AI_CAMPAIGN_PLAN_SECTIONS.map((section) => (
              <div
                key={section.key}
                className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2"
              >
                <dt className="text-xs font-medium text-foreground">{section.title}</dt>
                <dd className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {section.hint}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

/** Server-friendly review of a structured campaign draft (layer meta / orchestrator). */
export function AiCampaignPlanReviewSections({
  draft,
  compact = false,
}: {
  draft: {
    userFacts?: string[];
    systemData?: string[];
    assumptions?: string[];
    recommendations?: string[];
    risks?: string[];
    missingInfo?: string[];
    requiredApprovals?: string[];
  };
  compact?: boolean;
}) {
  const sections: Array<{ title: string; items: string[]; tone?: "warn" | "default" }> = [
    { title: "User-provided facts", items: draft.userFacts ?? [] },
    { title: "System data", items: draft.systemData ?? [] },
    { title: "AI assumptions", items: draft.assumptions ?? [] },
    { title: "Recommendations", items: draft.recommendations ?? [] },
    { title: "Risks", items: draft.risks ?? [], tone: "warn" },
    { title: "Missing info", items: draft.missingInfo ?? [] },
    { title: "Required approvals", items: draft.requiredApprovals ?? [] },
  ];

  const visible = sections.filter((s) => s.items.length > 0);
  if (!visible.length) return null;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {visible.map((section) => (
        <div key={section.title}>
          <p
            className={
              compact
                ? "text-xs font-medium uppercase tracking-wide text-muted-foreground"
                : "text-sm font-medium"
            }
          >
            {section.title}
          </p>
          <ul
            className={`mt-1 list-inside list-disc text-sm ${
              section.tone === "warn"
                ? "text-amber-700 dark:text-amber-400"
                : "text-muted-foreground"
            }`}
          >
            {section.items.map((item) => (
              <li key={item.slice(0, 80)}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
