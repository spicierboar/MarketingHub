"use client";

import { useState, useTransition } from "react";
import type { AutoOnboardingScrapeResult } from "@/lib/auto-onboarding";
import { SOCIAL_PLATFORMS } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import {
  applyAutoOnboardingAction,
  previewAutoOnboardingAction,
} from "@/app/(app)/companies/auto-onboarding-actions";

const CONFIDENCE_TONE: Record<
  "high" | "medium" | "low",
  "success" | "warning" | "neutral"
> = {
  high: "success",
  medium: "warning",
  low: "neutral",
};

export function AutoOnboardingPanel({
  companyId,
  companyName,
  defaultWebsite,
  defaultSocial,
  lastScrape,
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
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [preview, setPreview] = useState<AutoOnboardingScrapeResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overwrite, setOverwrite] = useState(false);

  function toggleField(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handlePreview(formData: FormData) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await previewAutoOnboardingAction(formData);
      if (!result.ok) {
        setPreview(null);
        setError(result.error);
        return;
      }
      setPreview(result.preview);
      setSelected(new Set(result.preview.fields.map((f) => f.key)));
    });
  }

  function handleApply(formData: FormData) {
    setError(null);
    setSuccess(null);
    if (!preview) {
      setError("Run a preview scrape before applying.");
      return;
    }
    formData.set("previewJson", JSON.stringify(preview));
    formData.set("selectedFields", JSON.stringify([...selected]));
    if (overwrite) formData.set("overwrite", "on");

    startTransition(async () => {
      const result = await applyAutoOnboardingAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess("Profile fields applied — review and save any manual edits below.");
      setPreview(null);
      setSelected(new Set());
    });
  }

  return (
    <Card className="border-primary/20">
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="font-semibold">Auto-onboarding scrape</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            With explicit client consent, scrape {companyName}&apos;s public website and
            social profile URLs to pre-fill Brand Brain fields. Preview everything before
            applying — nothing is written until you confirm.
          </p>
          {lastScrape?.at && (
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

          <Field label="Website URL" htmlFor="auto_website">
            <Input
              id="auto_website"
              name="website"
              type="url"
              inputMode="url"
              placeholder="https://example.com"
              defaultValue={defaultWebsite}
              disabled={pending}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIAL_PLATFORMS.map((s) => (
              <Field key={s.key} label={s.label} htmlFor={`auto_social_${s.key}`}>
                <Input
                  id={`auto_social_${s.key}`}
                  name={`social_${s.key}`}
                  type="url"
                  inputMode="url"
                  placeholder={s.placeholder}
                  defaultValue={defaultSocial[s.key] ?? ""}
                  disabled={pending}
                />
              </Field>
            ))}
          </div>

          <Button type="submit" variant="outline" disabled={pending}>
            {pending && !preview ? "Scraping…" : "Preview extracted fields"}
          </Button>
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

        {preview && (
          <div className="space-y-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">Preview</h3>
              <Badge tone={preview.mode === "live" ? "primary" : "neutral"}>
                {preview.mode === "live" ? "Live fetch" : "Simulated"}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {preview.fields.length} field(s) from {preview.sources.length} source(s)
              </span>
            </div>

            <ul className="space-y-2">
              {preview.fields.map((field) => (
                <li
                  key={field.key}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(field.key)}
                      onChange={() => toggleField(field.key)}
                      className="mt-1"
                      disabled={pending}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{field.label}</span>
                        <Badge tone={CONFIDENCE_TONE[field.confidence]}>
                          {field.confidence}
                        </Badge>
                        {field.alreadySet && (
                          <Badge tone="warning">Already set</Badge>
                        )}
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
              ))}
            </ul>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                disabled={pending}
              />
              Overwrite fields that already have values
            </label>

            <form action={handleApply}>
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
                {pending ? "Applying…" : `Apply ${selected.size} selected field(s)`}
              </Button>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
