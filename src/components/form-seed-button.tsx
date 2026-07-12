"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";

export type SeedFieldValue = string | boolean;

/**
 * Seeds empty named form controls from a fixed map.
 * Empty-only unless force=true. Matches ProfileSuggestButton chrome.
 */
export function FormSeedButton({
  formId,
  values,
  hint,
  emptyLabel = "Seed empty fields",
  forceLabel = "Re-seed all",
  onAfterFill,
}: {
  formId: string;
  values: Record<string, SeedFieldValue>;
  hint: React.ReactNode;
  emptyLabel?: string;
  forceLabel?: string;
  /** Sync controlled inputs after DOM write (e.g. React state). */
  onAfterFill?: (force: boolean) => void;
}) {
  const fill = useCallback(
    (force: boolean) => {
      const form = document.getElementById(formId) as HTMLFormElement | null;
      if (!form) return;

      for (const [name, value] of Object.entries(values)) {
        const el = form.elements.namedItem(name);
        if (!el) continue;

        if (el instanceof RadioNodeList) {
          continue;
        }

        if (el instanceof HTMLInputElement) {
          if (el.type === "checkbox") {
            if (!force && el.checked) continue;
            el.checked = Boolean(value);
            el.dispatchEvent(new Event("change", { bubbles: true }));
            continue;
          }
          if (!force && el.value.trim()) continue;
          el.value = String(value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          continue;
        }

        if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          if (!force && String(el.value).trim()) continue;
          el.value = String(value);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      onAfterFill?.(force);
    },
    [formId, values, onAfterFill],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
      <p className="flex-1 text-xs text-muted-foreground">{hint}</p>
      <Button type="button" size="sm" variant="secondary" onClick={() => fill(false)}>
        {emptyLabel}
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => fill(true)}>
        {forceLabel}
      </Button>
    </div>
  );
}
