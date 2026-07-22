/**
 * Staging / local-only helpers to speed smoke demos.
 * Never import this into production-only paths without gating on `devToolsOpen()`.
 *
 * Content fills must be graph-legal recipes (createFor × type × channel × …).
 */

import {
  CREATE_FOR_TO_TYPES,
  channelsForType,
  nextOptions,
  optimiseForForType,
  type AudienceTypeId,
  type ContentTypeId,
  type CreateForId,
  type FunnelStageId,
  type ObjectiveId,
  type OptimiseForId,
  type RecipeChannelId,
  type ToneId,
} from "@/lib/content-recipe";

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

const NOTES = [
  "Keep claims modest — no invented stats.",
  "Mention booking link once; no stacked CTAs.",
  "Local tone; avoid corporate jargon.",
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

/** Curated legal shells — channels/objectives filled via graph at runtime. */
const LEGAL_CONTENT_SHELLS: {
  createFor: CreateForId;
  contentType: ContentTypeId;
  channel: RecipeChannelId;
  funnel: FunnelStageId;
  objective: ObjectiveId;
  audience: AudienceTypeId;
  optimiseFor: OptimiseForId;
  tone: ToneId;
}[] = [
  {
    createFor: "client",
    contentType: "social_post",
    channel: "instagram",
    funnel: "consideration",
    objective: "encourage_bookings",
    audience: "local_public",
    optimiseFor: "engagement",
    tone: "brand_default",
  },
  {
    createFor: "client",
    contentType: "email_newsletter",
    channel: "email",
    funnel: "consideration",
    objective: "nurture",
    audience: "existing_customers",
    optimiseFor: "conversion",
    tone: "friendly",
  },
  {
    createFor: "client",
    contentType: "ad_copy",
    channel: "facebook",
    funnel: "purchase",
    objective: "drive_sales",
    audience: "prospective_customers",
    optimiseFor: "conversion",
    tone: "short_punchy",
  },
  {
    createFor: "client",
    contentType: "landing_page",
    channel: "website_blog_cms",
    funnel: "purchase",
    objective: "generate_leads",
    audience: "prospective_customers",
    optimiseFor: "conversion",
    tone: "professional",
  },
  {
    createFor: "client",
    contentType: "blog_article",
    channel: "website_blog_cms",
    funnel: "awareness",
    objective: "educate",
    audience: "local_public",
    optimiseFor: "seo",
    tone: "professional",
  },
  {
    createFor: "industry",
    contentType: "blog_article",
    channel: "website_blog_cms",
    funnel: "awareness",
    objective: "educate",
    audience: "industry_professionals",
    optimiseFor: "seo",
    tone: "professional",
  },
  {
    createFor: "industry",
    contentType: "social_post",
    channel: "linkedin",
    funnel: "awareness",
    objective: "build_awareness",
    audience: "peers",
    optimiseFor: "engagement",
    tone: "professional",
  },
  {
    createFor: "industry",
    contentType: "seo_meta",
    channel: "website_blog_cms",
    funnel: "awareness",
    objective: "build_awareness",
    audience: "industry_professionals",
    optimiseFor: "seo",
    tone: "professional",
  },
  {
    createFor: "general",
    contentType: "blog_article",
    channel: "website_blog_cms",
    funnel: "awareness",
    objective: "educate",
    audience: "practitioners",
    optimiseFor: "seo",
    tone: "professional",
  },
  {
    createFor: "general",
    contentType: "faq",
    channel: "website_blog_cms",
    funnel: "consideration",
    objective: "educate",
    audience: "marketers",
    optimiseFor: "ai_discovery",
    tone: "friendly",
  },
  {
    createFor: "general",
    contentType: "seo_meta",
    channel: "aeo_geo",
    funnel: "awareness",
    objective: "build_awareness",
    audience: "practitioners",
    optimiseFor: "ai_discovery",
    tone: "professional",
  },
  {
    createFor: "client",
    contentType: "video_script",
    channel: "instagram",
    funnel: "consideration",
    objective: "encourage_bookings",
    audience: "local_public",
    optimiseFor: "engagement",
    tone: "short_punchy",
  },
  {
    createFor: "client",
    contentType: "faq",
    channel: "email",
    funnel: "consideration",
    objective: "educate",
    audience: "existing_customers",
    optimiseFor: "trust",
    tone: "friendly",
  },
  {
    createFor: "industry",
    contentType: "email_newsletter",
    channel: "email",
    funnel: "retention",
    objective: "nurture",
    audience: "industry_professionals",
    optimiseFor: "conversion",
    tone: "professional",
  },
  {
    createFor: "client",
    contentType: "website_copy",
    channel: "website_blog_cms",
    funnel: "consideration",
    objective: "generate_leads",
    audience: "prospective_customers",
    optimiseFor: "seo",
    tone: "brand_default",
  },
];

function assertShellLegal(shell: (typeof LEGAL_CONTENT_SHELLS)[number]): boolean {
  if (!CREATE_FOR_TO_TYPES[shell.createFor].includes(shell.contentType)) {
    return false;
  }
  if (!channelsForType(shell.contentType).includes(shell.channel)) return false;
  const opts = nextOptions({
    createFor: shell.createFor,
    contentType: shell.contentType,
    channels: [shell.channel],
    funnelStage: shell.funnel,
  });
  if (!opts.objectives.includes(shell.objective)) return false;
  if (!opts.audienceTypes.includes(shell.audience)) return false;
  const optFor = optimiseForForType(shell.contentType, [shell.channel]);
  if (!optFor.includes(shell.optimiseFor)) return false;
  return true;
}

const LEGAL_BY_SCOPE: Record<CreateForId, typeof LEGAL_CONTENT_SHELLS> = {
  client: LEGAL_CONTENT_SHELLS.filter(
    (s) => s.createFor === "client" && assertShellLegal(s),
  ),
  industry: LEGAL_CONTENT_SHELLS.filter(
    (s) => s.createFor === "industry" && assertShellLegal(s),
  ),
  general: LEGAL_CONTENT_SHELLS.filter(
    (s) => s.createFor === "general" && assertShellLegal(s),
  ),
};

export type ContentDemoFill = {
  topic: string;
  objective: string;
  contentType: string;
  channel: string;
  tone: string;
  funnel: string;
  audience: string;
  optimiseFor: string;
  notes: string;
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

/**
 * Pick a graph-legal content recipe for the current Create for.
 * Staging / local demos only — never random illegal axis mixes.
 */
export function randomContentDemoFill(
  createFor: CreateForId = "client",
): ContentDemoFill {
  const pool = LEGAL_BY_SCOPE[createFor];
  const shell = pool.length > 0 ? pick(pool) : LEGAL_BY_SCOPE.client[0]!;
  return {
    topic: pick(TOPICS),
    notes: pick(NOTES),
    objective: shell.objective,
    contentType: shell.contentType,
    channel: shell.channel,
    tone: shell.tone,
    funnel: shell.funnel,
    audience: shell.audience,
    optimiseFor: shell.optimiseFor,
  };
}

export function randomImageDemoFill(): MediaDemoFill {
  return {
    topic: `Image — ${pick(TOPICS)}`,
    prompt: pick(IMAGE_PROMPTS),
    // Match CONTENT_PLATFORM_OPTIONS values used by image/video modals (not recipe ids).
    channel: pick(["Instagram", "Facebook", ""] as const),
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
        : pick(["Instagram", "Facebook", ""] as const),
  };
}

export function randomVoiceDemoFill(): ScriptDemoFill {
  return {
    topic: `Voiceover — ${pick(TOPICS)}`,
    script: pick(VOICE_SCRIPTS),
    channel: "",
  };
}
