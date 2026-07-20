export const SUPABASE_PAGE_SIZE = 500;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Exhaust a PostgREST range query. Supabase projects commonly cap responses at
 * 1,000 rows, so every portfolio-wide read must page until a short batch.
 */
export async function collectAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  label: string,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

/** Exhaust every independent chunk query, including every page per chunk. */
export async function collectAllChunkPages<T, TChunk>(
  chunks: readonly TChunk[],
  fetchPage: (
    chunk: TChunk,
    from: number,
    to: number,
  ) => PromiseLike<PageResult<T>>,
  label: string,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const parts = await Promise.all(
    chunks.map((chunk) =>
      collectAllPages(
        (from, to) => fetchPage(chunk, from, to),
        label,
        pageSize,
      ),
    ),
  );
  return parts.flat();
}

export function dedupeById<T extends Record<string, unknown>>(rows: T[]): T[] {
  return [...new Map(rows.map((row) => [String(row["id"]), row])).values()];
}
