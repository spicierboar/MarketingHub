// W7 M55 — continuous learning live gate (optional; default OFF).

export function learningLive(): boolean {
  return process.env.LEARNING_LIVE === "true";
}

export function learningMode(): "live" | "simulated" {
  return learningLive() ? "live" : "simulated";
}
