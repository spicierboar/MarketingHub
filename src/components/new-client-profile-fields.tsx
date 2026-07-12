"use client";

import { useState } from "react";
import { Field, Input, Textarea } from "@/components/ui/form";
import { BusinessTypeSection } from "@/app/(app)/companies/business-profile-fields";
import { ProfileSuggestButton } from "@/components/profile-suggest-button";
import {
  PROFILE_FIELD_HELP,
  PROFILE_FIELD_PLACEHOLDERS,
} from "@/lib/profile-suggestions";
import type {
  BusinessType,
  CompanyProfile,
  HotelProfileFields,
  RestaurantProfileFields,
} from "@/lib/types";

function joinLines(items?: string[]): string {
  return (items ?? []).join("\n");
}

/** Profile step fields with industry-aware placeholders (not café-only). */
export function NewClientProfileFields({
  formId,
  initialName,
  profile,
}: {
  formId: string;
  initialName: string;
  profile: CompanyProfile;
}) {
  const initialType: BusinessType = profile.businessType ?? "other";
  const [type, setType] = useState<BusinessType>(initialType);
  const ph = PROFILE_FIELD_PLACEHOLDERS[type] ?? PROFILE_FIELD_PLACEHOLDERS.other;

  return (
    <div className="space-y-4">
      <Field
        label="Business name"
        htmlFor="name"
        hint="Trading name customers recognise — identity key with ABN (not necessarily the legal entity)."
      >
        <Input
          id="name"
          name="name"
          required
          defaultValue={initialName}
          placeholder="e.g. Viya Imports"
        />
      </Field>
      <Field
        label="ABN"
        htmlFor="abn"
        hint="Required with business name. Verified against the ABR when available. Same ABN may have other accounts under different trading names."
      >
        <Input
          id="abn"
          name="abn"
          required={!profile.abn?.trim()}
          defaultValue={profile.abn ?? ""}
          inputMode="numeric"
          placeholder="e.g. 51 824 753 556"
          autoComplete="off"
        />
      </Field>

      {/* Sync type for placeholders — BusinessTypeSection owns the select; we mirror via onChange on a wrapper */}
      <BusinessTypeSectionWithPlaceholderSync
        initialType={initialType}
        hotel={profile.hotel as HotelProfileFields | undefined}
        restaurant={profile.restaurant as RestaurantProfileFields | undefined}
        onTypeChange={setType}
      />

      <ProfileSuggestButton formId={formId} companyName={initialName} compact />

      <Field
        label="Nature of business"
        htmlFor="natureOfBusiness"
        hint={PROFILE_FIELD_HELP.natureOfBusiness}
      >
        <Textarea
          id="natureOfBusiness"
          name="natureOfBusiness"
          rows={2}
          defaultValue={profile.natureOfBusiness ?? ""}
          placeholder={ph.natureOfBusiness}
        />
      </Field>
      <Field
        label="Services"
        htmlFor="services"
        hint={PROFILE_FIELD_HELP.services}
      >
        <Textarea
          id="services"
          name="services"
          rows={3}
          defaultValue={joinLines(profile.services)}
          placeholder={ph.services}
        />
      </Field>
      {type === "retail" && (
        <Field
          label="Product categories"
          htmlFor="retail_productCategories"
          hint={PROFILE_FIELD_HELP.productCategories}
        >
          <Textarea
            id="retail_productCategories"
            name="retail_productCategories"
            rows={3}
            defaultValue={joinLines(profile.retail?.productCategories)}
            placeholder={ph.productCategories ?? "Rice\nSnacks\nOils"}
          />
        </Field>
      )}
      <Field
        label="Target customers"
        htmlFor="targetCustomers"
        hint={PROFILE_FIELD_HELP.targetCustomers}
      >
        <Textarea
          id="targetCustomers"
          name="targetCustomers"
          rows={2}
          defaultValue={profile.targetCustomers ?? ""}
          placeholder={ph.targetCustomers}
        />
      </Field>
      <Field
        label="Brand voice"
        htmlFor="brandVoice"
        hint={PROFILE_FIELD_HELP.brandVoice}
      >
        <Textarea
          id="brandVoice"
          name="brandVoice"
          rows={2}
          defaultValue={profile.brandVoice ?? ""}
          placeholder={ph.brandVoice}
        />
      </Field>
      <Field
        label="Calls to action"
        htmlFor="callsToAction"
        hint={PROFILE_FIELD_HELP.callsToAction}
      >
        <Textarea
          id="callsToAction"
          name="callsToAction"
          rows={2}
          defaultValue={joinLines(profile.callsToAction)}
          placeholder={ph.callsToAction}
        />
      </Field>
      <Field
        label="Service areas"
        htmlFor="serviceAreas"
        hint={PROFILE_FIELD_HELP.serviceAreas}
      >
        <Textarea
          id="serviceAreas"
          name="serviceAreas"
          rows={2}
          defaultValue={joinLines(profile.serviceAreas)}
          placeholder={"Sydney metro\nNSW"}
        />
      </Field>

      <details className="group rounded-lg border border-border">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-muted-foreground marker:content-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            More details
            <span className="text-xs font-normal group-open:hidden">
              Compliance claims &amp; disclaimers
            </span>
          </span>
        </summary>
        <div className="space-y-4 border-t border-border px-3 py-3">
          <Field
            label="Approved claims"
            htmlFor="approvedClaims"
            hint={PROFILE_FIELD_HELP.approvedClaims}
          >
            <Textarea
              id="approvedClaims"
              name="approvedClaims"
              rows={3}
              defaultValue={joinLines(profile.approvedClaims)}
              placeholder={ph.approvedClaims}
            />
          </Field>
          <Field
            label="Prohibited claims"
            htmlFor="prohibitedClaims"
            hint={PROFILE_FIELD_HELP.prohibitedClaims}
          >
            <Textarea
              id="prohibitedClaims"
              name="prohibitedClaims"
              rows={3}
              defaultValue={joinLines(profile.prohibitedClaims)}
              placeholder={ph.prohibitedClaims}
            />
          </Field>
          <Field
            label="Required disclaimers"
            htmlFor="requiredDisclaimers"
            hint={PROFILE_FIELD_HELP.requiredDisclaimers}
          >
            <Textarea
              id="requiredDisclaimers"
              name="requiredDisclaimers"
              rows={3}
              defaultValue={joinLines(profile.requiredDisclaimers)}
              placeholder={ph.requiredDisclaimers}
            />
          </Field>
        </div>
      </details>
    </div>
  );
}

/** Wraps BusinessTypeSection and reports type changes for placeholder sync. */
function BusinessTypeSectionWithPlaceholderSync({
  initialType,
  hotel,
  restaurant,
  onTypeChange,
}: {
  initialType: BusinessType;
  hotel?: HotelProfileFields;
  restaurant?: RestaurantProfileFields;
  onTypeChange: (t: BusinessType) => void;
}) {
  return (
    <div
      onChange={(e) => {
        const t = e.target;
        if (
          t instanceof HTMLSelectElement &&
          t.name === "businessType" &&
          t.value
        ) {
          onTypeChange(t.value as BusinessType);
        }
      }}
    >
      <BusinessTypeSection
        initialType={initialType}
        hotel={hotel}
        restaurant={restaurant}
        showRetailProfile={false}
      />
    </div>
  );
}
