"use client";

import { useState, useTransition } from "react";
import type {
  AutoOnboardingFieldPreview,
  AutoOnboardingScrapeResult,
} from "@/lib/auto-onboarding";
import { SOCIAL_PLATFORMS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import {
  applyAutoOnboardingAction,
  previewAutoOnboardingAction,
} from "@/app/(app)/companies/auto-onboarding-actions";
import {
  applyEnrichmentProfileAction,
  previewAbnAction,
  previewPlaceMatchAction,
} from "@/app/(app)/companies/enrichment-actions";

type Confidence = AutoOnboardingFieldPreview["confidence"];

type ReviewableField = AutoOnboardingFieldPreview & {
  source?: "scrape" | "enrichment";
};

function selectionId(field: ReviewableField): string {
  return `${field.source ?? "scrape"}:${field.key}`;
}

const CONFIDENCE_TONE: Record<Confidence, "success" | "warning" | "neutral"> = {
  high: "success",
  medium: "warning",
  low: "neutral",
};

const CONFIDENCE_GROUP_STYLE: Record<Confidence, string> = {
  high: "border-emerald-200/80 bg-emerald-50/40",
  medium: "border-amber-200/80 bg-amber-50/40",
  low: "border-border bg-muted/30",
};

const CONFIDENCE_ORDER: Confidence[] = ["high", "medium", "low"];

const CONFIDENCE_GROUP_LABEL: Record<Confidence, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence — verify before applying",
};

function defaultSelectedKeys(fields: ReviewableField[]): Set<string> {
  return new Set(
    fields
      .filter((f) => f.confidence === "high" || f.confidence === "medium")
      .map((f) => selectionId(f)),
  );
}

function fieldByKey(
  fields: ReviewableField[],
  key: AutoOnboardingFieldPreview["key"],
): string | undefined {
  return fields.find((f) => f.key === key)?.value?.trim();
}

function findFieldByLabel(fields: ReviewableField[], pattern: RegExp): string | undefined {
  return fields.find((f) => pattern.test(f.label))?.value?.trim();
}

function socialCountFromPreview(
  preview: AutoOnboardingScrapeResult,
  fields: ReviewableField[],
): number {
  const socialField = fields.find((f) => f.key === "socialLinks");
  if (socialField?.value) {
    return socialField.value.split("\n").filter((l) => l.trim()).length;
  }
  return preview.urls.socialLinks.length;
}

function logoUrlFromFields(fields: ReviewableField[]): string | undefined {
  const direct =
    fieldByKey(fields, "logoUrl" as AutoOnboardingFieldPreview["key"]) ??
    fieldByKey(fields, "logo" as AutoOnboardingFieldPreview["key"]);
  if (direct && /^https?:\/\//i.test(direct)) return direct;

  const labelled = findFieldByLabel(fields, /logo/i);
  if (labelled && /^https?:\/\//i.test(labelled)) return labelled;
  return undefined;
}

function buildPreviewSummary(
  preview: AutoOnboardingScrapeResult,
  companyName: string,
  fields: ReviewableField[],
) {
  const name =
    fieldByKey(fields, "tradingNames") ??
    fieldByKey(fields, "legalName") ??
    companyName;
  const industry = fieldByKey(fields, "industry");
  const location = fieldByKey(fields, "serviceAreas");
  const phone =
    fieldByKey(fields, "phone" as AutoOnboardingFieldPreview["key"]) ??
    findFieldByLabel(fields, /phone/i);
  const email =
    fieldByKey(fields, "email" as AutoOnboardingFieldPreview["key"]) ??
    findFieldByLabel(fields, /email|e-mail/i);
  const logoUrl = logoUrlFromFields(fields);

  return {
    name,
    industry,
    location,
    phone,
    email,
    socialCount: socialCountFromPreview(preview, fields),
    logoUrl,
  };
}

function groupFieldsByConfidence(
  fields: ReviewableField[],
): Record<Confidence, ReviewableField[]> {
  const groups: Record<Confidence, ReviewableField[]> = {
    high: [],
    medium: [],
    low: [],
  };
  for (const field of fields) {
    groups[field.confidence].push(field);
  }
  return groups;
}

function FieldReviewRow({
  field,
  checked,
  disabled,
  onToggle,
}: {
  field: ReviewableField;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <li className="rounded-md border border-border/80 bg-card p-3 text-sm">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1"
          disabled={disabled}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{field.label}</span>
            <Badge tone={CONFIDENCE_TONE[field.confidence]}>{field.confidence}</Badge>
            {field.source === "enrichment" && <Badge tone="info">Enrichment</Badge>}
            {field.alreadySet && <Badge tone="warning">Already set</Badge>}
          </span>
          <span className="mt-1 block whitespace-pre-wrap text-muted-foreground">
            {field.value}
          </span>
          {field.sourceUrl && (
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              Source: {field.sourceUrl}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}

function PreviewSummaryCard({
  summary,
}: {
  summary: ReturnType<typeof buildPreviewSummary>;
}) {
  const rows: { label: string; value: string }[] = [
    { label: "Name", value: summary.name },
    summary.industry ? { label: "Industry", value: summary.industry } : null,
    summary.location ? { label: "Service area", value: summary.location } : null,
    summary.phone ? { label: "Phone", value: summary.phone } : null,
    summary.email ? { label: "Email", value: summary.email } : null,
    {
      label: "Social profiles",
      value:
        summary.socialCount > 0
          ? `${summary.socialCount} link${summary.socialCount === 1 ? "" : "s"}`
          : "None detected",
    },
  ].filter((r): r is { label: string; value: string } => r !== null);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4">
      <div className="flex flex-wrap items-start gap-4">
        {summary.logoUrl ? (
          <img
            src={summary.logoUrl}
            alt=""
            className="h-14 w-14 shrink-0 rounded-md border border-border bg-card object-contain"
          />
        ) : null}
        <dl className="grid min-w-0 flex-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className="mt-0.5 break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function EnrichmentSection({
  companyId,
  disabled,
  pending,
  onPreviewed,
}: {
  companyId: string;
  disabled: boolean;
  pending: boolean;
  onPreviewed: (fields: ReviewableField[], patch: Record<string, unknown>) => void;
}) {
  const [abnOrName, setAbnOrName] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  function runEnrichment() {
    setLocalError(null);
    void (async () => {
      const fields: ReviewableField[] = [];
      const patch: Record<string, unknown> = {};

      if (abnOrName.trim()) {
        const fd = new FormData();
        fd.set("companyId", companyId);
        fd.set("abnOrName", abnOrName.trim());
        const abn = await previewAbnAction(fd);
        if (!abn.ok) {
          setLocalError(abn.error);
          return;
        }
        patch.abn = abn.profilePatch.abn;
        if (abn.profilePatch.legalName) {
          patch.legalName = abn.profilePatch.legalName;
          fields.push({
            key: "legalName",
            label: "Legal name (ABN)",
            value: abn.profilePatch.legalName,
            confidence: "high",
            alreadySet: false,
            source: "enrichment",
          });
        }
        // Display-only row; abn is applied via enrichmentPatch, not scrape keys.
        fields.push({
          key: "tradingNames",
          label: `ABN ${abn.result.abn}`,
          value: [
            abn.result.entityType,
            abn.result.gstRegistered != null
              ? abn.result.gstRegistered
                ? "GST registered"
                : "Not GST registered"
              : null,
            abn.result.status,
          ]
            .filter(Boolean)
            .join(" · ") || abn.result.abn,
          confidence: "high",
          alreadySet: false,
          source: "enrichment",
        });
      }

      if (placeQuery.trim()) {
        const parts = placeQuery.trim().split(/[,\s]+/).filter(Boolean);
        const name = parts.slice(0, Math.max(1, parts.length - 1)).join(" ") || placeQuery.trim();
        const suburb = parts.length > 1 ? parts[parts.length - 1] : undefined;
        const fd = new FormData();
        fd.set("companyId", companyId);
        fd.set("name", name);
        if (suburb) fd.set("suburb", suburb);
        const place = await previewPlaceMatchAction(fd);
        if (!place.ok) {
          setLocalError(place.error);
          return;
        }
        const hints = place.hints;
        if (hints.googlePlaceId) patch.googlePlaceId = hints.googlePlaceId;
        if (hints.tradingHours) patch.tradingHours = hints.tradingHours;
        if (hints.tradingNames) {
          patch.tradingNames = hints.tradingNames;
          fields.push({
            key: "tradingNames",
            label: "Trading name (Places)",
            value: hints.tradingNames,
            confidence: "high",
            alreadySet: false,
            source: "enrichment",
          });
        }
        if (hints.serviceAreas?.length) {
          patch.serviceAreas = hints.serviceAreas;
          fields.push({
            key: "serviceAreas",
            label: "Service area (Places)",
            value: hints.serviceAreas.join(", "),
            confidence: "high",
            alreadySet: false,
            source: "enrichment",
          });
        }
        if (hints.industry) {
          patch.industry = hints.industry;
          fields.push({
            key: "industry",
            label: "Industry (Places)",
            value: hints.industry,
            confidence: "medium",
            alreadySet: false,
            source: "enrichment",
          });
        }
        if (hints.website) {
          patch.website = hints.website;
          fields.push({
            key: "website",
            label: "Website (Places)",
            value: hints.website,
            confidence: "medium",
            alreadySet: false,
            source: "enrichment",
          });
        }
        if (hints.tradingHours) {
          fields.push({
            key: "currentOffers",
            label: "Trading hours (Places)",
            value: hints.tradingHours,
            confidence: "medium",
            alreadySet: false,
            source: "enrichment",
          });
        }
      }

      if (fields.length === 0) {
        setLocalError("Enter an ABN/name and/or Places query first.");
        return;
      }
      onPreviewed(fields, patch);
    })();
  }

  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-4">
      <div>
        <h3 className="text-sm font-medium">Optional enrichment (AU)</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          ABN registry and Google Places (simulated when API keys are unset). Results join
          the review list below — nothing is saved until you apply. ABN alone is not unique —
          another trading name under the same ABN is a separate account; same business name +
          ABN is blocked as a duplicate.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ABN or legal name" htmlFor="enrich_abn">
          <Input
            id="enrich_abn"
            value={abnOrName}
            onChange={(e) => setAbnOrName(e.target.value)}
            inputMode="text"
            placeholder="51 824 753 556 or Harbour Roasters"
            disabled={disabled || pending}
          />
        </Field>
        <Field label="Places search" htmlFor="enrich_places">
          <Input
            id="enrich_places"
            value={placeQuery}
            onChange={(e) => setPlaceQuery(e.target.value)}
            placeholder="Business name, suburb"
            disabled={disabled || pending}
          />
        </Field>
      </div>
      {localError ? (
        <p className="text-xs text-red-700">{localError}</p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || pending}
        onClick={runEnrichment}
      >
        Preview enrichment
      </Button>
    </div>
  );
}

export function AutoOnboardingPanel({
  companyId,
  companyName,
  defaultWebsite,
  defaultSocial,
  lastScrape,
  compact = false,
  socialsEditHref,
}: {
  companyId: string;
  companyName: string;
  defaultWebsite?: string;
  defaultSocial: Record<string, string>;
  lastScrape?: {
    at?: string;
    mode?: "live" | "simulated";
    appliedAt?: string;
  };
  /** Setup mode: website + consent only; extras behind a disclosure. */
  compact?: boolean;
  /** Where staff edit social URLs (profile / Brand Brain) — scrape does not duplicate fields. */
  socialsEditHref?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<AutoOnboardingScrapeResult | null>(null);
  const [enrichmentFields, setEnrichmentFields] = useState<ReviewableField[]>([]);
  const [enrichmentPatch, setEnrichmentPatch] = useState<Record<string, unknown>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);
  const [collapsed, setCollapsed] = useState(!!lastScrape?.appliedAt);

  const reviewFields: ReviewableField[] = preview
    ? [
        ...preview.fields.map((f) => ({ ...f, source: "scrape" as const })),
        ...enrichmentFields,
      ]
    : [];

  function toggleField(field: ReviewableField) {
    const id = selectionId(field);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFields() {
    setSelected(new Set(reviewFields.map((f) => selectionId(f))));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function handlePreview(formData: FormData) {
    setError(null);
    setSuccess(null);
    setEnrichmentFields([]);
    setEnrichmentPatch({});
    startTransition(async () => {
      const result = await previewAutoOnboardingAction(formData);
      if (!result.ok) {
        setPreview(null);
        setError(result.error);
        return;
      }
      const fields = result.preview.fields.map((f) => ({
        ...f,
        source: "scrape" as const,
      }));
      setPreview(result.preview);
      setSelected(defaultSelectedKeys(fields));
    });
  }

  function handleEnrichmentPreviewed(
    fields: ReviewableField[],
    patch: Record<string, unknown>,
  ) {
    setError(null);
    setEnrichmentFields(fields);
    setEnrichmentPatch(patch);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of defaultSelectedKeys(fields)) next.add(id);
      return next;
    });
    setSuccess(`Enrichment preview ready (${fields.length} field(s)).`);
  }

  function handleApply(formData: FormData) {
    setError(null);
    setSuccess(null);
    if (!preview) {
      setError("Run a preview scrape before applying.");
      return;
    }
    const scrapeKeys = [...selected]
      .filter((id) => id.startsWith("scrape:"))
      .map((id) => id.slice("scrape:".length));
    formData.set("previewJson", JSON.stringify(preview));
    formData.set("selectedFields", JSON.stringify(scrapeKeys));
    if (overwrite) formData.set("overwrite", "on");

    startTransition(async () => {
      const result = await applyAutoOnboardingAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const enrichmentSelected = enrichmentFields.some((f) =>
        selected.has(selectionId(f)),
      );
      if (enrichmentSelected && Object.keys(enrichmentPatch).length > 0) {
        const efd = new FormData();
        efd.set("companyId", companyId);
        efd.set("enrichmentPatchJson", JSON.stringify(enrichmentPatch));
        const er = await applyEnrichmentProfileAction(efd);
        if (!er.ok) {
          setError(er.error);
          return;
        }
      }

      setSuccess("Profile fields applied — review and save any manual edits below.");
      setPreview(null);
      setEnrichmentFields([]);
      setEnrichmentPatch({});
      setSelected(new Set());
      setCollapsed(true);
    });
  }

  const grouped = preview ? groupFieldsByConfidence(reviewFields) : null;
  const summary = preview ? buildPreviewSummary(preview, companyName, reviewFields) : null;

  if (compact && collapsed && !preview) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <p className="text-muted-foreground">
          Profile filled from website
          {lastScrape?.at ? ` · ${new Date(lastScrape.at).toLocaleDateString()}` : ""}
          {lastScrape?.mode ? ` · ${lastScrape.mode}` : ""}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(false)}
        >
          Update from website
        </Button>
      </div>
    );
  }

  const savedSocialEntries = SOCIAL_PLATFORMS.map((s) => ({
    key: s.key,
    label: s.label,
    url: (defaultSocial[s.key] ?? "").trim(),
  })).filter((s) => s.url.length > 0);
  const savedSocialCount = savedSocialEntries.length;

  // Scrape imports profile socials as hidden fields — never a second URL stack.
  const profileSocialHiddens = savedSocialEntries.map((s) => (
    <input key={s.key} type="hidden" name={`social_${s.key}`} value={s.url} />
  ));

  const socialsImportNote = (
    <p className="text-sm text-muted-foreground">
      {savedSocialCount > 0 ? (
        <>
          Also crawling {savedSocialCount} saved social URL
          {savedSocialCount === 1 ? "" : "s"} from the profile
          {savedSocialEntries.length <= 4
            ? ` (${savedSocialEntries.map((s) => s.label).join(", ")})`
            : ""}
          .
        </>
      ) : (
        <>No social URLs on the profile yet — website scrape only.</>
      )}{" "}
      {socialsEditHref ? (
        <a href={socialsEditHref} className="text-primary hover:underline">
          Edit socials
        </a>
      ) : (
        <span>Edit socials in the profile below.</span>
      )}
    </p>
  );

  const extras = (
    <EnrichmentSection
      companyId={companyId}
      disabled={pending}
      pending={pending}
      onPreviewed={handleEnrichmentPreviewed}
    />
  );

  const reviewBlock =
    preview && grouped && summary ? (
      <div className="space-y-4 border-t border-border pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium">Review before applying</h3>
          <Badge tone={preview.mode === "live" ? "primary" : "neutral"}>
            {preview.mode === "live" ? "Live" : "Simulated"}
          </Badge>
        </div>

        {!compact && <PreviewSummaryCard summary={summary} />}

        <div className="space-y-3">
          {CONFIDENCE_ORDER.map((confidence) => {
            const fields = grouped[confidence];
            if (fields.length === 0) return null;
            if (compact && confidence === "low") {
              return (
                <details key={confidence} className="rounded-md border border-border p-3">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                    Low confidence ({fields.length}) — optional
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {fields.map((field) => (
                      <FieldReviewRow
                        key={`${field.source ?? "scrape"}-${field.key}-${field.label}`}
                        field={field}
                        checked={selected.has(selectionId(field))}
                        disabled={pending}
                        onToggle={() => toggleField(field)}
                      />
                    ))}
                  </ul>
                </details>
              );
            }
            return (
              <section
                key={confidence}
                className={
                  compact
                    ? "space-y-2"
                    : `space-y-2 rounded-lg border p-3 ${CONFIDENCE_GROUP_STYLE[confidence]}`
                }
              >
                {!compact && (
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-medium">{CONFIDENCE_GROUP_LABEL[confidence]}</h4>
                    <Badge tone={CONFIDENCE_TONE[confidence]}>{fields.length}</Badge>
                  </div>
                )}
                <ul className="space-y-2">
                  {fields.map((field) => (
                    <FieldReviewRow
                      key={`${field.source ?? "scrape"}-${field.key}-${field.label}`}
                      field={field}
                      checked={selected.has(selectionId(field))}
                      disabled={pending}
                      onToggle={() => toggleField(field)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
            disabled={pending}
          />
          Overwrite fields that already have values
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <form action={handleApply} className="inline">
            <input type="hidden" name="companyId" value={companyId} />
            <input type="hidden" name="consent" value="true" />
            <input type="hidden" name="website" value={preview.urls.website ?? ""} />
            {preview.urls.socialLinks.map((l) => (
              <input
                key={l.platform}
                type="hidden"
                name={`social_${l.platform}`}
                value={l.url}
              />
            ))}
            <Button type="submit" disabled={pending || selected.size === 0}>
              {pending
                ? "Applying…"
                : compact
                  ? `Apply selected (${selected.size})`
                  : `Looks correct — apply selected (${selected.size})`}
            </Button>
          </form>
          {!compact && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending || reviewFields.length === 0}
                onClick={selectAllFields}
              >
                Apply all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending || selected.size === 0}
                onClick={clearSelection}
              >
                Clear selection
              </Button>
            </>
          )}
        </div>
      </div>
    ) : null;

  return (
    <Card className={compact ? "border-border" : "border-primary/20"}>
      <CardContent className={compact ? "space-y-4 p-5" : "space-y-5 p-6"}>
        <div>
          <h2 className="font-semibold">
            {compact ? "Fill from website" : "Auto-onboarding scrape"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {compact
              ? "Scrape the website (and any socials already saved on the profile). Nothing publishes automatically."
              : `With explicit client consent, scrape ${companyName}'s public website and saved social profile URLs to pre-fill Brand Brain fields.`}
          </p>
          {!compact && lastScrape?.at && (
            <p className="mt-2 text-xs text-muted-foreground">
              Last scrape: {new Date(lastScrape.at).toLocaleString()}
              {lastScrape.mode ? ` (${lastScrape.mode})` : ""}
              {lastScrape.appliedAt
                ? ` · applied ${new Date(lastScrape.appliedAt).toLocaleString()}`
                : ""}
            </p>
          )}
        </div>

        <form action={handlePreview} className="space-y-4">
          <input type="hidden" name="companyId" value={companyId} />
          {profileSocialHiddens}

          <div className={compact ? "flex flex-col gap-3 sm:flex-row sm:items-end" : "space-y-4"}>
            <div className="min-w-0 flex-1">
              <Field label="Website" htmlFor="auto_website">
                <Input
                  id="auto_website"
                  name="website"
                  type="text"
                  inputMode="url"
                  placeholder="https://example.com"
                  defaultValue={defaultWebsite}
                  disabled={pending}
                />
              </Field>
            </div>
            {!compact && (
              <label className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm">
                <input
                  type="checkbox"
                  name="consent"
                  required
                  className="mt-1"
                  disabled={pending}
                />
                <span>
                  <strong className="font-medium text-foreground">Client consent</strong> — I
                  confirm the client has authorised us to fetch their public website and
                  social profile pages for onboarding purposes only.
                </span>
              </label>
            )}
            {compact && (
              <Button type="submit" disabled={pending} className="sm:mb-0.5">
                {pending && !preview ? "Scraping…" : "Scrape"}
              </Button>
            )}
          </div>

          {compact ? (
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                name="consent"
                required
                className="mt-1"
                disabled={pending}
              />
              <span>Client consents to using public website data for onboarding.</span>
            </label>
          ) : null}

          {socialsImportNote}

          {compact ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                ABN / Places enrichment (optional)
              </summary>
              <div className="mt-3 space-y-4">{extras}</div>
            </details>
          ) : (
            extras
          )}

          {!compact && (
            <Button type="submit" variant="outline" disabled={pending}>
              {pending && !preview ? "Scraping…" : "Preview extracted fields"}
            </Button>
          )}
        </form>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            {success}
          </p>
        )}

        {reviewBlock}
      </CardContent>
    </Card>
  );
}
