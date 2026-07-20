"use client";

import { useCallback, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "cc-page-explainer:";
const EXPLAINER_CHANGE_EVENT = "cc-page-explainer-change";
const sessionDismissed = new Set<string>();

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
  const subscribe = useCallback((onChange: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey(id)) onChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EXPLAINER_CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EXPLAINER_CHANGE_EVENT, onChange);
    };
  }, [id]);
  const getSnapshot = useCallback(() => {
    if (sessionDismissed.has(id)) return false;
    try {
      return window.localStorage.getItem(storageKey(id)) !== "1";
    } catch {
      return true;
    }
  }, [id]);
  const visible = useSyncExternalStore(subscribe, getSnapshot, () => false);

  function dismiss() {
    sessionDismissed.add(id);
    try {
      window.localStorage.setItem(storageKey(id), "1");
    } catch {
      /* private mode — still hide for this session */
    }
    window.dispatchEvent(new Event(EXPLAINER_CHANGE_EVENT));
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
