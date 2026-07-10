"use client";

import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  suggestProfileFields,
  type ProfileSuggestionInput,
} from "@/lib/profile-suggestions";
import type { BusinessType } from "@/lib/types";

/**
 * Fills empty profile textareas from business type + service areas / postcode.
 * Does not overwrite fields the user already filled (unless force=true).
 */
export function ProfileSuggestButton({
  companyName,
  industry,
  formId = "company-profile-form",
  compact = false,
}: {
  companyName?: string;
  industry?: string;
  /** Form element id — company profile or sales new-client wizard */
  formId?: string;
  /** Shorter copy for tight wizards */
  compact?: boolean;
}) {
  const fill = useCallback(
    (force: boolean) => {
      const form = document.getElementById(formId) as HTMLFormElement | null;
      if (!form) return;

      const businessType = (
        (form.elements.namedItem("businessType") as HTMLSelectElement | null)?.value ||
        "other"
      ) as BusinessType;

      const areasRaw =
        (form.elements.namedItem("serviceAreas") as HTMLTextAreaElement | null)?.value ?? "";
      const areas = areasRaw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const suburbsRaw =
        (form.elements.namedItem("suburbs") as HTMLTextAreaElement | null)?.value ?? "";
      const suburbs = suburbsRaw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const industryVal =
        (form.elements.namedItem("industry") as HTMLInputElement | null)?.value?.trim() ||
        industry;

      const suggestions = suggestProfileFields({
        businessType,
        companyName,
        industry: industryVal,
        areas: areas.length ? areas : suburbs,
      } satisfies ProfileSuggestionInput);

      const setIfEmpty = (name: string, value: string) => {
        const el = form.elements.namedItem(name) as
          | HTMLTextAreaElement
          | HTMLInputElement
          | null;
        if (!el) return;
        if (!force && el.value.trim()) return;
        el.value = value;
      };

      setIfEmpty("natureOfBusiness", suggestions.natureOfBusiness);
      setIfEmpty("targetCustomers", suggestions.targetCustomers);
      setIfEmpty("brandVoice", suggestions.brandVoice);
      setIfEmpty("localMarketNotes", suggestions.localMarketNotes);
      setIfEmpty("callsToAction", suggestions.callsToAction.join("\n"));
      setIfEmpty("services", suggestions.services.join("\n"));
    },
    [companyName, industry, formId],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
      <p className="flex-1 text-xs text-muted-foreground">
        {compact ? (
          <>
            Pick <strong>business type</strong>, then Suggest — empty fields only.
          </>
        ) : (
          <>
            Set <strong>business type</strong> and <strong>service areas</strong> (or suburbs), then
            let AI draft the unclear fields. Empty fields only — your edits stay.
          </>
        )}
      </p>
      <Button type="button" size="sm" variant="secondary" onClick={() => fill(false)}>
        Suggest empty fields
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => fill(true)}>
        Re-suggest all
      </Button>
    </div>
  );
}
