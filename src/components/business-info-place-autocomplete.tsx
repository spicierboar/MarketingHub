"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  resolvePlaceDetailsAction,
  searchBusinessPlacesAction,
} from "@/app/(client)/client/profile/actions";
import type { PlaceSuggestion } from "@/lib/places-enrichment";

export type BusinessInfoPlaceFields = {
  businessAddress: string;
  phone: string;
  website: string;
  tradingHours: string;
  serviceAreas: string;
  googlePlaceId: string;
  latitude: string;
  longitude: string;
  placeCategory: string;
};

type Props = {
  businessName: string;
  initial: BusinessInfoPlaceFields;
};

/**
 * Google-style place search: type to get suggestions, pick one to fill
 * address / phone / hours / map pin for campaign targeting.
 */
export function BusinessInfoPlaceAutocomplete({ businessName, initial }: Props) {
  const listId = useId();
  const [query, setQuery] = useState(initial.businessAddress || businessName);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [fields, setFields] = useState(initial);
  const [pending, startTransition] = useTransition();
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (blurTimer.current) clearTimeout(blurTimer.current);
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  function runSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      startTransition(async () => {
        const rows = await searchBusinessPlacesAction(value);
        setSuggestions(rows);
        setOpen(rows.length > 0);
        setStatus(
          rows.length === 0 && value.trim().length >= 2
            ? "No matches — keep typing or enter the address manually."
            : rows[0]?.mode === "simulated"
              ? "Showing simulated Places matches (staging)."
              : null,
        );
      });
    }, 280);
  }

  function applySuggestion(row: PlaceSuggestion) {
    startTransition(async () => {
      const match = await resolvePlaceDetailsAction(row.placeId, row.primaryText);
      if (!match) {
        setStatus("Could not load that place — try another, or type the address.");
        return;
      }
      const suburb =
        match.formattedAddress.split(",")[1]?.trim().replace(/\s+[A-Z]{2,3}\s+\d{4}.*$/, "").trim() ||
        "";
      setFields({
        businessAddress: match.formattedAddress,
        phone: match.phone ?? fields.phone,
        website: match.website ?? fields.website,
        tradingHours: match.openingHoursText?.length
          ? match.openingHoursText.join("; ")
          : fields.tradingHours,
        serviceAreas: suburb || fields.serviceAreas,
        googlePlaceId: match.placeId,
        latitude:
          typeof match.latitude === "number" ? String(match.latitude) : "",
        longitude:
          typeof match.longitude === "number" ? String(match.longitude) : "",
        placeCategory: match.category ?? "",
      });
      setQuery(match.formattedAddress);
      setOpen(false);
      setSuggestions([]);
      setStatus(
        match.mode === "simulated"
          ? "Applied simulated place — pin, phone, and hours filled for campaign targeting."
          : "Applied Google place — pin, phone, and hours filled for campaign targeting.",
      );
    });
  }

  const pinLabel =
    fields.latitude && fields.longitude
      ? `${Number(fields.latitude).toFixed(5)}, ${Number(fields.longitude).toFixed(5)}`
      : null;

  return (
    <div className="space-y-4">
      <input type="hidden" name="googlePlaceId" value={fields.googlePlaceId} />
      <input type="hidden" name="latitude" value={fields.latitude} />
      <input type="hidden" name="longitude" value={fields.longitude} />
      <input type="hidden" name="placeCategory" value={fields.placeCategory} />

      <div className="relative">
        <Field
          label="Find your business"
          htmlFor="place-search"
          hint="Start typing the name or street — pick a match to fill address, phone, hours, and map pin"
        >
          <Input
            id="place-search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            value={query}
            autoComplete="off"
            placeholder="e.g. Saffron Laneway Kitchen Surry Hills"
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              runSearch(v);
            }}
            onFocus={() => {
              if (suggestions.length) setOpen(true);
            }}
            onBlur={() => {
              blurTimer.current = setTimeout(() => setOpen(false), 180);
            }}
          />
        </Field>
        {open && suggestions.length > 0 ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-md"
          >
            {suggestions.map((row) => (
              <li key={row.placeId} role="option">
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applySuggestion(row)}
                >
                  <span className="font-medium">{row.primaryText}</span>
                  <span className="text-xs text-muted-foreground">
                    {row.secondaryText}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              const seed = [businessName, fields.serviceAreas]
                .filter(Boolean)
                .join(" ");
              setQuery(seed);
              runSearch(seed);
            }}
          >
            Search from business name
          </Button>
          {pending ? (
            <span className="text-xs text-muted-foreground">Searching…</span>
          ) : null}
        </div>
        {status ? (
          <p className="mt-2 text-xs text-muted-foreground">{status}</p>
        ) : null}
        {pinLabel ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Map pin linked{fields.placeCategory ? ` · ${fields.placeCategory}` : ""}{" "}
            · {pinLabel}
            {fields.googlePlaceId ? ` · ${fields.googlePlaceId}` : ""}
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            No map pin yet — pick a place so local campaigns can target the right area.
          </p>
        )}
      </div>

      <Field
        label="Business address"
        htmlFor="businessAddress"
        hint="Full street address — used in posts, local listings, and geo targeting"
      >
        <Textarea
          id="businessAddress"
          name="businessAddress"
          rows={2}
          value={fields.businessAddress}
          onChange={(e) => {
            setFields((f) => ({
              ...f,
              businessAddress: e.target.value,
              // Manual edit clears linked place until they pick again.
              googlePlaceId: "",
              latitude: "",
              longitude: "",
              placeCategory: "",
            }));
            setQuery(e.target.value);
          }}
          placeholder="e.g. 12 Example St, Suburb NSW 2000"
        />
      </Field>

      <Field
        label="Service area"
        htmlFor="serviceAreas"
        hint="Suburbs or regions for local reach — comma-separated"
      >
        <Input
          id="serviceAreas"
          name="serviceAreas"
          value={fields.serviceAreas}
          onChange={(e) =>
            setFields((f) => ({ ...f, serviceAreas: e.target.value }))
          }
          placeholder="e.g. Surry Hills, Sydney CBD"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Phone"
          htmlFor="phone"
          hint="Primary public number — used in CTAs and listings"
        >
          <Input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={fields.phone}
            onChange={(e) =>
              setFields((f) => ({ ...f, phone: e.target.value }))
            }
            placeholder="e.g. 02 9000 0000"
          />
        </Field>
        <Field label="Website" htmlFor="website" hint="Full URL including https://">
          <Input
            id="website"
            name="website"
            type="url"
            value={fields.website}
            onChange={(e) =>
              setFields((f) => ({ ...f, website: e.target.value }))
            }
            placeholder="https://www.example.com.au"
          />
        </Field>
      </div>

      <Field
        label="Regular hours"
        htmlFor="tradingHours"
        hint="Used in posts, listings, and when to schedule offers"
      >
        <Textarea
          id="tradingHours"
          name="tradingHours"
          rows={3}
          value={fields.tradingHours}
          onChange={(e) =>
            setFields((f) => ({ ...f, tradingHours: e.target.value }))
          }
          placeholder="Mon–Fri 7am–3pm, Sat 8am–2pm, closed Sun"
        />
      </Field>
    </div>
  );
}
