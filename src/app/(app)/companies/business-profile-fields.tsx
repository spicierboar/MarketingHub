"use client";

import { useState } from "react";
import { Field, Select, Textarea } from "@/components/ui/form";
import { BUSINESS_TYPES } from "@/lib/business-profiles";
import type {
  BusinessType,
  HotelProfileFields,
  RestaurantProfileFields,
  RetailProfileFields,
} from "@/lib/types";

interface Props {
  initialType: BusinessType;
  retail?: RetailProfileFields;
  hotel?: HotelProfileFields;
  restaurant?: RestaurantProfileFields;
  /** When false, hide retail/wholesale profile fields (e.g. New Client wizard). Default true. */
  showRetailProfile?: boolean;
}

function joinLines(items?: string[]): string {
  return (items ?? []).join("\n");
}

/** Business-type picker + conditional vertical profile sections. */
export function BusinessTypeSection({
  initialType,
  retail,
  hotel,
  restaurant,
  showRetailProfile = true,
}: Props) {
  const [type, setType] = useState<BusinessType>(initialType);

  return (
    <div className="space-y-5">
      <Field
        label="Business type"
        htmlFor="businessType"
        hint="Drives content templates, campaign goals, and AI context"
      >
        <Select
          id="businessType"
          name="businessType"
          value={type}
          onChange={(e) => setType(e.target.value as BusinessType)}
          required
        >
          {BUSINESS_TYPES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-xs text-muted-foreground">
        {BUSINESS_TYPES.find((b) => b.value === type)?.description}
      </p>

      {showRetailProfile && type === "retail" && (
        <div className="space-y-5 rounded-md border border-dashed border-border p-4">
          <p className="text-sm font-medium">Retail and wholesale profile</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Product categories" htmlFor="retail_productCategories" hint="One per line — leave blank unless this is a real store category list">
              <Textarea
                id="retail_productCategories"
                name="retail_productCategories"
                defaultValue={joinLines(retail?.productCategories)}
                placeholder={"e.g. Specialty foods\nHomewares\nGiftware"}
              />
            </Field>
            <Field label="Hero products" htmlFor="retail_heroProducts" hint="Bestsellers to feature — only if known">
              <Textarea
                id="retail_heroProducts"
                name="retail_heroProducts"
                defaultValue={joinLines(retail?.heroProducts)}
                placeholder={"e.g. Hero SKU or range names from the site"}
              />
            </Field>
            <Field label="Promotions" htmlFor="retail_promotions" hint="Approved wording only">
              <Textarea
                id="retail_promotions"
                name="retail_promotions"
                defaultValue={joinLines(retail?.promotions)}
                placeholder="e.g. Midweek specials — see in-store board"
              />
            </Field>
            <Field label="Seasonal focus" htmlFor="retail_seasons" hint="Optional seasonal ranges">
              <Textarea
                id="retail_seasons"
                name="retail_seasons"
                defaultValue={joinLines(retail?.seasons)}
                placeholder={"Winter: …\nSummer: …"}
              />
            </Field>
          </div>
          <Field label="Price positioning" htmlFor="retail_pricePositioning">
            <Textarea
              id="retail_pricePositioning"
              name="retail_pricePositioning"
              defaultValue={retail?.pricePositioning ?? ""}
              placeholder="e.g. Mid-market independent — quality over cheapest"
            />
          </Field>
        </div>
      )}

      {type === "hotel" && (
        <div className="space-y-5 rounded-md border border-dashed border-border p-4">
          <p className="text-sm font-medium">Hotel profile</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Room types" htmlFor="hotel_roomTypes" hint="One per line">
              <Textarea
                id="hotel_roomTypes"
                name="hotel_roomTypes"
                defaultValue={joinLines(hotel?.roomTypes)}
                placeholder={"King studio\nOcean-view suite"}
              />
            </Field>
            <Field label="Packages" htmlFor="hotel_packages" hint="Stay + experience bundles">
              <Textarea
                id="hotel_packages"
                name="hotel_packages"
                defaultValue={joinLines(hotel?.packages)}
                placeholder={"Weekend spa escape\nDinner + stay"}
              />
            </Field>
            <Field label="Amenities" htmlFor="hotel_amenities" hint="One per line">
              <Textarea
                id="hotel_amenities"
                name="hotel_amenities"
                defaultValue={joinLines(hotel?.amenities)}
                placeholder={"Pool\nOn-site restaurant\nFree parking"}
              />
            </Field>
            <Field label="Occupancy language" htmlFor="hotel_occupancyLanguage" hint="Approved availability phrasing — not live inventory">
              <Textarea
                id="hotel_occupancyLanguage"
                name="hotel_occupancyLanguage"
                defaultValue={hotel?.occupancyLanguage ?? ""}
                placeholder="e.g. Limited rooms remaining this weekend"
              />
            </Field>
          </div>
          <Field label="Direct booking benefits" htmlFor="hotel_directBookingBenefits">
            <Textarea
              id="hotel_directBookingBenefits"
              name="hotel_directBookingBenefits"
              defaultValue={hotel?.directBookingBenefits ?? ""}
              placeholder="e.g. Best rate guarantee + late checkout when you book direct"
            />
          </Field>
        </div>
      )}

      {type === "restaurant_cafe" && (
        <div className="space-y-5 rounded-md border border-dashed border-border p-4">
          <p className="text-sm font-medium">Restaurant / café profile</p>
          <p className="text-xs text-muted-foreground">
            Complements Menus and Order Now — does not replace them.
          </p>
          <Field label="Cuisine style" htmlFor="restaurant_cuisineStyle">
            <Textarea
              id="restaurant_cuisineStyle"
              name="restaurant_cuisineStyle"
              defaultValue={restaurant?.cuisineStyle ?? ""}
              placeholder="e.g. Modern Australian all-day café — breakfast and lunch"
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Service modes" htmlFor="restaurant_serviceModes" hint="dine-in, takeaway, delivery…">
              <Textarea
                id="restaurant_serviceModes"
                name="restaurant_serviceModes"
                defaultValue={joinLines(restaurant?.serviceModes)}
                placeholder={"Dine-in\nTakeaway\nDelivery"}
              />
            </Field>
            <Field label="Dietary options" htmlFor="restaurant_dietaryOptions">
              <Textarea
                id="restaurant_dietaryOptions"
                name="restaurant_dietaryOptions"
                defaultValue={joinLines(restaurant?.dietaryOptions)}
                placeholder={"Vegetarian\nGF options\nKids meals"}
              />
            </Field>
          </div>
          <Field label="Peak service periods" htmlFor="restaurant_peakServicePeriods" hint="e.g. Weekday lunch 11:30–2pm">
            <Textarea
              id="restaurant_peakServicePeriods"
              name="restaurant_peakServicePeriods"
              defaultValue={joinLines(restaurant?.peakServicePeriods)}
              placeholder={"Weekday lunch 11:30–2pm\nSaturday brunch 8am–2pm"}
            />
          </Field>
        </div>
      )}
    </div>
  );
}
