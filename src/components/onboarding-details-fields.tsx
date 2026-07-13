"use client";

import { useMemo, useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  ONBOARDING_INDUSTRIES,
  naturesForIndustry,
} from "@/lib/onboarding-industries";
import { prefillOnboardingFromWebsiteAction } from "@/app/onboarding/actions";

type Props = {
  defaults?: {
    abn?: string;
    industry?: string;
    natureOfBusiness?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
    website?: string;
    scrapeConsent?: boolean;
  };
  showWebsiteScrape?: boolean;
  /** Shown after a successful / partial website prefill. */
  prefillBanner?: string | null;
};

/** Website-first details; optional scrape prefill via Places + AI/template enrich. */
export function OnboardingDetailsFields({
  defaults,
  showWebsiteScrape = false,
  prefillBanner,
}: Props) {
  const initialIndustry =
    defaults?.industry &&
    ONBOARDING_INDUSTRIES.some((o) => o.id === defaults.industry)
      ? defaults.industry
      : "";

  const [industry, setIndustry] = useState(initialIndustry);
  const [website, setWebsite] = useState(defaults?.website ?? "");
  const [consentChecked, setConsentChecked] = useState(
    !!defaults?.scrapeConsent,
  );
  const willScrape = showWebsiteScrape && website.trim().length > 0;

  const natures = useMemo(() => naturesForIndustry(industry), [industry]);

  const initialNatureId = useMemo(() => {
    if (!defaults?.natureOfBusiness || !industry) return "";
    const hit = natures.find(
      (n) =>
        n.id === defaults.natureOfBusiness ||
        n.label === defaults.natureOfBusiness,
    );
    return hit?.id ?? "";
  }, [defaults?.natureOfBusiness, industry, natures]);

  const [natureId, setNatureId] = useState(initialNatureId);

  return (
    <div className="space-y-4">
      {prefillBanner ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          {prefillBanner}
        </p>
      ) : null}

      {showWebsiteScrape ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          <Field
            label="Website"
            htmlFor="website"
            hint="Start here — with consent we scrape public pages, then use AI/templates and Google Places / Business Profile signals to pre-fill the fields below."
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
            <>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="consent"
                  value="on"
                  className="mt-1"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                />
                <span>
                  I consent to collecting publicly available information from this
                  website (and related public listings) for onboarding.
                </span>
              </label>
              <Button
                type="submit"
                formAction={prefillOnboardingFromWebsiteAction}
                variant="outline"
                size="sm"
                disabled={!consentChecked}
              >
                Prefill from website
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No website yet — fill the fields below manually, or add a URL to
              prefill.
            </p>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="ABN"
          htmlFor="abn"
          hint="11-digit Australian Business Number (spaces optional)"
        >
          <Input
            id="abn"
            name="abn"
            required
            defaultValue={defaults?.abn ?? ""}
            inputMode="numeric"
            placeholder="e.g. 51 824 753 556"
            autoComplete="off"
          />
        </Field>
        <Field label="Primary contact name" htmlFor="contactName">
          <Input
            id="contactName"
            name="contactName"
            required
            defaultValue={defaults?.contactName ?? ""}
            placeholder="e.g. Sam Nguyen"
          />
        </Field>
        <Field label="Industry" htmlFor="industry">
          <Select
            id="industry"
            name="industry"
            required
            value={industry}
            onChange={(e) => {
              setIndustry(e.target.value);
              setNatureId("");
            }}
          >
            <option value="" disabled>
              Select industry…
            </option>
            {ONBOARDING_INDUSTRIES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Nature of business"
          htmlFor="natureOfBusiness"
          hint="Closest match — refine later in your business profile"
        >
          <Select
            id="natureOfBusiness"
            name="natureOfBusiness"
            required
            disabled={!industry}
            value={natureId}
            onChange={(e) => setNatureId(e.target.value)}
          >
            <option value="" disabled>
              {industry ? "Select nature…" : "Choose industry first"}
            </option>
            {natures.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact email" htmlFor="contactEmail">
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            required
            defaultValue={defaults?.contactEmail ?? ""}
            placeholder="owner@harbourviewcafe.com.au"
          />
        </Field>
        <Field label="Contact phone (optional)" htmlFor="contactPhone">
          <Input
            id="contactPhone"
            name="contactPhone"
            defaultValue={defaults?.contactPhone ?? ""}
            placeholder="04xx xxx xxx"
          />
        </Field>
      </div>
      <Field
        label="Anything we should know? (optional)"
        htmlFor="notes"
        hint="Goals, number of brands, locations — plain language"
      >
        <Input
          id="notes"
          name="notes"
          defaultValue={defaults?.notes ?? ""}
          placeholder="e.g. Two locations in Bondi — want more weekday lunch trade"
        />
      </Field>
    </div>
  );
}
