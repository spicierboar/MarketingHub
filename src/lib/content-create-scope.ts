// Create scopes for /content hub: client · industry · general.
// Industry/general attach to a hidden tenant "content library shelf" company
// (profile.contentLibraryShelf) so existing company-scoped content + DAM rows
// stay valid without a schema change. Tags in sourcesUsed drive Library labels.

import {
  createCompany,
  getCompany,
  listCompanies,
  updateCompany,
} from "@/lib/db";
import { isAdmin, type ActingUser } from "@/lib/auth/rbac";
import { industryLabel } from "@/lib/onboarding-industries";
import { promoIndustryOptions } from "@/lib/promo-catalog";
import type { Company, ContentItem, Tenant } from "@/lib/types";

export type ContentCreateScope = "client" | "industry" | "general";

export const CREATE_SCOPE_TAG_PREFIX = "create_scope:";

export function isContentLibraryShelf(company: Pick<Company, "profile">): boolean {
  return company.profile.contentLibraryShelf === true;
}

/** Client companies only — excludes the internal content library shelf. */
export function clientCompaniesOnly(companies: Company[]): Company[] {
  return companies.filter((c) => !isContentLibraryShelf(c));
}

export function createScopeTag(
  scope: ContentCreateScope,
  industryId?: string,
): string {
  if (scope === "industry" && industryId) {
    return `${CREATE_SCOPE_TAG_PREFIX}industry:${industryId}`;
  }
  if (scope === "general") return `${CREATE_SCOPE_TAG_PREFIX}general`;
  return `${CREATE_SCOPE_TAG_PREFIX}client`;
}

export function parseCreateScopeTag(
  sourcesUsed: string[] | undefined,
): { scope: ContentCreateScope; industryId?: string } | null {
  const tag = sourcesUsed?.find((s) => s.startsWith(CREATE_SCOPE_TAG_PREFIX));
  if (!tag) return null;
  const rest = tag.slice(CREATE_SCOPE_TAG_PREFIX.length);
  if (rest === "general") return { scope: "general" };
  if (rest === "client") return { scope: "client" };
  if (rest.startsWith("industry:")) {
    return { scope: "industry", industryId: rest.slice("industry:".length) };
  }
  return null;
}

export function libraryScopeLabel(
  content: Pick<ContentItem, "sourcesUsed" | "companyId">,
  companyNameById: Map<string, string | undefined>,
  customIndustries?: Tenant["promoIndustries"],
): string {
  const parsed = parseCreateScopeTag(content.sourcesUsed);
  if (parsed?.scope === "general") return "General";
  if (parsed?.scope === "industry" && parsed.industryId) {
    const fromCatalog = promoIndustryOptions(customIndustries).find(
      (o) => o.id === parsed.industryId,
    )?.label;
    return (
      fromCatalog ??
      industryLabel(parsed.industryId) ??
      parsed.industryId
    );
  }
  return companyNameById.get(content.companyId) ?? "Client";
}

/** Ensure one ai_ready shelf company per tenant (admins only create). */
export async function ensureContentLibraryShelf(
  user: ActingUser,
): Promise<Company> {
  if (!isAdmin(user)) {
    throw new Error("Industry and general create require an agency admin.");
  }
  const existing = (await listCompanies(user.tenantId)).find(isContentLibraryShelf);
  if (existing) {
    if (existing.status !== "ai_ready" && existing.status !== "approved") {
      await updateCompany(existing.id, { status: "ai_ready" });
      return (await getCompany(existing.id)) ?? existing;
    }
    return existing;
  }

  const created = await createCompany({
    tenantId: user.tenantId,
    name: "Agency content library",
    createdBy: user.id,
  });
  await updateCompany(created.id, {
    status: "ai_ready",
    profile: {
      ...created.profile,
      contentLibraryShelf: true,
      brandVoice:
        "Clear, professional agency voice suitable for reusable templates and general marketing.",
      natureOfBusiness: "Internal agency content library (not a client workspace).",
      prohibitedClaims: [
        ...created.profile.prohibitedClaims,
        "guarantee",
        "guaranteed",
      ],
    },
  });
  return (await getCompany(created.id)) ?? created;
}

export type ResolvedCreateTarget = {
  company: Company;
  /** Company passed into AI generators (industry/general may be profile-flavoured). */
  generationCompany: Company;
  scope: ContentCreateScope;
  industryId?: string;
  industryLabel?: string;
  scopeTag: string;
  displayLabel: string;
};

function text(fd: FormData, key: string): string {
  return String(fd.get(key) || "").trim();
}

/**
 * Resolve Create form scope → company + AI grounding.
 * Client: requires AI-ready client companyId.
 * Industry / general: tenant shelf (admin); not blocked when Clients is empty.
 */
export async function resolveContentCreateTarget(
  formData: FormData,
  user: ActingUser,
  opts: {
    assertCompanyAccess: (companyId: string) => Promise<ActingUser>;
    getCompany: (id: string) => Promise<Company | undefined>;
  },
): Promise<ResolvedCreateTarget> {
  const raw = text(formData, "createScope") || "client";
  const scope: ContentCreateScope =
    raw === "industry" || raw === "general" || raw === "client" ? raw : "client";

  if (scope === "client") {
    const companyId = text(formData, "companyId");
    if (!companyId) throw new Error("Select a client.");
    await opts.assertCompanyAccess(companyId);
    const company = await opts.getCompany(companyId);
    if (!company) throw new Error("Company not found");
    if (isContentLibraryShelf(company)) {
      throw new Error("Pick a client, or switch Create to Industry / General.");
    }
    if (company.status !== "ai_ready" && company.status !== "approved") {
      throw new Error("Company is not AI-ready. Complete onboarding first.");
    }
    return {
      company,
      generationCompany: company,
      scope: "client",
      scopeTag: createScopeTag("client"),
      displayLabel: company.name,
    };
  }

  const shelf = await ensureContentLibraryShelf(user);
  if (scope === "general") {
    const generationCompany: Company = {
      ...shelf,
      name: "General",
      profile: {
        ...shelf.profile,
        industry: undefined,
        natureOfBusiness: "General marketing content (no client or industry).",
        brandVoice:
          shelf.profile.brandVoice ||
          "Clear, professional, reusable general marketing voice.",
      },
    };
    return {
      company: shelf,
      generationCompany,
      scope: "general",
      scopeTag: createScopeTag("general"),
      displayLabel: "General",
    };
  }

  const industryId = text(formData, "industryId");
  if (!industryId) throw new Error("Select an industry.");
  const label =
    industryLabel(industryId) ??
    promoIndustryOptions().find((o) => o.id === industryId)?.label ??
    industryId;
  const generationCompany: Company = {
    ...shelf,
    name: `${label} (industry)`,
    profile: {
      ...shelf.profile,
      industry: industryId,
      natureOfBusiness: `${label} industry template content.`,
      brandVoice:
        shelf.profile.brandVoice ||
        `Professional voice for ${label} marketing templates.`,
    },
  };
  return {
    company: shelf,
    generationCompany,
    scope: "industry",
    industryId,
    industryLabel: label,
    scopeTag: createScopeTag("industry", industryId),
    displayLabel: label,
  };
}
