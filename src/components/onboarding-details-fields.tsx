"use client";

import { useFormStatus } from "react-dom";
import {
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  ONBOARDING_INDUSTRIES,
  naturesForIndustry,
} from "@/lib/onboarding-industries";
import { prefillOnboardingFromWebsiteAction } from "@/app/onboarding/actions";
import {
  type OnboardingDetailsFieldErrors,
  validateOnboardingDetailsFields,
} from "@/lib/form-validation";
import { cn } from "@/lib/utils";

type Props = {
  /** Server action for Continue (details save). */
  action: (formData: FormData) => void | Promise<void>;
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
  prefillBannerTone?: "success" | "warning";
  /** Server-side validation banner when client checks were bypassed. */
  serverError?: string | null;
  /** Intro copy above the fields. */
  intro?: ReactNode;
};

function PrefillSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      formAction={prefillOnboardingFromWebsiteAction}
      formNoValidate
      variant="outline"
      size="sm"
      disabled={disabled || pending}
    >
      {pending ? "Prefilling…" : "Prefill from website"}
    </Button>
  );
}

function errClass(hasError: boolean) {
  return hasError ? "border-red-500 focus-visible:ring-red-500" : undefined;
}

function clearField(
  setErrors: Dispatch<SetStateAction<OnboardingDetailsFieldErrors>>,
  key: keyof OnboardingDetailsFieldErrors,
) {
  setErrors((prev) => {
    if (!prev[key]) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });
}

/** Website-first details; optional scrape prefill via Places + AI/template enrich. */
export function OnboardingDetailsFields({
  action,
  defaults,
  showWebsiteScrape = false,
  prefillBanner,
  prefillBannerTone = "success",
  serverError,
  intro,
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
  const [errors, setErrors] = useState<OnboardingDetailsFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(serverError ?? null);
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

  function onDetailsSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Prefill uses formAction + formNoValidate — that submitter is not the main Continue.
    const submitter = (e.nativeEvent as SubmitEvent).submitter as
      | HTMLButtonElement
      | HTMLInputElement
      | null;
    if (submitter?.getAttribute?.("formAction")) return;

    const fd = new FormData(e.currentTarget);
    const result = validateOnboardingDetailsFields({
      website: String(fd.get("website") || ""),
      abn: String(fd.get("abn") || ""),
      contactName: String(fd.get("contactName") || ""),
      contactEmail: String(fd.get("contactEmail") || ""),
      contactPhone: String(fd.get("contactPhone") || ""),
      industry: String(fd.get("industry") || ""),
      natureOfBusiness: String(fd.get("natureOfBusiness") || ""),
    });
    if (!result.ok) {
      e.preventDefault();
      setErrors(result.errors);
      setFormError("Fix the highlighted fields before continuing.");
      return;
    }
    setErrors({});
    setFormError(null);
  }

  return (
    <form
      action={action}
      onSubmit={onDetailsSubmit}
      className="space-y-4"
      noValidate
    >
      {intro}
      {prefillBanner ? (
        <p
          className={
            prefillBannerTone === "warning"
              ? "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
          }
        >
          {prefillBanner}
        </p>
      ) : null}

      {formError ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          {formError}
        </p>
      ) : null}

      {showWebsiteScrape ? (
        <div className="space-y-3 rounded-md border border-border p-4">
          <Field
            label="Website"
            htmlFor="website"
            hint="Start here — with consent we scrape public pages, then use AI/templates and Google Places / Business Profile signals to pre-fill the fields below."
            error={errors.website}
          >
            <Input
              id="website"
              name="website"
              type="text"
              inputMode="url"
              value={website}
              onChange={(e) => {
                setWebsite(e.target.value);
                clearField(setErrors, "website");
              }}
              placeholder="https://example.com or example.com"
              aria-invalid={!!errors.website}
              className={cn(errClass(!!errors.website))}
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
              {/*
                formNoValidate: Prefill must not be blocked by empty required
                ABN/industry/contact fields further down the same form.
              */}
              <PrefillSubmitButton disabled={!consentChecked} />
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
          error={errors.abn}
        >
          <Input
            id="abn"
            name="abn"
            required
            defaultValue={defaults?.abn ?? ""}
            inputMode="numeric"
            placeholder="e.g. 51 824 753 556"
            autoComplete="off"
            aria-invalid={!!errors.abn}
            className={cn(errClass(!!errors.abn))}
            onChange={() => clearField(setErrors, "abn")}
          />
        </Field>
        <Field
          label="Primary contact name"
          htmlFor="contactName"
          error={errors.contactName}
        >
          <Input
            id="contactName"
            name="contactName"
            required
            defaultValue={defaults?.contactName ?? ""}
            placeholder="e.g. Sam Nguyen"
            aria-invalid={!!errors.contactName}
            className={cn(errClass(!!errors.contactName))}
            onChange={() => clearField(setErrors, "contactName")}
          />
        </Field>
        <Field label="Industry" htmlFor="industry" error={errors.industry}>
          <Select
            id="industry"
            name="industry"
            required
            value={industry}
            aria-invalid={!!errors.industry}
            className={cn(errClass(!!errors.industry))}
            onChange={(e) => {
              setIndustry(e.target.value);
              setNatureId("");
              clearField(setErrors, "industry");
              clearField(setErrors, "natureOfBusiness");
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
          error={errors.natureOfBusiness}
        >
          <Select
            id="natureOfBusiness"
            name="natureOfBusiness"
            required
            disabled={!industry}
            value={natureId}
            aria-invalid={!!errors.natureOfBusiness}
            className={cn(errClass(!!errors.natureOfBusiness))}
            onChange={(e) => {
              setNatureId(e.target.value);
              clearField(setErrors, "natureOfBusiness");
            }}
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
        <Field
          label="Contact email"
          htmlFor="contactEmail"
          error={errors.contactEmail}
        >
          <Input
            id="contactEmail"
            name="contactEmail"
            type="email"
            required
            defaultValue={defaults?.contactEmail ?? ""}
            placeholder="owner@harbourviewcafe.com.au"
            aria-invalid={!!errors.contactEmail}
            className={cn(errClass(!!errors.contactEmail))}
            onChange={() => clearField(setErrors, "contactEmail")}
          />
        </Field>
        <Field
          label="Contact phone (optional)"
          htmlFor="contactPhone"
          error={errors.contactPhone}
        >
          <Input
            id="contactPhone"
            name="contactPhone"
            defaultValue={defaults?.contactPhone ?? ""}
            placeholder="04xx xxx xxx"
            aria-invalid={!!errors.contactPhone}
            className={cn(errClass(!!errors.contactPhone))}
            onChange={() => clearField(setErrors, "contactPhone")}
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
      <Button type="submit">Continue →</Button>
    </form>
  );
}
