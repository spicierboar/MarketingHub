// W5 M43 — Campaign builder live gate. Simulated when CAMPAIGN_BUILDER_LIVE is off
// (default). Claude path still runs when ANTHROPIC_API_KEY is set regardless of
// this gate; the gate controls whether builder runs are marked "live" vs simulated.

export function campaignBuilderLive(): boolean {
  return process.env.CAMPAIGN_BUILDER_LIVE === "true";
}

export function campaignBuilderConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export function campaignBuilderMode(): "live" | "simulated" {
  return campaignBuilderLive() && campaignBuilderConfigured() ? "live" : "simulated";
}
