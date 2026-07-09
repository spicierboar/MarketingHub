// Ad-platform connectors (production drop-in for the delegated paid module).
//
// Two live capabilities sit behind the heaviest external gate — the Google Ads
// API (developer token + access) and the Meta Marketing API (ads_management +
// Business Verification):
//   1. CAMPAIGN EXECUTION — create/pause/adjust campaigns on the client's OWN
//      delegated ad account (decryptToken(adAccount.encryptedToken) → the
//      platform SDK). Their card is billed by the platform; we never front spend.
//   2. LEAD INGESTION — Meta Lead Ads + Google lead-form webhooks POST new
//      leads; we resolve the company from the delegated ad account's external
//      id and createLead() for attribution. Route:
//      POST /api/ads/leads/webhook?platform=meta_ads|google_ads (ADS_LIVE +
//      per-platform signature verification — see src/lib/ad-leads.ts).
//
// Until those approvals land, ADS_LIVE is unset and everything is simulated:
// campaign performance via src/lib/paid.ts (seeded), and leads recorded manually
// by an admin (recordLeadAction). This mirrors publishingLive()/analyticsLive().

export function adsLive(): boolean {
  return process.env.ADS_LIVE === "true";
}
