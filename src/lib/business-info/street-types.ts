/** AU street type abbreviations for precise address capture. */

export const AU_STREET_TYPES = [
  { value: "St", label: "Street" },
  { value: "Rd", label: "Road" },
  { value: "Ave", label: "Avenue" },
  { value: "Dr", label: "Drive" },
  { value: "Ct", label: "Court" },
  { value: "Pl", label: "Place" },
  { value: "Cres", label: "Crescent" },
  { value: "Pde", label: "Parade" },
  { value: "Ln", label: "Lane" },
  { value: "Way", label: "Way" },
  { value: "Blvd", label: "Boulevard" },
  { value: "Tce", label: "Terrace" },
  { value: "Cl", label: "Close" },
  { value: "Cct", label: "Circuit" },
  { value: "Gr", label: "Grove" },
  { value: "Hwy", label: "Highway" },
  { value: "Esp", label: "Esplanade" },
  { value: "Rise", label: "Rise" },
  { value: "Loop", label: "Loop" },
  { value: "Mall", label: "Mall" },
  { value: "Mews", label: "Mews" },
  { value: "Qy", label: "Quay" },
  { value: "Sq", label: "Square" },
  { value: "Trk", label: "Track" },
  { value: "Trl", label: "Trail" },
  { value: "Wk", label: "Walk" },
] as const;

export type AuStreetTypeValue = (typeof AU_STREET_TYPES)[number]["value"];
