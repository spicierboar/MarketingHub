import Link from "next/link";
import type { ComponentType } from "react";
import {
  Building2,
  Share2,
  Plug,
  FileCheck,
  Sparkles,
  Check,
  ArrowRight,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/status-badge";
import type { Company } from "@/lib/types";

export type LifecycleStepId =
  | "profile"
  | "social"
  | "connect"
  | "content"
  | "ai_ready";

export type LifecycleStep = {
  id: LifecycleStepId;
  label: string;
  done: boolean;
  href: string;
};

const STEP_ICONS: Record<
  LifecycleStepId,
  ComponentType<{ className?: string }>
> = {
  profile: Building2,
  social: Share2,
  connect: Plug,
  content: FileCheck,
  ai_ready: Sparkles,
};

export function CompanyLifecycleRow({
  company,
  industry,
  location,
  userCount,
  steps,
}: {
  company: Company;
  industry: string;
  location: string;
  userCount: number;
  steps: LifecycleStep[];
}) {
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const allDone = !next;

  return (
    <Link
      href={`/companies/${company.id}`}
      className="group flex items-center gap-3 border-b border-border px-4 py-2.5 transition-colors hover:bg-muted/40 sm:gap-4 sm:px-6"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h2 className="truncate text-sm font-semibold tracking-tight group-hover:text-primary">
            {company.name}
          </h2>
          <StatusBadge status={company.status} />
          <span className="truncate text-xs text-muted-foreground">
            {industry} · {location}
          </span>
        </div>
      </div>

      <ol
        className="hidden shrink-0 items-center gap-0.5 md:flex"
        aria-label={`Lifecycle ${doneCount} of ${steps.length}`}
      >
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[step.id];
          const isNext = next?.id === step.id;
          return (
            <li key={step.id} className="flex items-center">
              {i > 0 && (
                <span
                  className={cn(
                    "mx-0.5 h-0.5 w-2.5",
                    steps[i - 1]?.done ? "bg-emerald-400" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
              <span
                title={step.label}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border",
                  step.done && "border-emerald-500 bg-emerald-500 text-white",
                  isNext &&
                    "border-primary bg-primary/10 text-primary ring-1 ring-primary/25",
                  !step.done &&
                    !isNext &&
                    "border-border bg-card text-muted-foreground",
                )}
                aria-current={isNext ? "step" : undefined}
              >
                {step.done ? (
                  <Check className="h-3 w-3" strokeWidth={2.5} />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="hidden shrink-0 text-xs text-muted-foreground sm:block sm:w-40 lg:w-48">
        {allDone ? (
          <span className="font-medium text-emerald-700">Complete</span>
        ) : (
          <>
            <span className="text-muted-foreground">Next </span>
            <span className="font-medium text-foreground">{next!.label}</span>
            <span className="text-muted-foreground">
              {" "}
              · {doneCount}/{steps.length}
            </span>
          </>
        )}
      </p>

      <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span className="tabular-nums">{userCount}</span>
      </div>

      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
