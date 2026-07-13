"use client";

import { useMemo, useState } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import {
  ONBOARDING_INDUSTRIES,
  naturesForIndustry,
} from "@/lib/onboarding-industries";

type Props = {
  defaults?: {
    abn?: string;
    industry?: string;
    natureOfBusiness?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
  };
};

/** Cascading Industry → Nature of business for workspace onboarding step 1. */
export function OnboardingDetailsFields({ defaults }: Props) {
  const initialIndustry =
    defaults?.industry &&
    ONBOARDING_INDUSTRIES.some((o) => o.id === defaults.industry)
      ? defaults.industry
      : "";

  const [industry, setIndustry] = useState(initialIndustry);

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
