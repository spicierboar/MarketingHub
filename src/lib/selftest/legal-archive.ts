import {
  formatLegalDate,
  publicLegalPath,
  splitCurrentAndArchive,
} from "@/lib/legal-display";
import type { TermsVersion } from "@/lib/types";

export function checkLegalVersionArchiveSplit(): { ok: boolean; detail: string } {
  const versions: TermsVersion[] = [
    {
      id: "a",
      kind: "terms",
      version: 2,
      title: "Terms",
      body: "new",
      effectiveDate: "2026-07-14",
      active: true,
      publishedById: "u",
      publishedAt: "2026-07-14T10:00:00.000Z",
    },
    {
      id: "b",
      kind: "terms",
      version: 1,
      title: "Terms",
      body: "old",
      effectiveDate: "2026-07-01",
      active: false,
      publishedById: "u",
      publishedAt: "2026-07-01T10:00:00.000Z",
    },
  ];
  const { current, archive } = splitCurrentAndArchive(versions);
  const dateOk = formatLegalDate("2026-07-14").includes("2026");
  const ok =
    current?.version === 2 &&
    archive.length === 1 &&
    archive[0]!.version === 1 &&
    publicLegalPath("privacy") === "/privacy-policy" &&
    dateOk;
  return {
    ok,
    detail: ok
      ? "current/archive split + legal date + public paths"
      : `current=${current?.version} archive=${archive.map((a) => a.version).join(",")} date=${formatLegalDate("2026-07-14")}`,
  };
}
