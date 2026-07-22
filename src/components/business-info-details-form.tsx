"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { Field, Input, Select } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import {
  resolvePlaceDetailsAction,
  searchBusinessPlacesAction,
} from "@/app/(client)/client/profile/actions";
import type { PlaceSuggestion } from "@/lib/places-enrichment";
import { localitiesForPostcode } from "@/lib/business-info/au-postcodes";
import { COUNTRY_OPTIONS, filterCountries } from "@/lib/business-info/countries";
import {
  formatStructuredAddress,
  formatStructuredHours,
  formatStructuredPhone,
  parseAddressText,
  parsePhoneText,
  parseTradingHoursText,
} from "@/lib/business-info/format";
import { AU_STREET_TYPES } from "@/lib/business-info/street-types";
import {
  MINUTE_OPTIONS,
  WEEKDAY_LABEL,
  WEEKDAYS,
  type ClockTime,
  type DayHours,
  type StructuredBusinessAddress,
  type StructuredPhone,
  type StructuredTradingHours,
  type Weekday,
} from "@/lib/business-info/types";
import type { BusinessInfoFormInitial } from "@/lib/business-info/form-initial";

export type { BusinessInfoFormInitial };

type Props = {
  initial: BusinessInfoFormInitial;
  /** Hide website when the parent form already collects it (onboarding / sales). */
  showWebsite?: boolean;
  showPlaceSearch?: boolean;
  showServiceAreas?: boolean;
};

function FilterableCountry({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string, dial?: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = COUNTRY_OPTIONS.find((c) => c.code === value);
  const options = useMemo(() => filterCountries(q), [q]);
  const listId = useId();

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        value={open ? q : selected ? `${selected.name} (${selected.code})` : q}
        placeholder="Start typing a country"
        autoComplete="off"
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open ? (
        <ul
          id={listId}
          className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-md"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">No match</li>
          ) : (
            options.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(c.code, c.dial);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.code}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function TimeSelects({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value?: ClockTime;
  onChange: (t: ClockTime) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const v = value ?? { hour: 9, minute: 0, period: "AM" as const };
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Select
        id={`${idPrefix}-h`}
        className="h-9 w-[4.5rem] py-0"
        disabled={disabled}
        value={String(v.hour)}
        onChange={(e) => onChange({ ...v, hour: Number(e.target.value) })}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select
        id={`${idPrefix}-m`}
        className="h-9 w-[4.5rem] py-0"
        disabled={disabled}
        value={String(v.minute)}
        onChange={(e) =>
          onChange({ ...v, minute: Number(e.target.value) as 0 | 15 | 30 | 45 })
        }
      >
        {MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, "0")}
          </option>
        ))}
      </Select>
      <Select
        id={`${idPrefix}-p`}
        className="h-9 w-[4.5rem] py-0"
        disabled={disabled}
        value={v.period}
        onChange={(e) =>
          onChange({ ...v, period: e.target.value as "AM" | "PM" })
        }
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </Select>
    </div>
  );
}

/**
 * Precise Business info capture: country → postcode → suburb, street parts,
 * dial-code phone, and Google-style per-day hours with AM/PM.
 */
export function BusinessInfoDetailsForm({
  initial,
  showWebsite = true,
  showPlaceSearch = true,
  showServiceAreas = true,
}: Props) {
  const listId = useId();
  const [address, setAddress] = useState(initial.address);
  const [phone, setPhone] = useState(initial.phone);
  const [hours, setHours] = useState(initial.hours);
  const [website, setWebsite] = useState(initial.website);
  const [serviceAreas, setServiceAreas] = useState(initial.serviceAreas);
  const [placeMeta, setPlaceMeta] = useState({
    googlePlaceId: initial.googlePlaceId,
    latitude: initial.latitude,
    longitude: initial.longitude,
    placeCategory: initial.placeCategory,
  });

  const [placeQuery, setPlaceQuery] = useState(
    initial.businessAddressText || initial.businessName,
  );
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const auLocalities = useMemo(
    () =>
      address.countryCode === "AU"
        ? localitiesForPostcode(address.postcode)
        : [],
    [address.countryCode, address.postcode],
  );

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const serializedAddress = formatStructuredAddress(address);
  const serializedPhone = formatStructuredPhone(phone);
  const serializedHours = formatStructuredHours(hours);

  function patchDay(day: Weekday, patch: Partial<DayHours>) {
    setHours((h) => ({
      days: h.days.map((d) => (d.day === day ? { ...d, ...patch } : d)),
    }));
  }

  function copyMondayToWeekdays() {
    const mon = hours.days.find((d) => d.day === "monday");
    if (!mon) return;
    setHours((h) => ({
      days: h.days.map((d) =>
        d.day === "saturday" || d.day === "sunday"
          ? d
          : {
              day: d.day,
              closed: mon.closed,
              open: mon.open,
              close: mon.close,
            },
      ),
    }));
  }

  function runPlaceSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      startTransition(async () => {
        const rows = await searchBusinessPlacesAction(value);
        setSuggestions(rows);
        setPlaceOpen(rows.length > 0);
      });
    }, 280);
  }

  function applyPlace(row: PlaceSuggestion) {
    startTransition(async () => {
      const match = await resolvePlaceDetailsAction(row.placeId, row.primaryText);
      if (!match) {
        setStatus("Could not load that place — fill the fields below instead.");
        return;
      }
      const nextAddress = parseAddressText(match.formattedAddress, address.countryCode || "AU");
      const nextPhone = match.phone
        ? parsePhoneText(match.phone)
        : phone;
      const nextHours = match.openingHoursText?.length
        ? parseTradingHoursText(match.openingHoursText.join("; "))
        : hours;
      setAddress(nextAddress);
      setPhone(nextPhone);
      setHours(nextHours);
      if (match.website) setWebsite(match.website);
      if (nextAddress.suburb) {
        setServiceAreas((s) => s || nextAddress.suburb);
      }
      setPlaceMeta({
        googlePlaceId: match.placeId,
        latitude:
          typeof match.latitude === "number" ? String(match.latitude) : "",
        longitude:
          typeof match.longitude === "number" ? String(match.longitude) : "",
        placeCategory: match.category ?? "",
      });
      setPlaceQuery(match.formattedAddress);
      setPlaceOpen(false);
      setStatus(
        match.mode === "simulated"
          ? "Applied simulated place — review each field before saving."
          : "Applied Google place — review each field before saving.",
      );
    });
  }

  return (
    <div className="space-y-8">
      <input type="hidden" name="businessAddress" value={serializedAddress} />
      <input type="hidden" name="phone" value={serializedPhone} />
      <input type="hidden" name="tradingHours" value={serializedHours} />
      <input
        type="hidden"
        name="structuredAddressJson"
        value={JSON.stringify(address)}
      />
      <input
        type="hidden"
        name="structuredPhoneJson"
        value={JSON.stringify(phone)}
      />
      <input
        type="hidden"
        name="structuredHoursJson"
        value={JSON.stringify(hours)}
      />
      {showWebsite ? <input type="hidden" name="website" value={website} /> : null}
      {showServiceAreas ? (
        <input type="hidden" name="serviceAreas" value={serviceAreas} />
      ) : null}
      <input type="hidden" name="googlePlaceId" value={placeMeta.googlePlaceId} />
      <input type="hidden" name="latitude" value={placeMeta.latitude} />
      <input type="hidden" name="longitude" value={placeMeta.longitude} />
      <input type="hidden" name="placeCategory" value={placeMeta.placeCategory} />

      {showPlaceSearch ? (
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Find on Google (optional)
        </h3>
        <p className="text-xs text-muted-foreground">
          Prefer this or website prefill — then review the fields below instead of typing from scratch.
        </p>
        <div className="relative">
          <Field
            label="Search"
            htmlFor="place-search"
            hint="Optional shortcut — still review the precise fields below"
          >
            <Input
              id="place-search"
              role="combobox"
              aria-expanded={placeOpen}
              aria-controls={listId}
              value={placeQuery}
              autoComplete="off"
              placeholder="Business name or street"
              onChange={(e) => {
                setPlaceQuery(e.target.value);
                runPlaceSearch(e.target.value);
              }}
              onFocus={() => suggestions.length && setPlaceOpen(true)}
              onBlur={() => setTimeout(() => setPlaceOpen(false), 150)}
            />
          </Field>
          {placeOpen && suggestions.length > 0 ? (
            <ul
              id={listId}
              className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-md"
            >
              {suggestions.map((row) => (
                <li key={row.placeId}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyPlace(row)}
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
          {pending ? (
            <p className="mt-1 text-xs text-muted-foreground">Searching…</p>
          ) : null}
          {status ? (
            <p className="mt-1 text-xs text-muted-foreground">{status}</p>
          ) : null}
          {placeMeta.latitude && placeMeta.longitude ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Map pin {Number(placeMeta.latitude).toFixed(5)},{" "}
              {Number(placeMeta.longitude).toFixed(5)}
              {placeMeta.placeCategory ? ` · ${placeMeta.placeCategory}` : ""}
            </p>
          ) : null}
        </div>
      </div>
      ) : null}

      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Address
        </h3>
        <p className="text-xs text-muted-foreground">
          Country first, then postcode (suburb list), then street — reduces typos for local campaigns.
        </p>

        <Field label="Country" htmlFor="country">
          <FilterableCountry
            value={address.countryCode}
            onChange={(code, dial) => {
              setAddress((a) => ({
                ...a,
                countryCode: code,
                suburb: code === "AU" ? a.suburb : a.suburb,
                postcode: code === "AU" ? a.postcode : a.postcode,
              }));
              if (dial) {
                setPhone((p) => ({ ...p, countryCallingCode: dial }));
              }
            }}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Postcode"
            htmlFor="postcode"
            hint={
              address.countryCode === "AU"
                ? "Enter postcode to load matching suburbs"
                : "Postal / ZIP code"
            }
          >
            <Input
              id="postcode"
              inputMode="numeric"
              autoComplete="postal-code"
              value={address.postcode}
              onChange={(e) => {
                const postcode = e.target.value.replace(/[^\dA-Za-z -]/g, "").slice(0, 10);
                const locs =
                  address.countryCode === "AU"
                    ? localitiesForPostcode(postcode)
                    : [];
                setAddress((a) => ({
                  ...a,
                  postcode,
                  suburb:
                    locs.length === 1
                      ? locs[0].suburb
                      : locs.some((l) => l.suburb === a.suburb)
                        ? a.suburb
                        : "",
                  stateRegion:
                    locs[0]?.state ??
                    (locs.some((l) => l.suburb === a.suburb)
                      ? a.stateRegion
                      : a.stateRegion),
                }));
              }}
              placeholder={address.countryCode === "AU" ? "2010" : "Postcode"}
            />
          </Field>

          <Field label="Suburb / locality" htmlFor="suburb">
            {address.countryCode === "AU" && auLocalities.length > 0 ? (
              <Select
                id="suburb"
                value={address.suburb}
                onChange={(e) => {
                  const suburb = e.target.value;
                  const hit = auLocalities.find((l) => l.suburb === suburb);
                  setAddress((a) => ({
                    ...a,
                    suburb,
                    stateRegion: hit?.state ?? a.stateRegion,
                  }));
                  setServiceAreas((s) => s || suburb);
                }}
              >
                <option value="">Select suburb</option>
                {auLocalities.map((l) => (
                  <option key={l.suburb} value={l.suburb}>
                    {l.suburb} ({l.state})
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                id="suburb"
                value={address.suburb}
                onChange={(e) =>
                  setAddress((a) => ({ ...a, suburb: e.target.value }))
                }
                placeholder={
                  address.countryCode === "AU"
                    ? "Enter postcode first, or type suburb"
                    : "Suburb or city"
                }
              />
            )}
          </Field>
        </div>

        {address.countryCode === "AU" ? (
          <Field label="State" htmlFor="stateRegion" hint="Filled from postcode when known">
            <Select
              id="stateRegion"
              value={address.stateRegion ?? ""}
              onChange={(e) =>
                setAddress((a) => ({ ...a, stateRegion: e.target.value }))
              }
            >
              <option value="">Select state</option>
              {["NSW", "VIC", "QLD", "WA", "SA", "TAS", "NT", "ACT"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="State / region" htmlFor="stateRegion">
            <Input
              id="stateRegion"
              value={address.stateRegion ?? ""}
              onChange={(e) =>
                setAddress((a) => ({ ...a, stateRegion: e.target.value }))
              }
            />
          </Field>
        )}

        <div className="grid gap-4 sm:grid-cols-[6.5rem_minmax(0,1fr)_10rem]">
          <Field label="Street number" htmlFor="streetNumber">
            <Input
              id="streetNumber"
              value={address.streetNumber}
              onChange={(e) =>
                setAddress((a) => ({ ...a, streetNumber: e.target.value }))
              }
              placeholder="12"
            />
          </Field>
          <Field label="Street name" htmlFor="streetName">
            <Input
              id="streetName"
              value={address.streetName}
              onChange={(e) =>
                setAddress((a) => ({ ...a, streetName: e.target.value }))
              }
              placeholder="Example"
            />
          </Field>
          <Field label="Street type" htmlFor="streetType">
            <Select
              id="streetType"
              value={address.streetType}
              onChange={(e) =>
                setAddress((a) => ({ ...a, streetType: e.target.value }))
              }
            >
              {AU_STREET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label} ({t.value})
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="Unit / building"
          htmlFor="unit"
          hint="Optional — unit, suite, or building name"
        >
          <Input
            id="unit"
            value={address.unit ?? ""}
            onChange={(e) =>
              setAddress((a) => ({ ...a, unit: e.target.value }))
            }
            placeholder="Unit 3 / Level 2"
          />
        </Field>

        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Listing line:{" "}
          <span className="font-medium text-foreground">
            {serializedAddress || "—"}
          </span>
        </p>

        {showServiceAreas ? (
        <Field
          label="Service area"
          htmlFor="serviceAreasVisible"
          hint="Extra suburbs you serve beyond the storefront"
        >
          <Input
            id="serviceAreasVisible"
            value={serviceAreas}
            onChange={(e) => setServiceAreas(e.target.value)}
            placeholder="e.g. Surry Hills, CBD"
          />
        </Field>
        ) : null}
      </div>

      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {showWebsite ? "Phone & website" : "Public phone"}
        </h3>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Field label="Country code" htmlFor="dial">
            <Select
              id="dial"
              value={phone.countryCallingCode}
              onChange={(e) =>
                setPhone((p) => ({ ...p, countryCallingCode: e.target.value }))
              }
            >
              {COUNTRY_OPTIONS.map((c) => (
                <option key={`${c.code}-${c.dial}`} value={c.dial}>
                  +{c.dial} {c.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Phone number"
            htmlFor="nationalNumber"
            hint={
              phone.countryCallingCode === "61"
                ? "Include area code — 02 9000 0000 or 0412 345 678"
                : "Local number without country code"
            }
          >
            <Input
              id="nationalNumber"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              value={phone.nationalNumber}
              onChange={(e) =>
                setPhone((p) => ({
                  ...p,
                  nationalNumber: e.target.value.replace(/[^\d\s]/g, ""),
                }))
              }
              placeholder="02 9000 0000"
            />
          </Field>
        </div>
        <p className="text-xs text-muted-foreground">
          Saved as{" "}
          <span className="font-medium text-foreground">
            {serializedPhone || "—"}
          </span>
        </p>
        {showWebsite ? (
        <Field label="Website" htmlFor="websiteVisible" hint="Full URL including https://">
          <Input
            id="websiteVisible"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://www.example.com.au"
          />
        </Field>
        ) : null}
      </div>

      <div className="space-y-4 border-t border-border pt-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Regular hours
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Same pattern as Google — open/closed per day, then hour, minutes, AM/PM.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={copyMondayToWeekdays}>
            Copy Monday to weekdays
          </Button>
        </div>

        <div className="space-y-3">
          {hours.days.map((d) => (
            <div
              key={d.day}
              className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[7rem_auto_1fr]"
            >
              <p className="text-sm font-medium">{WEEKDAY_LABEL[d.day]}</p>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={d.closed}
                  onChange={(e) => {
                    const closed = e.target.checked;
                    patchDay(d.day, {
                      closed,
                      open: closed
                        ? undefined
                        : d.open ?? { hour: 9, minute: 0, period: "AM" },
                      close: closed
                        ? undefined
                        : d.close ?? { hour: 5, minute: 0, period: "PM" },
                    });
                  }}
                />
                Closed
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <TimeSelects
                  idPrefix={`${d.day}-open`}
                  disabled={d.closed}
                  value={d.open}
                  onChange={(open) => patchDay(d.day, { open, closed: false })}
                />
                <span className="text-xs text-muted-foreground">to</span>
                <TimeSelects
                  idPrefix={`${d.day}-close`}
                  disabled={d.closed}
                  value={d.close}
                  onChange={(close) => patchDay(d.day, { close, closed: false })}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
