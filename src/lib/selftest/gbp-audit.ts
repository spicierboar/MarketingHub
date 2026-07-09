// Self-test helpers for V1 GBP local audit (Module 6).

import {
  buildCanonicalGbp,
  gbpAuditLive,
  runGbpAudit,
  simulateGbpSnapshot,
} from "@/lib/gbp-audit";
import type { Company, PublishingIntegration } from "@/lib/types";

export function stubGbpCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "co_gbp_stub",
    tenantId: "tn_stub",
    name: "Harbour View Dental",
    status: "ai_ready",
    createdBy: "u_stub",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      legalName: "Harbour View Dental Pty Ltd",
      tradingNames: "Harbour View Dental",
      industry: "Dentist",
      website: "https://harbourviewdental.example",
      approvalContact: "03 5550 9876",
      serviceAreas: ["Harbourside", "North Quay"],
      services: ["Check-up & clean", "Teeth whitening"],
      callsToAction: ["Book online"],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
      socialLinks: [
        { platform: "google_business", url: "https://g.page/harbourviewdental" },
      ],
    },
    documents: [],
    ...overrides,
  } as Company;
}

export function stubGbpIntegration(companyId: string): PublishingIntegration {
  const t = new Date().toISOString();
  return {
    id: "int_gbp_stub",
    companyId,
    platform: "Google Business Profile",
    accountName: "accounts/123/locations/456",
    encryptedToken: "iv.tag.cipher",
    tokenLastFour: "4567",
    status: "connected",
    connectedById: "u_stub",
    connectedAt: t,
    updatedAt: t,
  };
}

export async function checkGbpNapConsistency(): Promise<{ ok: boolean; detail: string }> {
  const company = stubGbpCompany();
  const canonical = buildCanonicalGbp(company, {
    companyId: company.id,
    suburbs: ["Harbourside"],
    competitors: [],
    searchTerms: [],
    updatedAt: new Date().toISOString(),
  });
  const snapshot = simulateGbpSnapshot(
    company,
    canonical,
    stubGbpIntegration(company.id),
  );
  const audit = await runGbpAudit({
    company,
    integration: stubGbpIntegration(company.id),
    approvedPhotoCount: 4,
    faqItemCount: 3,
  });
  const nameCheck = audit.checks.find((c) => c.id === "nap_name");
  const ok =
    canonical.businessName === "Harbour View Dental" &&
    snapshot.businessName.length > 0 &&
    !!nameCheck &&
    (nameCheck.status === "pass" || nameCheck.status === "fail");
  return {
    ok,
    detail: `canonical=${canonical.businessName} gbp=${snapshot.businessName} nap=${nameCheck?.status}`,
  };
}

export async function checkGbpSimulatedWhenLiveOff(): Promise<{ ok: boolean; detail: string }> {
  const live = gbpAuditLive();
  const company = stubGbpCompany();
  const audit = await runGbpAudit({
    company,
    integration: stubGbpIntegration(company.id),
  });
  const ok = !live && audit.mode === "simulated" && audit.snapshot.source === "simulated";
  return {
    ok,
    detail: `live=${live} mode=${audit.mode} source=${audit.snapshot.source}`,
  };
}

export async function checkGbpChecklistActionable(): Promise<{ ok: boolean; detail: string }> {
  const incomplete = stubGbpCompany({
    id: "co_gbp_incomplete",
    profile: {
      serviceAreas: [],
      services: [],
      callsToAction: [],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
    },
  });
  const audit = await runGbpAudit({ company: incomplete });
  const actionable = audit.checks.filter(
    (c) => c.fixAction.length > 10 && (c.status === "fail" || c.status === "warn"),
  );
  const connectFail = audit.checks.find((c) => c.id === "connect_gbp")?.status === "fail";
  const ok = audit.checks.length >= 10 && actionable.length >= 3 && connectFail;
  return {
    ok,
    detail: `checks=${audit.checks.length} actionable=${actionable.length} score=${audit.score}`,
  };
}
