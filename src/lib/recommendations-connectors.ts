// W5 M41 — recommendations live gate (simulated when RECOMMENDATIONS_LIVE is off).

export function recommendationsLive(): boolean {
  return process.env.RECOMMENDATIONS_LIVE === "true";
}

export function recommendationsMode(): "live" | "simulated" {
  return recommendationsLive() ? "live" : "simulated";
}
