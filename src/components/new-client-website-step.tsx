"use client";

import { useState } from "react";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { FormSeedButton } from "@/components/form-seed-button";
import { saveWebsiteStepAction } from "@/app/(app)/sales/actions";

/** Identity + optional website scrape; consent required when a URL is entered. */
export function NewClientWebsiteStep({
  companyId,
  initialName,
  initialAbn,
  initialWebsite,
  consentDefault,
}: {
  companyId?: string;
  initialName?: string;
  initialAbn?: string;
  initialWebsite?: string;
  consentDefault?: boolean;
}) {
  const [website, setWebsite] = useState(initialWebsite ?? "");
  const [consentChecked, setConsentChecked] = useState(!!consentDefault);
  const willScrape = website.trim().length > 0;

  return (
    <form id="new-client-website-form" action={saveWebsiteStepAction} className="space-y-4">
      {companyId ? <input type="hidden" name="companyId" value={companyId} /> : null}
      <p className="text-sm text-muted-foreground">
        Business name + ABN identify the account — another trading name under the
        same ABN needs its own client. With consent we scrape public website pages,
        then AI/template-enrich the profile before you review it.
      </p>
      <FormSeedButton
        formId="new-client-website-form"
        hint={
          <>
            Demo walkthrough — seeds empty fields with an example client. Replace with
            the real business before scraping.
          </>
        }
        values={{
          name: "Harbourview Café",
          abn: "51 824 753 556",
          website: "https://example.com",
          consent: true,
        }}
        onAfterFill={(force) => {
          setWebsite((prev) =>
            force || !prev.trim() ? "https://example.com" : prev,
          );
          setConsentChecked((prev) => (force || !prev ? true : prev));
        }}
      />
      <Field
        label="Business name"
        htmlFor="name"
        hint="Trading name customers recognise — identity key with ABN"
      >
        <Input
          id="name"
          name="name"
          required
          defaultValue={initialName ?? ""}
          placeholder="e.g. Viya Imports"
        />
      </Field>
      <Field
        label="ABN"
        htmlFor="abn"
        hint="Required. Verified against the ABR when available. Same ABN + different business name = separate account."
      >
        <Input
          id="abn"
          name="abn"
          required
          defaultValue={initialAbn ?? ""}
          inputMode="numeric"
          placeholder="e.g. 51 824 753 556"
          autoComplete="off"
        />
      </Field>
      <Field
        label="Website"
        htmlFor="website"
        hint="Recommended — we scrape public pages to pre-fill the Profile step."
      >
        <Input
          id="website"
          name="website"
          type="text"
          inputMode="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.com or example.com"
        />
      </Field>
      {willScrape ? (
        <label className="flex items-start gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            name="consent"
            value="on"
            required
            className="mt-1"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
          />
          <span>
            Client consents to collecting publicly available information from this
            website for onboarding.
          </span>
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">
          No website yet — you can still continue and fill the profile manually.
        </p>
      )}
      <Button type="submit">
        {willScrape
          ? initialWebsite
            ? "Re-scrape & continue to Profile"
            : "Continue — scrape & open Profile"
          : "Continue to Profile"}
      </Button>
    </form>
  );
}
