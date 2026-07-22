"use client";

/**
 * Pre-submit "read it back" panel — sits inside the order form, above the
 * submit buttons. Client must tick the acknowledgement checkbox (which is
 * what actually serialises `briefConfirmed=1` into the FormData) before the
 * native form will submit; the server action re-checks it independently.
 */

import { useEffect, useRef, useState } from "react";
import {
  briefValue,
  parseOrderBriefFromFormData,
  resolveOrderBriefSchema,
  type BriefOption,
  type OrderBriefParsed,
  type OrderBriefSchema,
} from "@/lib/client-order-brief";
import type { ClientMenuCategoryId } from "@/lib/client-order-catalogue-data";

type SummaryRow = { label: string; value: string };

function labelOf(options: BriefOption[] | undefined, value: string): string {
  if (!value) return "";
  return options?.find((o) => o.value === value)?.label ?? value;
}

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trimEnd()}…`;
}

/** Fields already given their own row above, or intentionally left out of the summary. */
const SUMMARISED_ELSEWHERE = new Set([
  "contentTopic",
  "audience",
  "audienceNotes",
  "tone",
  "cta",
  "factTypes",
  "mustIncludeFacts",
  "avoid",
  "timing",
  "otherNotes",
]);

/** Curated read-back — not every field, just what a client can sanity-check at a glance. */
function buildBriefSummary(
  brief: OrderBriefParsed,
  schema: OrderBriefSchema,
): SummaryRow[] {
  const rows: SummaryRow[] = [];
  const fieldConfig = (id: string) => schema.fields.find((f) => f.id === id);

  if (brief.contentTopic) {
    rows.push({
      label: fieldConfig("contentTopic")?.label ?? "Topic",
      value: truncate(brief.contentTopic, 140),
    });
  }
  if (brief.audience) {
    rows.push({
      label: "Audience",
      value: labelOf(fieldConfig("audience")?.options, brief.audience),
    });
  }
  if (brief.audienceNotes) {
    rows.push({ label: "Audience notes", value: truncate(brief.audienceNotes, 100) });
  }
  if (brief.tone) {
    rows.push({ label: "Tone", value: labelOf(fieldConfig("tone")?.options, brief.tone) });
  }
  const ctaConfig = fieldConfig("cta");
  if (brief.cta) {
    rows.push({
      label: ctaConfig?.label ?? "Call to action",
      value: labelOf(ctaConfig?.options, brief.cta),
    });
  }
  if (brief.factTypes.length) {
    rows.push({
      label: "Must-include fact types",
      value: brief.factTypes
        .map((v) => labelOf(fieldConfig("factTypes")?.options, v))
        .join(", "),
    });
  }
  if (brief.mustIncludeFacts) {
    rows.push({ label: "Must-include facts", value: truncate(brief.mustIncludeFacts, 160) });
  }
  if (brief.timing) {
    rows.push({ label: "Timing", value: labelOf(fieldConfig("timing")?.options, brief.timing) });
  }

  for (const f of schema.fields) {
    if (SUMMARISED_ELSEWHERE.has(f.id)) continue;
    const raw = briefValue(brief, f.id);
    const value = Array.isArray(raw)
      ? raw.map((v) => labelOf(f.options, v)).join(", ")
      : labelOf(f.options, raw);
    if (!value) continue;
    rows.push({ label: f.label, value: truncate(value, 140) });
  }

  return rows;
}

export function ClientOrderBriefConfirm({
  skuId,
  categoryId,
  dishTitle,
}: {
  skuId: string;
  categoryId: ClientMenuCategoryId;
  dishTitle: string;
}) {
  const schema = resolveOrderBriefSchema({ id: skuId, title: dishTitle, categoryId });
  const containerRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const form = containerRef.current?.closest("form");
    if (!form) return;

    const refresh = () => {
      const brief = parseOrderBriefFromFormData(new FormData(form));
      setRows(buildBriefSummary(brief, schema));
    };

    refresh();
    // "input" covers text/textarea-as-you-type; "change" covers checkboxes,
    // radios, and selects. Both are needed — neither fires for the other.
    form.addEventListener("input", refresh);
    form.addEventListener("change", refresh);
    return () => {
      form.removeEventListener("input", refresh);
      form.removeEventListener("change", refresh);
    };
    // schema is re-derived each render from stable props (skuId/categoryId/dishTitle);
    // it's cheap and deterministic, so it's deliberately not a dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="space-y-3 rounded-md border border-border bg-muted/30 p-4"
    >
      <div>
        <p className="text-sm font-medium text-foreground">
          Before you submit — check this is right
        </p>
        <p className="text-xs text-muted-foreground">
          We draft strictly from what’s below. Anything missing or wrong here will be
          missing or wrong in the draft.
        </p>
      </div>

      {rows.length ? (
        <dl className="space-y-1.5 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
              <dt className="shrink-0 font-medium text-foreground sm:w-40">{row.label}</dt>
              <dd className="text-muted-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted-foreground">
          Fill in the brief above to see a summary here.
        </p>
      )}

      <label className="flex items-start gap-2 border-t border-border pt-3 text-sm">
        <input
          type="checkbox"
          name="briefConfirmed"
          value="1"
          required
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <span>I’ve checked this brief is correct and ready to send to the agency.</span>
      </label>
    </div>
  );
}
