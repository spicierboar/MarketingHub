/**
 * Public http(s) reachability probes — catch typing errors on websites / social URLs.
 * SSRF-safe via enrichment URL guards. Soft DNS/HTTP failures return structured errors.
 */

import {
  assertPublicHttpDestination,
  assertSafeEnrichmentUrl,
  normaliseHttpUrl,
} from "@/lib/auto-onboarding";
import type { SocialLink } from "@/lib/types";

export type UrlReachabilityResult =
  | {
      ok: true;
      url: string;
      status: number;
      finalUrl: string;
    }
  | {
      ok: false;
      url: string;
      code: "invalid_url" | "unreachable" | "blocked_host" | "http_error";
      error: string;
    };

const SOCIAL_HOSTS: Record<string, RegExp> = {
  facebook: /(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/i,
  instagram: /(^|\.)instagram\.com$/i,
  linkedin: /(^|\.)linkedin\.com$/i,
  tiktok: /(^|\.)tiktok\.com$/i,
  youtube: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i,
  x: /(^|\.)x\.com$|(^|\.)twitter\.com$/i,
  google_business: /(^|\.)google\.com$|(^|\.)maps\.app\.goo\.gl$/i,
};

/**
 * HEAD then GET fallback. Treats 2xx–3xx as reachable; 401/403 as “exists but gated”
 * (still counts as a real host — not a typo). 404/5xx/network = fail.
 */
export async function probePublicHttpUrl(
  raw: string,
  opts?: { timeoutMs?: number },
): Promise<UrlReachabilityResult> {
  const normalised = normaliseHttpUrl(raw);
  if (!normalised) {
    return {
      ok: false,
      url: raw.trim(),
      code: "invalid_url",
      error: "Enter a valid website URL (e.g. example.com or https://example.com).",
    };
  }

  let url: URL;
  try {
    url = assertSafeEnrichmentUrl(normalised);
  } catch {
    return {
      ok: false,
      url: normalised,
      code: "blocked_host",
      error: "That URL cannot be checked — use a public http(s) website.",
    };
  }

  try {
    await assertPublicHttpDestination(url);
  } catch {
    return {
      ok: false,
      url: normalised,
      code: "blocked_host",
      error: "That host does not resolve to a public address — check for typos.",
    };
  }

  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let current = url;
    for (let hop = 0; hop <= 5; hop++) {
      await assertPublicHttpDestination(current);
      let res: Response;
      try {
        res = await fetch(current.toString(), {
          method: "HEAD",
          signal: controller.signal,
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; MarketingCommandCentre/1.0; URL-check)",
            Accept: "*/*",
          },
        });
      } catch {
        res = await fetch(current.toString(), {
          method: "GET",
          signal: controller.signal,
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; MarketingCommandCentre/1.0; URL-check)",
            Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          },
        });
      }

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        await res.body?.cancel();
        if (!location) {
          return {
            ok: false,
            url: normalised,
            code: "http_error",
            error: `Website redirected (${res.status}) without a location — check the URL.`,
          };
        }
        current = assertSafeEnrichmentUrl(new URL(location, current).toString());
        continue;
      }

      await res.body?.cancel();

      // Exists but login-walled — still a real page (not a typo).
      if (res.status === 401 || res.status === 403) {
        return {
          ok: true,
          url: normalised,
          status: res.status,
          finalUrl: current.toString(),
        };
      }

      if (res.status >= 200 && res.status < 400) {
        return {
          ok: true,
          url: normalised,
          status: res.status,
          finalUrl: current.toString(),
        };
      }

      if (res.status === 404 || res.status === 410) {
        return {
          ok: false,
          url: normalised,
          code: "http_error",
          error: `That page was not found (${res.status}) — check for a typo in the URL.`,
        };
      }

      return {
        ok: false,
        url: normalised,
        code: "http_error",
        error: `Website returned HTTP ${res.status} — check the address and try again.`,
      };
    }

    return {
      ok: false,
      url: normalised,
      code: "unreachable",
      error: "Too many redirects — check the website address.",
    };
  } catch {
    return {
      ok: false,
      url: normalised,
      code: "unreachable",
      error:
        "Could not reach that website — check for typos (or that the site is online).",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Require a reachable public website when a URL is provided. */
export async function assertWebsiteReachable(raw: string): Promise<string> {
  const result = await probePublicHttpUrl(raw);
  if (!result.ok) throw new Error(result.error);
  return result.finalUrl || result.url;
}

function hostMatchesPlatform(platform: string, hostname: string): boolean {
  const re = SOCIAL_HOSTS[platform];
  if (!re) return true;
  return re.test(hostname.replace(/^www\./i, ""));
}

/**
 * Normalise handle-or-URL for a platform, then probe that the profile URL responds.
 */
export async function assertSocialAccountReachable(
  link: SocialLink,
): Promise<SocialLink> {
  const platform = link.platform.trim().toLowerCase();
  let raw = link.url.trim();
  if (!raw) {
    throw new Error(`Add a URL or @handle for ${platform}.`);
  }

  // Bare @handle → platform profile URL
  if (raw.startsWith("@") || (!raw.includes(".") && !raw.includes("/"))) {
    const handle = raw.replace(/^@/, "").trim();
    if (!handle) throw new Error(`Add a valid ${platform} handle.`);
    const templates: Record<string, string> = {
      instagram: `https://www.instagram.com/${handle}/`,
      facebook: `https://www.facebook.com/${handle}`,
      linkedin: `https://www.linkedin.com/in/${handle}`,
      tiktok: `https://www.tiktok.com/@${handle}`,
      x: `https://x.com/${handle}`,
      twitter: `https://x.com/${handle}`,
      youtube: `https://www.youtube.com/@${handle}`,
    };
    const built = templates[platform];
    if (!built) {
      throw new Error(
        `Enter a full profile URL for ${platform} (handles are supported for Instagram, Facebook, LinkedIn, TikTok, X, YouTube).`,
      );
    }
    raw = built;
  }

  const normalised = normaliseHttpUrl(raw);
  if (!normalised) {
    throw new Error(`Enter a valid ${platform} profile URL.`);
  }

  let host: string;
  try {
    host = assertSafeEnrichmentUrl(normalised).hostname.toLowerCase();
  } catch {
    throw new Error(`That ${platform} URL is not allowed — use a public profile link.`);
  }

  if (!hostMatchesPlatform(platform === "twitter" ? "x" : platform, host)) {
    throw new Error(
      `That URL does not look like a ${platform} profile — check the link.`,
    );
  }

  const probe = await probePublicHttpUrl(normalised);
  if (!probe.ok) {
    throw new Error(
      `${platform} profile check failed: ${probe.error.replace(/^Could not reach that website/, "Could not reach that profile")}`,
    );
  }

  return { platform: link.platform, url: probe.finalUrl || probe.url };
}

export async function assertSocialLinksReachable(
  links: SocialLink[],
): Promise<SocialLink[]> {
  const out: SocialLink[] = [];
  for (const link of links) {
    if (!link.url?.trim()) continue;
    out.push(await assertSocialAccountReachable(link));
  }
  return out;
}
