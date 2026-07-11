// Self-tests for platform improvement wave (campaign pack, chunking, alerts).

import { chunkIds, COMPANY_ID_IN_CHUNK } from "@/lib/db/chunk-ids";
import {
  creditLowAlerts,
  mergeAgencyAlerts,
  reconnectNeededAlerts,
} from "@/lib/agency-ops";
import { verticalPlaybook } from "@/lib/business-profiles";
import { taxInvoiceLetterheadConfigured } from "@/lib/tax-invoices";

export function checkChunkIdsSplitsLargeLists(): { ok: boolean; detail: string } {
  const ids = Array.from({ length: 250 }, (_, i) => `c_${i}`);
  const chunks = chunkIds(ids, COMPANY_ID_IN_CHUNK);
  const ok =
    chunks.length === 3 &&
    chunks[0]!.length === 100 &&
    chunks[1]!.length === 100 &&
    chunks[2]!.length === 50 &&
    chunkIds([]).length === 0;
  return {
    ok,
    detail: `chunks=${chunks.length} sizes=${chunks.map((c) => c.length).join(",")}`,
  };
}

export function checkExceptionDeepLinks(): { ok: boolean; detail: string } {
  const credit = creditLowAlerts([
    {
      companyId: "c1",
      companyName: "Dental",
      balanceUsd: 20,
      minFloorUsd: 50,
    },
  ]);
  const reconnect = reconnectNeededAlerts([
    {
      companyId: "c1",
      companyName: "Dental",
      platform: "Facebook",
      status: "token_expired",
    },
  ]);
  const merged = mergeAgencyAlerts([credit, reconnect], { limit: 5 });
  const ok =
    credit[0]?.href.includes("/ads?company=c1") === true &&
    reconnect[0]?.href.includes("/publishing?company=c1") === true &&
    merged.length === 2;
  return {
    ok,
    detail: `creditHref=${credit[0]?.href} reconnectHref=${reconnect[0]?.href} merged=${merged.length}`,
  };
}

export function checkVerticalPlaybookChannels(): { ok: boolean; detail: string } {
  const pro = verticalPlaybook("professional");
  const ok =
    pro.defaultChannels.includes("Facebook") &&
    pro.defaultChannels.includes("Google Business Profile") &&
    !!pro.postingCadence &&
    !!pro.regulatoryCaution;
  return {
    ok,
    detail: `channels=${pro.defaultChannels.join("|")} cadence=${!!pro.postingCadence}`,
  };
}

export function checkLetterheadHelper(): { ok: boolean; detail: string } {
  // Pure helper — must not throw; configured flag is env-dependent.
  const configured = taxInvoiceLetterheadConfigured();
  return { ok: typeof configured === "boolean", detail: `configured=${configured}` };
}
