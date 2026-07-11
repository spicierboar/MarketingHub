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
      className="group block border-b border-border px-6 py-5 transition-colors hover:bg-muted/40"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold tracking-tight group-hover:text-primary">
              {company.name}
            </h2>
            <StatusBadge status={company.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {industry} · {location}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          {userCount} user{userCount === 1 ? "" : "s"}
        </div>
      </div>

      <ol className="mt-5 grid grid-cols-5 gap-0">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[step.id];
          const isNext = next?.id === step.id;
          const lineDone = step.done;
          return (
            <li key={step.id} className="relative flex flex-col items-center">
              {i > 0 && (
                <span
                  className={cn(
                    "absolute left-0 right-1/2 top-[1.125rem] h-0.5 -translate-y-1/2",
                    steps[i - 1]?.done ? "bg-emerald-400" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
              {i < steps.length - 1 && (
                <span
                  className={cn(
                    "absolute left-1/2 right-0 top-[1.125rem] h-0.5 -translate-y-1/2",
                    lineDone ? "bg-emerald-400" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
              <span
                className={cn(
                  "relative z-[1] flex h-9 w-9 items-center justify-center rounded-full border-2",
                  step.done && "border-emerald-500 bg-emerald-500 text-white",
                  isNext &&
                    "border-primary bg-primary/10 text-primary ring-2 ring-primary/20",
                  !step.done &&
                    !isNext &&
                    "border-border bg-card text-muted-foreground",
                )}
                aria-current={isNext ? "step" : undefined}
              >
                {step.done ? (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </span>
              <span
                className={cn(
                  "mt-2 text-center text-[11px] font-medium leading-tight",
                  step.done && "text-emerald-700",
                  isNext && "text-primary",
                  !step.done && !isNext && "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground">
          {allDone ? (
            <span className="font-medium text-emerald-700">
              Lifecycle complete — open workspace
            </span>
          ) : (
            <>
              <span>Next: </span>
              <span className="font-medium text-foreground">{next!.label}</span>
              <span>
                {" "}
                · {doneCount}/{steps.length} stages
              </span>
            </>
          )}
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Open workspace
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
