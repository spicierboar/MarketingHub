import type { ApiKeyScope } from "@/lib/types";

export interface ApiRouteDescriptor {
  method: string;
  path: string;
  scope?: ApiKeyScope;
  description: string;
  auth: "api_key" | "none";
}

export const PUBLIC_API_VERSION = "v1";

export const API_ROUTE_CATALOG: ApiRouteDescriptor[] = [
  { method: "GET", path: "/api/v1", auth: "none", description: "API catalog and version metadata" },
  { method: "GET", path: "/api/v1/companies", scope: "companies:read", auth: "api_key", description: "List companies in the authenticated tenant" },
  { method: "GET", path: "/api/v1/companies/{id}", scope: "companies:read", auth: "api_key", description: "Get one company by id" },
  { method: "GET", path: "/api/v1/content", scope: "content:read", auth: "api_key", description: "List content items (optional companyId filter)" },
  { method: "POST", path: "/api/v1/content", scope: "content:write", auth: "api_key", description: "Create a content item (ai_draft)" },
  { method: "GET", path: "/api/v1/content/{id}", scope: "content:read", auth: "api_key", description: "Get one content item" },
  { method: "PATCH", path: "/api/v1/content/{id}", scope: "content:write", auth: "api_key", description: "Update content title/body/status" },
  { method: "GET", path: "/api/v1/leads", scope: "leads:read", auth: "api_key", description: "List leads (optional companyId filter)" },
  { method: "POST", path: "/api/v1/leads", scope: "leads:write", auth: "api_key", description: "Record a manual lead" },
  { method: "GET", path: "/api/v1/campaigns", scope: "campaigns:read", auth: "api_key", description: "List campaign plans (optional companyId filter)" },
  { method: "GET", path: "/api/v1/campaigns/{id}", scope: "campaigns:read", auth: "api_key", description: "Get one campaign plan by id" },
  { method: "GET", path: "/api/v1/reservations", scope: "reservations:read", auth: "api_key", description: "List table/room reservations (optional companyId filter)" },
  { method: "GET", path: "/api/v1/reservations/{id}", scope: "reservations:read", auth: "api_key", description: "Get one reservation by id" },
  { method: "GET", path: "/api/v1/reviews", scope: "reviews:read", auth: "api_key", description: "List company reviews (optional companyId, status filters)" },
  { method: "GET", path: "/api/v1/reviews/{id}", scope: "reviews:read", auth: "api_key", description: "Get one company review by id" },
];

export function catalogPayload() {
  return {
    version: PUBLIC_API_VERSION,
    versioning: {
      current: PUBLIC_API_VERSION,
      note: "v1 expanded in W7 (M53) with read-only campaigns, reservations, and reviews. Breaking changes will ship as v2.",
      expansion: "2026-07-10",
    },
    authentication: {
      type: "bearer",
      header: "Authorization: Bearer cc_live_…",
      note: "API keys are tenant-scoped; companyIds on the key optionally restrict access.",
    },
    rateLimits: {
      auth: "60 requests/min per API key (public_api_auth)",
      read: "90 requests/min per API key (public_api_read)",
      write: "40 requests/min per API key (public_api_write)",
    },
    routes: API_ROUTE_CATALOG,
  };
}
