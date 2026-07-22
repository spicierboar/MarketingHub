/**
 * AU postcode → suburb/state lookup for Business info.
 * Curated set covering capitals + staging fixture suburbs (not full PAF).
 * Unknown postcodes still allow a typed suburb.
 */

export type AuLocality = { suburb: string; state: string };

/** postcode → localities (a postcode may span multiple suburbs). */
export const AU_POSTCODE_LOCALITIES: Readonly<Record<string, readonly AuLocality[]>> = {
  "0800": [{ suburb: "Darwin City", state: "NT" }],
  "0820": [
    { suburb: "Parap", state: "NT" },
    { suburb: "Fannie Bay", state: "NT" },
    { suburb: "Stuart Park", state: "NT" },
  ],
  "2000": [
    { suburb: "Sydney", state: "NSW" },
    { suburb: "Barangaroo", state: "NSW" },
    { suburb: "Dawes Point", state: "NSW" },
  ],
  "2007": [{ suburb: "Ultimo", state: "NSW" }],
  "2008": [
    { suburb: "Chippendale", state: "NSW" },
    { suburb: "Darlington", state: "NSW" },
  ],
  "2009": [{ suburb: "Pyrmont", state: "NSW" }],
  "2010": [
    { suburb: "Surry Hills", state: "NSW" },
    { suburb: "Darlinghurst", state: "NSW" },
  ],
  "2011": [
    { suburb: "Elizabeth Bay", state: "NSW" },
    { suburb: "Potts Point", state: "NSW" },
    { suburb: "Rushcutters Bay", state: "NSW" },
    { suburb: "Woolloomooloo", state: "NSW" },
  ],
  "2015": [
    { suburb: "Alexandria", state: "NSW" },
    { suburb: "Beaconsfield", state: "NSW" },
    { suburb: "Eveleigh", state: "NSW" },
  ],
  "2016": [{ suburb: "Redfern", state: "NSW" }],
  "2017": [
    { suburb: "Waterloo", state: "NSW" },
    { suburb: "Zetland", state: "NSW" },
  ],
  "2021": [
    { suburb: "Centennial Park", state: "NSW" },
    { suburb: "Moore Park", state: "NSW" },
    { suburb: "Paddington", state: "NSW" },
  ],
  "2022": [
    { suburb: "Bondi Junction", state: "NSW" },
    { suburb: "Queens Park", state: "NSW" },
  ],
  "2037": [
    { suburb: "Forest Lodge", state: "NSW" },
    { suburb: "Glebe", state: "NSW" },
  ],
  "2042": [
    { suburb: "Newtown", state: "NSW" },
    { suburb: "Enmore", state: "NSW" },
  ],
  "2043": [{ suburb: "Erskineville", state: "NSW" }],
  "2044": [
    { suburb: "St Peters", state: "NSW" },
    { suburb: "Sydenham", state: "NSW" },
    { suburb: "Tempe", state: "NSW" },
  ],
  "2050": [
    { suburb: "Camperdown", state: "NSW" },
    { suburb: "Missenden", state: "NSW" },
  ],
  "2060": [
    { suburb: "Lavender Bay", state: "NSW" },
    { suburb: "McMahons Point", state: "NSW" },
    { suburb: "North Sydney", state: "NSW" },
    { suburb: "Waverton", state: "NSW" },
  ],
  "2065": [
    { suburb: "Crows Nest", state: "NSW" },
    { suburb: "Gore Hill", state: "NSW" },
    { suburb: "Greenwich", state: "NSW" },
    { suburb: "Naremburn", state: "NSW" },
    { suburb: "St Leonards", state: "NSW" },
    { suburb: "Wollstonecraft", state: "NSW" },
  ],
  "2204": [
    { suburb: "Marrickville", state: "NSW" },
    { suburb: "Marrickville South", state: "NSW" },
  ],
  "2300": [
    { suburb: "Newcastle", state: "NSW" },
    { suburb: "Cooks Hill", state: "NSW" },
    { suburb: "The Hill", state: "NSW" },
  ],
  "2302": [{ suburb: "Newcastle West", state: "NSW" }],
  "2303": [
    { suburb: "Hamilton", state: "NSW" },
    { suburb: "Hamilton East", state: "NSW" },
    { suburb: "Hamilton South", state: "NSW" },
  ],
  "2320": [
    { suburb: "East Maitland", state: "NSW" },
    { suburb: "Lorn", state: "NSW" },
    { suburb: "Maitland", state: "NSW" },
  ],
  "2500": [
    { suburb: "Coniston", state: "NSW" },
    { suburb: "Gwynneville", state: "NSW" },
    { suburb: "Keiraville", state: "NSW" },
    { suburb: "Mangerton", state: "NSW" },
    { suburb: "Mount Keira", state: "NSW" },
    { suburb: "Mount Saint Thomas", state: "NSW" },
    { suburb: "North Wollongong", state: "NSW" },
    { suburb: "West Wollongong", state: "NSW" },
    { suburb: "Wollongong", state: "NSW" },
  ],
  "2601": [{ suburb: "Canberra", state: "ACT" }],
  "2612": [
    { suburb: "Braddon", state: "ACT" },
    { suburb: "Reid", state: "ACT" },
    { suburb: "Turner", state: "ACT" },
  ],
  "3000": [{ suburb: "Melbourne", state: "VIC" }],
  "3004": [
    { suburb: "Melbourne", state: "VIC" },
    { suburb: "St Kilda Road Melbourne", state: "VIC" },
  ],
  "3051": [
    { suburb: "Hotham Hill", state: "VIC" },
    { suburb: "North Melbourne", state: "VIC" },
  ],
  "3053": [
    { suburb: "Carlton", state: "VIC" },
    { suburb: "Carlton North", state: "VIC" },
  ],
  "3065": [
    { suburb: "Fitzroy", state: "VIC" },
    { suburb: "Fitzroy North", state: "VIC" },
  ],
  "3066": [{ suburb: "Collingwood", state: "VIC" }],
  "3068": [
    { suburb: "Clifton Hill", state: "VIC" },
    { suburb: "Fitzroy North", state: "VIC" },
  ],
  "3121": [
    { suburb: "Burnley", state: "VIC" },
    { suburb: "Cremorne", state: "VIC" },
    { suburb: "Richmond", state: "VIC" },
  ],
  "3141": [
    { suburb: "South Yarra", state: "VIC" },
  ],
  "3182": [
    { suburb: "St Kilda", state: "VIC" },
    { suburb: "St Kilda West", state: "VIC" },
  ],
  "4000": [
    { suburb: "Brisbane City", state: "QLD" },
    { suburb: "Spring Hill", state: "QLD" },
  ],
  "4101": [
    { suburb: "Highgate Hill", state: "QLD" },
    { suburb: "South Brisbane", state: "QLD" },
    { suburb: "West End", state: "QLD" },
  ],
  "4102": [
    { suburb: "Dutton Park", state: "QLD" },
    { suburb: "Woolloongabba", state: "QLD" },
  ],
  "4215": [
    { suburb: "Chirn Park", state: "QLD" },
    { suburb: "Labrador", state: "QLD" },
    { suburb: "Southport", state: "QLD" },
  ],
  "4220": [
    { suburb: "Burleigh Heads", state: "QLD" },
    { suburb: "Burleigh Waters", state: "QLD" },
    { suburb: "Miami", state: "QLD" },
  ],
  "5000": [{ suburb: "Adelaide", state: "SA" }],
  "5067": [
    { suburb: "Beulah Park", state: "SA" },
    { suburb: "Kent Town", state: "SA" },
    { suburb: "Norwood", state: "SA" },
    { suburb: "Rose Park", state: "SA" },
  ],
  "5069": [
    { suburb: "College Park", state: "SA" },
    { suburb: "Hackney", state: "SA" },
    { suburb: "St Peters", state: "SA" },
    { suburb: "Stepney", state: "SA" },
  ],
  "6000": [{ suburb: "Perth", state: "WA" }],
  "6003": [
    { suburb: "Highgate", state: "WA" },
    { suburb: "Northbridge", state: "WA" },
  ],
  "6004": [
    { suburb: "East Perth", state: "WA" },
  ],
  "6005": [
    { suburb: "West Perth", state: "WA" },
  ],
  "7000": [
    { suburb: "Glebe", state: "TAS" },
    { suburb: "Hobart", state: "TAS" },
    { suburb: "Mount Stuart", state: "TAS" },
    { suburb: "North Hobart", state: "TAS" },
    { suburb: "Queens Domain", state: "TAS" },
    { suburb: "West Hobart", state: "TAS" },
  ],
  "7004": [
    { suburb: "Battery Point", state: "TAS" },
    { suburb: "South Hobart", state: "TAS" },
  ],
};

export function localitiesForPostcode(postcode: string): AuLocality[] {
  const key = postcode.trim();
  return [...(AU_POSTCODE_LOCALITIES[key] ?? [])];
}

export function isKnownAuPostcode(postcode: string): boolean {
  return Boolean(AU_POSTCODE_LOCALITIES[postcode.trim()]);
}
