// Self-test helpers for V1 recommendations (Module 9).

import {
  createRecommendation,
  getRecommendation,
  listScheduledPosts,
  updateRecommendation,
} from "@/lib/db";
import { detectCalendarGap } from "@/lib/calendar-intelligence";
import { generateForCompany } from "@/lib/ai/recommend";
import {
  dismissReasonOf,
  generateRankedForCompany,
  rankRecommendations,
  withDismissReason,
} from "@/lib/recommendations";
import type { Company } from "@/lib/types";

export function stubRecommendCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_rec_stub",
    tenantId: "tn_rec_stub",
    name: "Riverside Cafe",
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      industry: "cafe",
      serviceAreas: ["Riverside"],
      services: ["Breakfast", "Coffee"],
      callsToAction: ["Order online"],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
      targetCustomers: "local families",
    },
    documents: [],
    ...overrides,
  } as Company;
}

export async function checkRankedTopFive(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany();
  const ranked = await generateRankedForCompany(company);
  const sorted =
    ranked.length < 2 ||
    ranked.every((r, i) => i === 0 || ranked[i - 1].score >= r.score);
  const inRange = ranked.length >= 1 && ranked.length <= 5;
  const explicitScores = ranked.every((r) => r.score > 0 && r.rationale.length > 20);
  const ok = inRange && sorted && explicitScores;
  return {
    ok,
    detail: `count=${ranked.length} top=${ranked[0]?.score ?? 0} types=${ranked.map((r) => r.type).join(",")}`,
  };
}

export async function checkCalendarGapSignal(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany();
  const today = new Date().toISOString().slice(0, 10);
  const posts = await listScheduledPosts(company.tenantId);
  const gap = detectCalendarGap(posts, company.id, today);
  const drafts = await generateForCompany(company);
  const hasType = drafts.some((d) => d.type === "calendar_gap");
  const ranked = rankRecommendations(drafts);
  const inTop = ranked.some((d) => d.type === "calendar_gap");
  const ok = !!gap && hasType && inTop;
  return {
    ok,
    detail: `gap=${gap?.gapDays ?? "none"} scheduled=${gap?.scheduledCount ?? 0} inTop=${inTop}`,
  };
}

export async function checkDismissPersistsReason(): Promise<{ ok: boolean; detail: string }> {
  const company = stubRecommendCompany({ tenantId: "tn_rec_dismiss" });
  const rec = await createRecommendation({
    companyId: company.id,
    type: "content_gap",
    title: "Test gap",
    rationale: "Stub rationale for dismiss persistence check.",
    action: { kind: "content_request", requestType: "social_post", topic: "Test", _score: 72 },
    status: "open",
    createdById: "u_stub",
  });
  const reason = "Not relevant this quarter";
  await updateRecommendation(rec.id, {
    status: "dismissed",
    action: withDismissReason(rec.action, reason),
  });
  const loaded = await getRecommendation(rec.id);
  const persisted = loaded ? dismissReasonOf(loaded) : undefined;
  const ok = loaded?.status === "dismissed" && persisted === reason;
  return {
    ok,
    detail: `status=${loaded?.status} reason=${persisted ?? "missing"}`,
  };
}
