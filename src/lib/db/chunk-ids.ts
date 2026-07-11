/** PostgREST URL length guard — fan out `.in()` across id chunks. */
export const COMPANY_ID_IN_CHUNK = 100;

export function chunkIds<T>(ids: T[], size = COMPANY_ID_IN_CHUNK): T[][] {
  if (ids.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}
