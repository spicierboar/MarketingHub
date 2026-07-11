"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "cc-page-explainer:";

function storageKey(id: string) {
  return `${STORAGE_PREFIX}${id}`;
}

/**
 * First-visit tip for a page. Dismissed per browser (localStorage) so it
 * stays out of the way once someone knows what the page is for.
 */
export function PageExplainer({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      if (window.localStorage.getItem(storageKey(id)) === "1") return;
      setVisible(true);
    } catch {
      setVisible(true);
    }
  }, [id]);

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey(id), "1");
    } catch {
      /* private mode — still hide for this session */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 border-b border-sky-200/80 bg-sky-50 px-4 py-2.5 text-sm text-sky-950 sm:px-5",
        className,
      )}
    >
      <p className="min-w-0 flex-1 leading-snug">{children}</p>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-md p-1 text-sky-800/70 hover:bg-sky-100 hover:text-sky-950"
        aria-label="Dismiss page tip"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
