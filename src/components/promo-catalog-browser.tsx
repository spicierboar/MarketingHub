"use client";

import { useState, useTransition } from "react";
import {
  industryLabel,
  durationLabel,
  type PromoTemplate,
} from "@/lib/promo-catalog";
import type { PromoIndustry } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { FormModal } from "@/components/form-modal";
import { PromoTemplateFormFields } from "@/components/promo-template-form";
import {
  createAgencyPromoAction,
  deleteAgencyPromoAction,
  resetPlatformPromoAction,
  saveAgencyPromoAction,
  toggleAgencyPromoAction,
} from "@/app/(app)/promo-catalog/actions";

export type PromoCatalogRow = {
  id: string;
  template: PromoTemplate;
  kind: "platform" | "custom";
  hasOverride: boolean;
  hidden: boolean;
};

export type PromoCatalogGroup = {
  industry: PromoIndustry;
  label: string;
  rows: PromoCatalogRow[];
};

function money(n: number) {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
}

function CatalogCard({
  row,
  onEdit,
}: {
  row: PromoCatalogRow;
  onEdit: (row: PromoCatalogRow) => void;
}) {
  const { template: t, kind, hasOverride, hidden } = row;
  return (
    <div className="rounded-md border border-border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{t.name}</p>
          <p className="text-xs text-muted-foreground">{t.promotion}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {durationLabel(t)} · {money(t.suggestedClientPriceUsd)} ·{" "}
            {Math.round(t.markupPercent * 100)}% markup · {t.outlines.length} posts
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {kind === "custom" ? (
              <Badge tone="primary">Custom</Badge>
            ) : (
              <Badge tone="neutral">Built-in</Badge>
            )}
            {hasOverride && kind === "platform" && !hidden && (
              <Badge tone="info">Edited</Badge>
            )}
            {hidden && <Badge tone="warning">Hidden</Badge>}
            {kind === "custom" && !hidden && <Badge tone="success">Active</Badge>}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => onEdit(row)}>
            Edit
          </Button>
          <form action={toggleAgencyPromoAction}>
            <input type="hidden" name="templateId" value={row.id} />
            <input type="hidden" name="active" value={hidden ? "true" : "false"} />
            <Button type="submit" size="sm" variant="ghost">
              {hidden ? "Show" : "Hide"}
            </Button>
          </form>
          {kind === "custom" && (
            <form action={deleteAgencyPromoAction}>
              <input type="hidden" name="templateId" value={row.id} />
              <Button type="submit" size="sm" variant="ghost">
                Delete
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function EditModal({
  row,
  onClose,
}: {
  row: PromoCatalogRow;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isPlatform = row.kind === "platform";

  function runAction(action: (fd: FormData) => Promise<void>, fd: FormData) {
    startTransition(async () => {
      await action(fd);
      onClose();
    });
  }

  return (
    <FormModal
      title={isPlatform ? "Edit built-in pack" : "Edit campaign"}
      description={
        isPlatform
          ? "Changes apply only to your workspace. Reset anytime to restore the platform default."
          : "Update this industry campaign for your clients."
      }
      onClose={onClose}
      wide
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone="neutral">{industryLabel(row.template.industry)}</Badge>
        {isPlatform && (
          <Badge tone={row.hasOverride ? "info" : "neutral"}>
            {row.hasOverride ? "Edited for your workspace" : "Platform default"}
          </Badge>
        )}
        {row.hidden && <Badge tone="warning">Hidden</Badge>}
      </div>

      <form
        key={row.id}
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("templateId", row.id);
          runAction(saveAgencyPromoAction, fd);
        }}
      >
        <PromoTemplateFormFields
          defaults={row.template}
          submitLabel={
            pending
              ? "Saving…"
              : isPlatform
                ? "Save workspace version"
                : "Save changes"
          }
        />
      </form>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        {isPlatform && row.hasOverride && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              runAction(resetPlatformPromoAction, fd);
            }}
          >
            <input type="hidden" name="templateId" value={row.id} />
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              Reset to platform default
            </Button>
          </form>
        )}
        {row.kind === "custom" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              runAction(deleteAgencyPromoAction, fd);
            }}
          >
            <input type="hidden" name="templateId" value={row.id} />
            <Button type="submit" variant="ghost" size="sm" disabled={pending}>
              Delete campaign
            </Button>
          </form>
        )}
      </div>
    </FormModal>
  );
}

function AddCampaignModal({
  defaultIndustry,
  onClose,
}: {
  defaultIndustry?: PromoIndustry;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <FormModal
      title="Add industry campaign"
      description="Include 3–5 ready-to-publish posts. Clients only adjust package price, start date, and channels."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            await createAgencyPromoAction(fd);
            onClose();
          });
        }}
      >
        <PromoTemplateFormFields
          defaults={defaultIndustry ? { industry: defaultIndustry } : null}
          submitLabel={pending ? "Adding…" : "Add to catalog"}
        />
      </form>
    </FormModal>
  );
}

export function PromoCatalogBrowser({
  groups,
  totalActive,
  totalRows,
}: {
  groups: PromoCatalogGroup[];
  totalActive: number;
  totalRows: number;
}) {
  const [industry, setIndustry] = useState<PromoIndustry | "">(
    groups[0]?.industry ?? "",
  );
  const [editing, setEditing] = useState<PromoCatalogRow | null>(null);
  const [adding, setAdding] = useState(false);

  const selected =
    groups.find((g) => g.industry === industry) ?? groups[0] ?? null;
  const rows = selected?.rows ?? [];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field
          label="Industry"
          htmlFor="catalog-industry"
          className="min-w-[220px] flex-1 sm:max-w-xs"
        >
          <Select
            id="catalog-industry"
            value={selected?.industry ?? ""}
            onChange={(e) => setIndustry(e.target.value as PromoIndustry)}
          >
            {groups.map((g) => (
              <option key={g.industry} value={g.industry}>
                {g.label} ({g.rows.length})
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex flex-wrap items-center gap-3 pb-2">
          <p className="text-xs text-muted-foreground">
            {totalActive} visible · {totalRows} total · {groups.length} industries
          </p>
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            Add campaign
          </Button>
        </div>
      </div>

      {selected ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-2">
            <h2 className="text-sm font-semibold">{selected.label}</h2>
            <p className="text-xs text-muted-foreground">
              {rows.filter((r) => !r.hidden).length}/{rows.length} visible in this industry
            </p>
          </div>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No packs for this industry yet.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {rows.map((row) => (
                <CatalogCard key={row.id} row={row} onEdit={setEditing} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">No industries in the catalog yet.</p>
      )}

      {editing && <EditModal row={editing} onClose={() => setEditing(null)} />}
      {adding && (
        <AddCampaignModal
          defaultIndustry={selected?.industry}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
