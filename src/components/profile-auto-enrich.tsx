"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrichSalesProfileFromWebsiteAction } from "@/app/(app)/sales/actions";

/** Runs deferred website scrape once on Profile after a fast Website→Profile handoff. */
export function ProfileAutoEnrich({
  companyId,
  enabled,
}: {
  companyId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const started = useRef(false);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(
    enabled ? "running" : "idle",
  );
  const [message, setMessage] = useState<string | null>(
    enabled ? "Pulling extra detail from the website…" : null,
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    let cancelled = false;
    (async () => {
      const result = await enrichSalesProfileFromWebsiteAction(companyId);
      if (cancelled) return;
      if (!result.ok) {
        setStatus("error");
        setMessage(result.error ?? "Website enrich skipped — you can continue.");
        return;
      }
      setStatus("done");
      setMessage(
        result.scraped
          ? "Website details added — review the fields below."
          : "Website enrich finished — little extra found (Google listing still applied).",
      );
      startTransition(() => router.refresh());
    })().catch(() => {
      if (cancelled) return;
      setStatus("error");
      setMessage("Website enrich skipped — you can continue.");
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, enabled, router]);

  if (!enabled && status === "idle") return null;

  return (
    <p
      className={
        "rounded-md border px-3 py-2 text-sm " +
        (status === "error"
          ? "border-amber-200 bg-amber-50 text-amber-950"
          : "border-border bg-muted/40 text-muted-foreground")
      }
    >
      {message}
    </p>
  );
}
