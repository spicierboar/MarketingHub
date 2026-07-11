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
  children?: React.ReactNode;
}) {
  const tip = explainer ?? description;
  const showTip = Boolean(tip) && !hideExplainer;
  const showDescription = Boolean(description) && description !== tip;

  return (
    <div>
      <div className="flex flex-col gap-2 border-b border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
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
