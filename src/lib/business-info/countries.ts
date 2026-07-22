/** Country + dial-code lists for filterable Business info dropdowns. */

export type CountryOption = {
  code: string;
  name: string;
  dial: string;
};

/** Prioritise AU/NZ; rest alphabetical. */
export const COUNTRY_OPTIONS: readonly CountryOption[] = [
  { code: "AU", name: "Australia", dial: "61" },
  { code: "NZ", name: "New Zealand", dial: "64" },
  { code: "US", name: "United States", dial: "1" },
  { code: "GB", name: "United Kingdom", dial: "44" },
  { code: "SG", name: "Singapore", dial: "65" },
  { code: "IN", name: "India", dial: "91" },
  { code: "IE", name: "Ireland", dial: "353" },
  { code: "CA", name: "Canada", dial: "1" },
  { code: "AE", name: "United Arab Emirates", dial: "971" },
  { code: "JP", name: "Japan", dial: "81" },
  { code: "CN", name: "China", dial: "86" },
  { code: "HK", name: "Hong Kong", dial: "852" },
  { code: "MY", name: "Malaysia", dial: "60" },
  { code: "PH", name: "Philippines", dial: "63" },
  { code: "ID", name: "Indonesia", dial: "62" },
  { code: "TH", name: "Thailand", dial: "66" },
  { code: "VN", name: "Vietnam", dial: "84" },
  { code: "KR", name: "South Korea", dial: "82" },
  { code: "DE", name: "Germany", dial: "49" },
  { code: "FR", name: "France", dial: "33" },
  { code: "IT", name: "Italy", dial: "39" },
  { code: "ES", name: "Spain", dial: "34" },
  { code: "NL", name: "Netherlands", dial: "31" },
  { code: "ZA", name: "South Africa", dial: "27" },
  { code: "FJ", name: "Fiji", dial: "679" },
  { code: "PG", name: "Papua New Guinea", dial: "675" },
] as const;

export function filterCountries(query: string): CountryOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...COUNTRY_OPTIONS];
  return COUNTRY_OPTIONS.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.dial.includes(q.replace(/^\+/, "")),
  );
}

export function countryByCode(code: string): CountryOption | undefined {
  return COUNTRY_OPTIONS.find((c) => c.code === code);
}

export function countryByDial(dial: string): CountryOption | undefined {
  const d = dial.replace(/^\+/, "");
  return COUNTRY_OPTIONS.find((c) => c.dial === d);
}
