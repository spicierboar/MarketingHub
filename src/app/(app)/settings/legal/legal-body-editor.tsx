"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/form";
import type { LegalDocKind } from "@/lib/types";
import { formatLegalDocAction } from "./actions";

export function LegalBodyEditor({
  kind,
  label,
}: {
  kind: LegalDocKind;
  label: string;
}) {
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offerFormat, setOfferFormat] = useState(false);
  const [pending, startTransition] = useTransition();
  const lastFormatted = useRef("");

  function runFormat() {
    const current = body.trim();
    if (!current) {
      setError("Paste some text first.");
      setOfferFormat(false);
      return;
    }
    setError(null);
    setStatus(null);
    startTransition(async () => {
      try {
        const result = await formatLegalDocAction(kind, current);
        setBody(result.text);
        lastFormatted.current = result.text;
        setOfferFormat(false);
        setStatus(
          result.model.startsWith("claude")
            ? "Formatted with AI — review before publishing."
            : "Formatted locally (no AI key) — review before publishing.",
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Format failed.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Field
        label={`Full ${label.toLowerCase()} text`}
        htmlFor={`${kind}-body`}
        hint="Paste the full document, then use Format with AI before publishing."
      >
        <Textarea
          id={`${kind}-body`}
          name="body"
          required
          rows={10}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setStatus(null);
            setError(null);
          }}
          onPaste={() => {
            // Offer after paste settles into controlled state (next tick).
            queueMicrotask(() => setOfferFormat(true));
          }}
          className="min-h-40 font-mono text-[13px] leading-relaxed"
          placeholder={`Paste the full ${label.toLowerCase()} text…`}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !body.trim()}
          onClick={runFormat}
        >
          {pending ? "Formatting…" : "Format with AI"}
        </Button>
        {offerFormat && !pending && body.trim() !== lastFormatted.current && (
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={runFormat}
          >
            Paste detected — format now?
          </button>
        )}
        {status && <span className="text-xs text-muted-foreground">{status}</span>}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
