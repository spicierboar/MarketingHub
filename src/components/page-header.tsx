import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageExplainer } from "@/components/page-explainer";

function explainerKey(title: string, explainerId?: string) {
  if (explainerId) return explainerId;
  return `page:${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function PageHeader({
  title,
  description,
  explainer,
  explainerId,
  hideExplainer,
  parent,
  children,
}: {
  title: string;
  /** Short permanent subtitle (shown when different from the tip). */
  description?: string;
  /** Temporary “what this page does” tip. Defaults to `description` when set. */
  explainer?: string;
  /** Stable dismiss key. Defaults from the title. */
  explainerId?: string;
  /** Skip the tip box (detail pages, etc.). */
  hideExplainer?: boolean;
  /** One level up — list / hub — so deep screens don’t force sidebar re-entry. */
  parent?: { href: string; label: string };
  children?: React.ReactNode;
}) {
  // When the tip is hidden, `description` is the permanent subtitle — don't
  // treat it as a tip source (otherwise subtitle never renders).
  const tip = hideExplainer ? explainer : (explainer ?? description);
  const showTip = Boolean(tip) && !hideExplainer;
  const showDescription = Boolean(description) && description !== tip;

  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          {parent && (
            <Link
              href={parent.href}
              className="mb-1 inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {parent.label}
            </Link>
          )}
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {showDescription && (
            <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{description}</p>
          )}
        </div>
        {children && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
        )}
      </div>
      {showTip && tip && (
        <PageExplainer id={explainerKey(title, explainerId)}>{tip}</PageExplainer>
      )}
    </div>
  );
}
