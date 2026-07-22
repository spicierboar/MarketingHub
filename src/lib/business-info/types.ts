/** Structured business location / phone / hours for precise client capture. */

export type CountryCode = string; // ISO 3166-1 alpha-2

export type StructuredBusinessAddress = {
  countryCode: CountryCode;
  postcode: string;
  suburb: string;
  /** AU state / NZ region / etc. */
  stateRegion?: string;
  unit?: string;
  streetNumber: string;
  streetName: string;
  streetType: string;
};

export type StructuredPhone = {
  /** Digits only, no plus — e.g. "61" */
  countryCallingCode: string;
  /** National number as dialled locally, digits + spaces ok */
  nationalNumber: string;
};

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type ClockTime = {
  hour: number; // 1–12
  minute: number; // 0 | 15 | 30 | 45
  period: "AM" | "PM";
};

export type DayHours = {
  day: Weekday;
  closed: boolean;
  open?: ClockTime;
  close?: ClockTime;
};

export type StructuredTradingHours = {
  days: DayHours[];
};

export const WEEKDAYS: readonly Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

export const MINUTE_OPTIONS = [0, 15, 30, 45] as const;
