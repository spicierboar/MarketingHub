"use client";

import { useId, useState } from "react";
import { HelpCircle } from "lucide-react";
import { getOrderDetailsHelp } from "@/lib/client-order-details-examples";
import type { ClientMenuCategoryId } from "@/lib/client-order-catalogue-data";
import { cn } from "@/lib/utils";

/** Section heading + ? examples for the structured Extras brief. */
export function ClientOrderDetailsHelp({
  categoryId,
  dishTitle,
}: {
  categoryId: ClientMenuCategoryId;
  dishTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const help = getOrderDetailsHelp(categoryId, dishTitle);

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold text-foreground">Brief</h2>
        <button
          type="button"
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            open && "bg-muted text-foreground",
          )}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={
            open ? "Hide brief examples" : "Show examples of a useful brief"
          }
          onClick={() => setOpen((v) => !v)}
        >
          <HelpCircle className="size-4" aria-hidden />
        </button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Fields change with this Extra (e.g. course outline asks for topic and
        outcomes). Tap ? for examples.
      </p>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Examples of a useful order brief"
          className="mt-3 rounded-lg border border-border bg-card p-3 shadow-sm"
        >
          <p className="text-xs font-semibold text-foreground">
            What good answers look like
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {help.include.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs font-semibold text-foreground">
            Example{help.examples.length > 1 ? "s" : ""}
          </p>
          <div className="mt-1.5 space-y-2">
            {help.examples.map((example) => (
              <p
                key={example.slice(0, 64)}
                className="rounded-md bg-muted/60 px-2.5 py-2 text-xs leading-relaxed text-foreground"
              >
                {example}
              </p>
            ))}
          </div>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-primary hover:underline"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
