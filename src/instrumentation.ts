// Next.js instrumentation — runs once on server startup.
//
// Optional LOCAL / self-hosted scheduler heartbeat: with CC_SCHEDULER=1 an
// in-process timer runs the scheduled tick every CC_SCHEDULER_MINUTES (default
// 60). In serverless production use Vercel Cron → /api/cron/tick instead (this
// heartbeat can't run there — the process is ephemeral). No-op unless enabled.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { blockedLiveFlagNames, appEnv } = await import("@/lib/env");
      const blocked = blockedLiveFlagNames();
      if (blocked.length > 0) {
        console.warn(
          `[env] ${blocked.join(", ")} set but soft-blocked (appEnv=${appEnv()}; staging / local demo / localhost APP_ORIGIN). See docs/ENVIRONMENTS.md.`,
        );
      }
    } catch {
      /* ignore — env import must not break boot */
    }
  }

  if (process.env.CC_SCHEDULER !== "1") return;
  if (process.env.NEXT_RUNTIME !== "nodejs") return; // node runtime only

  const { runScheduledTick } = await import("@/lib/scheduler");
  const minutes = Math.max(1, Number(process.env.CC_SCHEDULER_MINUTES) || 60);
  const timer = setInterval(() => {
    void runScheduledTick().catch((err) => {
      console.error("[scheduler] tick failed:", err);
    });
  }, minutes * 60_000);
  timer.unref?.(); // never keep the process alive just for the heartbeat
  console.info(`[scheduler] in-process heartbeat every ${minutes} min (CC_SCHEDULER=1)`);
}
