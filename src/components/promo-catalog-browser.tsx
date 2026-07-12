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
import { Field, Input, Select } from "@/components/ui/form";
import { FormModal } from "@/components/form-modal";
import { PromoTemplateFormFields } from "@/components/promo-template-form";
import {
  createAgencyPromoAction,
  createAgencyPromoIndustryAction,
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
    <div className="flex w-full flex-col gap-2 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-tight">{t.name}</p>
        <p className="truncate text-xs text-muted-foreground">{t.promotion}</p>
      </div>
      <p className="shrink-0 text-xs text-muted-foreground whitespace-nowrap sm:text-right">
        {durationLabel(t)} · {money(t.suggestedClientPriceUsd)} ·{" "}
        {Math.round(t.markupPercent * 100)}% markup · {t.outlines.length} posts
      </p>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
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
  );
}

function EditModal({
  row,
  industryOptions,
  onClose,
}: {
  row: PromoCatalogRow;
  industryOptions: { id: string; label: string }[];
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
      title={isPlatform ? "Edit built-in pack" : "Edit promo"}
      description={
        isPlatform
          ? "Changes apply only to your workspace. Reset anytime to restore the platform default."
          : "Update this promo template for your catalog. Clients request it to create a draft campaign."
      }
      onClose={onClose}
      wide
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge tone="neutral">
          {industryLabel(row.template.industry, industryOptions)}
        </Badge>
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
          industryOptions={industryOptions}
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
              Delete promo
            </Button>
          </form>
        )}
      </div>
    </FormModal>
  );
}

function AddPromoModal({
  defaultIndustry,
  industryOptions,
  onClose,
}: {
  defaultIndustry?: PromoIndustry;
  industryOptions: { id: string; label: string }[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <FormModal
      title="Add promo"
      description="Creates a promo template (pack) for the catalog — not a live Delivery campaign. Include 3–5 ready-to-publish posts; clients later request it to start a draft campaign."
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
          industryOptions={industryOptions}
          submitLabel={pending ? "Adding…" : "Add to catalog"}
        />
      </form>
    </FormModal>
  );
}

function AddIndustryModal({ onClose }: { onClose: () => void }) {
  const [pending, startTransition] = useTransition();

  return (
    <FormModal
      title="Add industry"
      description="Adds a custom industry tag for grouping promo templates in this workspace. Platform industries stay unchanged."
      onClose={onClose}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            await createAgencyPromoIndustryAction(fd);
            onClose();
          });
        }}
      >
        <Field label="Display name" htmlFor="industry-label">
          <Input
            id="industry-label"
            name="label"
            required
            minLength={2}
            maxLength={80}
            placeholder="e.g. Pet care"
          />
        </Field>
        <Field
          label="Id (optional)"
          htmlFor="industry-id"
          hint="Lowercase slug. Leave blank to generate from the name."
        >
          <Input
            id="industry-id"
            name="id"
            maxLength={40}
            placeholder="e.g. pet_care"
            pattern="[a-z][a-z0-9_]*"
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add industry"}
        </Button>
      </form>
    </FormModal>
  );
}

export function PromoCatalogBrowser({
  groups,
  industryOptions,
  totalActive,
  totalRows,
}: {
  groups: PromoCatalogGroup[];
  industryOptions: { id: string; label: string }[];
  totalActive: number;
  totalRows: number;
}) {
  const [industry, setIndustry] = useState<PromoIndustry | "">(
    groups[0]?.industry ?? "",
  );
  const [editing, setEditing] = useState<PromoCatalogRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingIndustry, setAddingIndustry] = useState(false);

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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setAddingIndustry(true)}
          >
            Add industry
          </Button>
          <Button type="button" size="sm" onClick={() => setAdding(true)}>
            Add promo
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
            <div className="divide-y divide-border border-y border-border">
              {rows.map((row) => (
                <CatalogCard key={row.id} row={row} onEdit={setEditing} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm text-muted-foreground">No industries in the catalog yet.</p>
      )}

      {editing && (
        <EditModal
          row={editing}
          industryOptions={industryOptions}
          onClose={() => setEditing(null)}
        />
      )}
      {adding && (
        <AddPromoModal
          defaultIndustry={selected?.industry}
          industryOptions={industryOptions}
          onClose={() => setAdding(false)}
        />
      )}
      {addingIndustry && (
        <AddIndustryModal onClose={() => setAddingIndustry(false)} />
      )}
    </>
  );
}
