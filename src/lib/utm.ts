// UTM link builder (Phase 8, §42). Constructs a trackable URL so every
// published link is attributable by source / medium / campaign / content type
// / request id.

import type { UtmLink } from "@/lib/types";

export function buildUtmUrl(
  link: Pick<
    UtmLink,
    "destinationUrl" | "source" | "medium" | "campaign" | "contentType" | "requestId"
  >,
): string {
  let base: URL;
  try {
    base = new URL(link.destinationUrl);
  } catch {
    return link.destinationUrl; // leave malformed URLs untouched
  }
  const params = base.searchParams;
  const set = (k: string, v?: string | null) => {
    const val = (v ?? "").trim();
    if (val) params.set(k, val.toLowerCase().replace(/\s+/g, "-"));
  };
  set("utm_source", link.source);
  set("utm_medium", link.medium);
  set("utm_campaign", link.campaign);
  set("utm_content", link.contentType);
  if (link.requestId) params.set("utm_term", link.requestId);
  return base.toString();
}
