// Per-platform publish ceilings (scale pass for ~1600 accounts).
//
// Social platforms cap how many times an ACCOUNT may publish through their API
// in a rolling 24h window — most famously Instagram's content-publishing limit.
// At fleet scale the scheduler must obey these ceilings or the platform starts
// rejecting posts (and repeated rejections risk the app's standing with the
// platform). The queue engine (src/lib/publish-queue.ts) counts each
// integration's published posts over the trailing 24h and DEFERS anything over
// the ceiling — the post simply stays queued and goes out when capacity frees,
// with no failure logged and no retry burned.
//
// Ceilings are per INTEGRATION (one connected account), matched by the same
// lowercase-substring convention the live connectors use (an integration's
// platform is free text like "Facebook", "Instagram", "Google Business
// Profile"). Values are deliberately conservative defaults, not the vendors'
// theoretical maxima — the numbers to revisit when App Review lands:
//   • Instagram Graph content publishing: documented ~25 posts/24h/account.
//   • TikTok Content Posting API: tight per-creator caps while unaudited; 15
//     is a safe production floor.
//   • Facebook Pages: no hard documented daily cap; 90 is a runaway guard.
//   • Google Business Profile: no hard cap; >20 local posts/day is pathological
//     for a local profile, so treat it as a runaway guard too.
//   • Email / anything unrecognised: no platform ceiling (null).

interface CeilingRule {
  match: string; // lowercase substring matched against integration.platform
  per24h: number;
}

// Order matters only where substrings could collide; none do today.
const CEILING_RULES: CeilingRule[] = [
  { match: "instagram", per24h: 25 },
  { match: "tiktok", per24h: 15 },
  { match: "facebook", per24h: 90 },
  { match: "google", per24h: 20 },
];

// The rolling window all ceilings are measured over.
export const CEILING_WINDOW_HOURS = 24;

// Max posts this platform accepts per account per 24h, or null = no ceiling.
export function platformCeiling(platform: string): number | null {
  const p = platform.toLowerCase();
  for (const rule of CEILING_RULES) {
    if (p.includes(rule.match)) return rule.per24h;
  }
  return null;
}
