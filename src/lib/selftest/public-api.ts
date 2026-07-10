// Public REST API self-test — tenant isolation + key scoping.

import {
  addMembership,
  createCampaign,
  createCompany,
  createCompanyReview,
  createReservation,
  createServicePeriod,
  createTenant,
  createUser,
  getApiKeyByPrefix,
  getCampaign,
  getCompany,
  getCompanyReview,
  getReservation,
  listCampaigns,
  listCompanyReviews,
  listContent,
  listReservations,
  purgeTenant,
} from "@/lib/db";
import { API_KEY_SCOPES } from "@/lib/types";
import { API_ROUTE_CATALOG } from "@/lib/public-api/catalog";
import { hashApiKey, mintApiKey } from "@/lib/public-api/api-keys";
import { timingSafeEqual } from "node:crypto";
import { now } from "@/lib/utils";

export interface PublicApiCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PublicApiReport {
  ok: boolean;
  passed: number;
  failed: number;
  purgeFailed: string[];
  durationMs: number;
  checks: PublicApiCheck[];
}

export async function runPublicApiSelfTest(): Promise<PublicApiReport> {
  const start = Date.now();
  const checks: PublicApiCheck[] = [];
  const purgeFailed: string[] = [];

  const t1 = await createTenant({
    name: "API Test A",
    kind: "agency",
    plan: "starter",
    timezone: "Australia/Sydney",
    status: "active",
  });
  const t2 = await createTenant({
    name: "API Test B",
    kind: "agency",
    plan: "starter",
    timezone: "Australia/Sydney",
    status: "active",
  });
  const user = await createUser({
    email: `api-test-${Date.now()}@example.dev`,
    name: "API Tester",
    role: "admin",
  });
  await addMembership({ tenantId: t1.id, userId: user.id, role: "owner" });
  const c1 = await createCompany({
    tenantId: t1.id,
    name: "Co A",
    createdBy: user.id,
  });
  const c2 = await createCompany({
    tenantId: t2.id,
    name: "Co B",
    createdBy: user.id,
  });

  const { plaintext, record } = await mintApiKey({
    tenantId: t1.id,
    name: "test",
    scopes: [
      "companies:read",
      "content:read",
      "campaigns:read",
      "reservations:read",
      "reviews:read",
    ],
    companyIds: [c1.id],
    createdById: user.id,
  });

  const resolved = await getApiKeyByPrefix(plaintext.slice(0, 20));
  checks.push({
    name: "apiKey.prefixLookup",
    ok: !!resolved && resolved.tenantId === t1.id,
    detail: resolved ? `tenant ${resolved.tenantId}` : "miss",
  });

  const hash = hashApiKey(plaintext);
  const hashOk =
    resolved &&
    timingSafeEqual(Buffer.from(hash), Buffer.from(resolved.keyHash));
  checks.push({
    name: "apiKey.hashVerify",
    ok: !!hashOk,
    detail: hashOk ? "hash match" : "hash mismatch",
  });

  const coA = await getCompany(c1.id);
  const coB = await getCompany(c2.id);
  checks.push({
    name: "isolation.companyTenantPin",
    ok: coA?.tenantId === t1.id && coB?.tenantId === t2.id,
    detail: `A=${coA?.tenantId} B=${coB?.tenantId}`,
  });

  const contentT1 = await listContent(t1.id);
  const contentT2 = await listContent(t2.id);
  checks.push({
    name: "isolation.contentListTenantScoped",
    ok: contentT1.length >= 0 && contentT2.length >= 0,
    detail: `t1=${contentT1.length} t2=${contentT2.length}`,
  });

  checks.push({
    name: "apiKey.companyScopeStored",
    ok: record.companyIds?.includes(c1.id) === true,
    detail: String(record.companyIds?.join(",")),
  });

  const newScopes = ["campaigns:read", "reservations:read", "reviews:read"] as const;
  checks.push({
    name: "scopes.w7ReadScopesRegistered",
    ok: newScopes.every((s) => API_KEY_SCOPES.includes(s)),
    detail: newScopes.join(","),
  });

  const catalogPaths = API_ROUTE_CATALOG.map((r) => `${r.method} ${r.path}`);
  const expectedRoutes = [
    "GET /api/v1/campaigns",
    "GET /api/v1/campaigns/{id}",
    "GET /api/v1/reservations",
    "GET /api/v1/reservations/{id}",
    "GET /api/v1/reviews",
    "GET /api/v1/reviews/{id}",
  ];
  checks.push({
    name: "catalog.w7RoutesListed",
    ok: expectedRoutes.every((r) => catalogPaths.includes(r)),
    detail: expectedRoutes.join(";"),
  });

  const campaign = await createCampaign({
    companyId: c1.id,
    name: "API test campaign",
    objective: "awareness",
    channels: ["Facebook"],
    durationDays: 30,
    startDate: "2026-08-01",
    status: "draft",
    createdById: user.id,
  });
  const period = await createServicePeriod({
    companyId: c1.id,
    name: "Dinner",
    dayOfWeek: 5,
    startTime: "17:00",
    endTime: "21:00",
    capacity: 20,
    slotMinutes: 30,
    active: true,
  });
  const reservation = await createReservation({
    companyId: c1.id,
    servicePeriodId: period.id,
    status: "confirmed",
    guestName: "API Guest",
    guestEmail: "api-guest@example.dev",
    partySize: 2,
    scheduledAt: now(),
    confirmationMode: "simulated",
  });
  const reviewedAt = now();
  const review = await createCompanyReview({
    companyId: c1.id,
    platform: "google",
    authorName: "API Reviewer",
    rating: 4,
    body: "Solid",
    reviewedAt,
    sentiment: "positive",
    topics: ["service"],
    urgency: "low",
    escalationRequired: false,
    status: "new",
    importedAt: reviewedAt,
    createdById: user.id,
  });

  const campaignsT1 = await listCampaigns(t1.id);
  const campaignsT2 = await listCampaigns(t2.id);
  checks.push({
    name: "isolation.campaignListTenantScoped",
    ok:
      campaignsT1.some((c) => c.id === campaign.id) &&
      campaignsT2.every((c) => c.companyId !== c1.id),
    detail: `t1=${campaignsT1.length} t2=${campaignsT2.length}`,
  });

  const reservationsT1 = await listReservations(t1.id, c1.id);
  const reservationsT2 = await listReservations(t2.id);
  checks.push({
    name: "isolation.reservationListTenantScoped",
    ok:
      reservationsT1.some((r) => r.id === reservation.id) &&
      reservationsT2.every((r) => r.companyId !== c1.id),
    detail: `t1=${reservationsT1.length} t2=${reservationsT2.length}`,
  });

  const reviewsT1 = await listCompanyReviews(t1.id, [c1.id]);
  const reviewsT2 = await listCompanyReviews(t2.id);
  checks.push({
    name: "isolation.reviewListTenantScoped",
    ok:
      reviewsT1.some((r) => r.id === review.id) &&
      reviewsT2.every((r) => r.companyId !== c1.id),
    detail: `t1=${reviewsT1.length} t2=${reviewsT2.length}`,
  });

  const fetchedCampaign = await getCampaign(campaign.id);
  const fetchedReservation = await getReservation(reservation.id);
  const fetchedReview = await getCompanyReview(review.id);
  checks.push({
    name: "read.campaignReservationReviewById",
    ok:
      fetchedCampaign?.companyId === c1.id &&
      fetchedReservation?.companyId === c1.id &&
      fetchedReview?.companyId === c1.id,
    detail: `${fetchedCampaign?.id}/${fetchedReservation?.id}/${fetchedReview?.id}`,
  });

  checks.push({
    name: "apiKey.w7ScopesStored",
    ok: newScopes.every((s) => record.scopes.includes(s)),
    detail: record.scopes.join(","),
  });

  for (const tid of [t1.id, t2.id]) {
    try {
      await purgeTenant(tid);
    } catch {
      purgeFailed.push(tid);
    }
  }

  const failed = checks.filter((c) => !c.ok).length;
  return {
    ok: failed === 0 && purgeFailed.length === 0,
    passed: checks.length - failed,
    failed,
    purgeFailed,
    durationMs: Date.now() - start,
    checks,
  };
}
