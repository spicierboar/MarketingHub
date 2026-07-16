import type { LegalDocKind, TermsVersion } from "@/lib/types";
import { formatDate } from "@/lib/utils";

/** Calendar / effective dates without UTC day-shift; datetimes use formatDate. */
export function formatLegalDate(iso?: string | null): string {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y!, m! - 1, d!).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return formatDate(iso);
}

export function publicLegalPath(kind: LegalDocKind): string {
  return kind === "privacy" ? "/privacy-policy" : "/terms";
}

export function publicLegalHref(kind: LegalDocKind, version?: number): string {
  const base = publicLegalPath(kind);
  return version != null ? `${base}?v=${version}` : base;
}

export function splitCurrentAndArchive(versions: TermsVersion[]): {
  current: TermsVersion | undefined;
  archive: TermsVersion[];
} {
  const current = versions.find((v) => v.active);
  const archive = versions
    .filter((v) => !v.active)
    .sort((a, b) => b.version - a.version);
  return { current, archive };
}
