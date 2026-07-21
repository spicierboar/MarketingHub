/**
 * Staging / local-only helpers to speed smoke demos.
 * Never import this into production-only paths without gating on `devToolsOpen()`.
 */

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

const TOPICS = [
  "Weekday lunch special for locals",
  "Friday thali deal",
  "Family dinner booking push",
  "Takeaway monsoon menu",
  "Weekend brunch soft launch",
] as const;

const OBJECTIVES = [
  "Fill weekday lunch tables",
  "Drive takeaway orders mid-week",
  "Book Friday dinner covers",
  "Grow Instagram saves from locals",
  "Promote a limited offer without overselling",
] as const;

const IMAGE_PROMPTS = [
  "Warm plated Indian lunch special on a wooden table, soft daylight, no logos",
  "Steaming curry bowls in a cosy restaurant interior, natural colours",
  "Takeaway bags ready at the counter, friendly atmosphere, no readable text",
] as const;

const VIDEO_SCRIPTS = [
  "Hook: Hungry at lunch? Body: Our weekday specials are ready. CTA: Book a table or order takeaway.",
  "Hook: Friday night sorted. Body: Family thali deal this week only. CTA: Reserve now.",
] as const;

const VOICE_SCRIPTS = [
  "Looking for a cosy lunch this week? Our winter specials are on now — book a table or order takeaway.",
  "Friday thali deal is live. Bring the family — reserve online or call ahead.",
] as const;

const CONTENT_TYPES = [
  "social_post",
  "email_newsletter",
  "ad_copy",
  "blog_article",
] as const;

const CHANNELS = ["instagram", "facebook", "email", "linkedin", ""] as const;

const TONES = [
  "brand_default",
  "friendly",
  "professional",
  "short_punchy",
] as const;

export type ContentDemoFill = {
  topic: string;
  objective: string;
  contentType: string;
  channel: string;
  tone: string;
};

export type MediaDemoFill = {
  topic: string;
  prompt: string;
  channel: string;
  format?: string;
};

export type ScriptDemoFill = {
  topic: string;
  script: string;
  channel: string;
};

export function randomContentDemoFill(): ContentDemoFill {
  return {
    topic: pick(TOPICS),
    objective: pick(OBJECTIVES),
    contentType: pick(CONTENT_TYPES),
    channel: pick(CHANNELS),
    tone: pick(TONES),
  };
}

export function randomImageDemoFill(): MediaDemoFill {
  return {
    topic: `Image — ${pick(TOPICS)}`,
    prompt: pick(IMAGE_PROMPTS),
    channel: pick(CHANNELS),
    format: pick(["square", "vertical", "landscape"] as const),
  };
}

export function randomVideoDemoFill(kind: "video" | "reel"): ScriptDemoFill {
  const topic = pick(TOPICS);
  return {
    topic: kind === "reel" ? `Reel — ${topic}` : `Video — ${topic}`,
    script: pick(VIDEO_SCRIPTS),
    channel:
      kind === "reel"
        ? pick(["instagram", "tiktok", "facebook"] as const)
        : pick(CHANNELS),
  };
}

export function randomVoiceDemoFill(): ScriptDemoFill {
  return {
    topic: `Voiceover — ${pick(TOPICS)}`,
    script: pick(VOICE_SCRIPTS),
    channel: "",
  };
}
