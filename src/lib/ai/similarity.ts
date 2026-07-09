// Duplicate-content warning (Phase 5, §47). Jaccard similarity over 4-word
// shingles — cheap, deterministic, good enough to catch near-identical drafts
// within a company before they reach the approval queue.

import { getCompany, listContent } from "@/lib/db";

function shingles(text: string, size = 4): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s$%]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + size <= words.length; i++) {
    out.add(words.slice(i, i + size).join(" "));
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter++;
  return inter / (a.size + b.size - inter);
}

const THRESHOLD = 0.35;

// Returns a human-readable warning when `body` closely duplicates existing
// content for the same company, else undefined. Pass excludeGroupId when
// generating comparison variants — siblings are near-duplicates by design.
export async function duplicateWarning(
  companyId: string,
  body: string,
  opts: { excludeId?: string; excludeGroupId?: string | null } = {},
): Promise<string | undefined> {
  const target = shingles(body);
  if (target.size < 5) return undefined; // too short to judge

  const company = await getCompany(companyId);
  if (!company) return undefined;
  let best: { title: string; score: number } | null = null;
  for (const item of await listContent(company.tenantId)) {
    if (item.companyId !== companyId) continue;
    if (item.id === opts.excludeId) continue;
    if (opts.excludeGroupId && item.variantGroupId === opts.excludeGroupId) continue;
    if (item.status === "rejected" || item.status === "archived") continue;
    const score = jaccard(target, shingles(item.body));
    if (score >= THRESHOLD && (!best || score > best.score)) {
      best = { title: item.title, score };
    }
  }
  return best
    ? `Similar to existing content "${best.title}" (${Math.round(best.score * 100)}% overlap) — check before approving.`
    : undefined;
}
