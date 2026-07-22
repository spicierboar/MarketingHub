"use client";

import { useEffect, useMemo } from "react";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { nextOptions } from "@/lib/content-recipe/options";
import type {
  AudienceTypeId,
  ContentTypeId,
  CreateForId,
  FunnelStageId,
  ObjectiveId,
  OptimiseForId,
  RecipeChannelId,
  ToneId,
} from "@/lib/content-recipe/types";

/** Investor-facing labels (local until content-recipe exports labels). */
export const CONTENT_TYPE_LABELS: Record<ContentTypeId, string> = {
  social_post: "Social media post",
  blog_article: "Blog article",
  email_newsletter: "Email newsletter",
  website_copy: "Website page copy",
  landing_page: "Landing page copy",
  ad_copy: "Ad copy",
  video_script: "Video script",
  brochure_copy: "Brochure copy",
  faq: "FAQ section",
  seo_meta: "SEO meta",
  proposal: "Proposal",
};

export const CHANNEL_LABELS: Record<RecipeChannelId, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube_shorts: "YouTube Shorts",
  linkedin: "LinkedIn",
  google_business_profile: "Google Business Profile",
  website_blog_cms: "Website / blog",
  email: "Email",
  paid_media: "Paid media",
  aeo_geo: "AI / answer discovery",
};

export const FUNNEL_LABELS: Record<FunnelStageId, string> = {
  awareness: "Awareness",
  consideration: "Consideration",
  purchase: "Purchase",
  retention: "Retention",
  advocacy: "Advocacy",
};

export const OBJECTIVE_LABELS: Record<ObjectiveId, string> = {
  build_awareness: "Build awareness",
  educate: "Educate",
  generate_leads: "Generate leads",
  encourage_bookings: "Encourage bookings",
  drive_sales: "Drive sales",
  nurture: "Nurture",
  retain: "Retain customers",
  referrals: "Drive referrals",
  recruit_employees: "Recruit employees",
};

export const AUDIENCE_LABELS: Record<AudienceTypeId, string> = {
  existing_customers: "Existing customers",
  prospective_customers: "Prospective customers",
  local_public: "Local public",
  partners: "Partners",
  industry_professionals: "Industry professionals",
  peers: "Peers",
  press: "Press",
  practitioners: "Practitioners",
  marketers: "Marketers",
  employees: "Employees",
};

export const OPTIMISE_LABELS: Record<OptimiseForId, string> = {
  engagement: "Engagement",
  conversion: "Conversion",
  seo: "SEO",
  trust: "Trust / authority",
  ai_discovery: "AI discovery",
  aeo: "AEO (answer engines)",
  geo: "GEO (generative engines)",
  llmo: "LLMO (LLM optimisation)",
};

export const TONE_LABELS: Record<ToneId, string> = {
  brand_default: "Brand voice",
  friendly: "Friendly",
  professional: "Professional",
  urgent: "Urgent",
  short_punchy: "Short & punchy",
};

export type RecipeComposerValues = {
  contentType: ContentTypeId | "";
  channel: RecipeChannelId | "";
  funnel: FunnelStageId | "";
  objective: ObjectiveId | "";
  audience: AudienceTypeId | "";
  optimiseFor: OptimiseForId | "";
  tone: ToneId;
  topic: string;
  notes: string;
};

export const EMPTY_RECIPE_VALUES: RecipeComposerValues = {
  contentType: "",
  channel: "",
  funnel: "consideration",
  objective: "",
  audience: "",
  optimiseFor: "",
  tone: "brand_default",
  topic: "",
  notes: "",
};

function pickIfAllowed<T extends string>(
  current: T | "",
  allowed: readonly T[],
): T | "" {
  if (!current) return "";
  return allowed.includes(current) ? current : "";
}

/** Clamp composer values to the legal graph for the current createFor. */
export function clampRecipeValues(
  createFor: CreateForId,
  values: RecipeComposerValues,
): RecipeComposerValues {
  const base = nextOptions({ createFor });
  const contentType = pickIfAllowed(values.contentType, base.contentTypes);
  const withType = nextOptions({
    createFor,
    contentType: contentType || undefined,
  });
  const channel = pickIfAllowed(values.channel, withType.channels);
  const funnel =
    pickIfAllowed(values.funnel, withType.funnelStages) || "consideration";
  const withFunnel = nextOptions({
    createFor,
    contentType: contentType || undefined,
    channels: channel ? [channel] : undefined,
    funnelStage: funnel,
  });
  const objective = pickIfAllowed(values.objective, withFunnel.objectives);
  const audience = pickIfAllowed(values.audience, withFunnel.audienceTypes);
  const optimiseFor = pickIfAllowed(values.optimiseFor, withFunnel.optimiseFor);
  const tone =
    pickIfAllowed(values.tone, withFunnel.tones) || ("brand_default" as ToneId);

  return {
    ...values,
    contentType,
    channel,
    funnel,
    objective,
    audience,
    optimiseFor,
    tone,
  };
}

export function recipeComposerReady(values: RecipeComposerValues): boolean {
  return Boolean(
    values.contentType &&
      values.channel &&
      values.funnel &&
      values.objective &&
      values.topic.trim(),
  );
}

export function ContentRecipeComposer({
  createFor,
  values,
  onChange,
}: {
  createFor: CreateForId;
  values: RecipeComposerValues;
  onChange: (next: RecipeComposerValues) => void;
}) {
  const clamped = useMemo(
    () => clampRecipeValues(createFor, values),
    [createFor, values],
  );

  const opts = useMemo(
    () =>
      nextOptions({
        createFor,
        contentType: clamped.contentType || undefined,
        channels: clamped.channel ? [clamped.channel] : undefined,
        primaryChannel: clamped.channel || undefined,
        funnelStage: clamped.funnel || undefined,
        optimiseFor: clamped.optimiseFor ? [clamped.optimiseFor] : undefined,
      }),
    [createFor, clamped],
  );

  // Write clamped values back when upstream axes invalidate a selection.
  useEffect(() => {
    if (
      clamped.contentType !== values.contentType ||
      clamped.channel !== values.channel ||
      clamped.funnel !== values.funnel ||
      clamped.objective !== values.objective ||
      clamped.audience !== values.audience ||
      clamped.optimiseFor !== values.optimiseFor ||
      clamped.tone !== values.tone
    ) {
      onChange(clamped);
    }
  }, [clamped, onChange, values]);

  const typeBlocked = opts.contentTypes.length === 0;
  const channelBlocked =
    Boolean(clamped.contentType) && opts.channels.length === 0;
  const emptyHint =
    opts.emptyReason ||
    (typeBlocked
      ? "No content types for this Create for — switch Client, Industry, or General."
      : channelBlocked
        ? "No channels for this type — change type or channel."
        : undefined);

  function setField<K extends keyof RecipeComposerValues>(
    key: K,
    value: RecipeComposerValues[K],
  ) {
    const next = { ...values, [key]: value };
    if (key === "contentType") {
      next.channel = "";
      next.optimiseFor = "";
      next.objective = "";
    }
    if (key === "channel") {
      next.optimiseFor = "";
    }
    if (key === "funnel") {
      next.objective = "";
    }
    onChange(clampRecipeValues(createFor, next));
  }

  return (
    <div className="space-y-4">
      {emptyHint ? (
        <p
          className="rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
          role="status"
        >
          {emptyHint}
        </p>
      ) : null}

      <Field label="Content type" htmlFor="hub-content-type">
        <Select
          id="hub-content-type"
          name="contentType"
          required
          value={clamped.contentType}
          onChange={(e) =>
            setField("contentType", e.target.value as ContentTypeId | "")
          }
          disabled={typeBlocked}
        >
          <option value="" disabled>
            Select type…
          </option>
          {opts.contentTypes.map((id) => (
            <option key={id} value={id}>
              {CONTENT_TYPE_LABELS[id]}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Channel"
        htmlFor="hub-content-channel"
        hint="Primary channel for length and format defaults"
      >
        <Select
          id="hub-content-channel"
          name="channel"
          required
          value={clamped.channel}
          onChange={(e) =>
            setField("channel", e.target.value as RecipeChannelId | "")
          }
          disabled={!clamped.contentType || channelBlocked}
        >
          <option value="" disabled>
            Select channel…
          </option>
          {opts.channels.map((id) => (
            <option key={id} value={id}>
              {CHANNEL_LABELS[id]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Funnel stage"
          htmlFor="hub-content-funnel"
          hint="Pairs with objective"
        >
          <Select
            id="hub-content-funnel"
            name="funnelStage"
            value={clamped.funnel}
            onChange={(e) =>
              setField("funnel", e.target.value as FunnelStageId | "")
            }
          >
            {opts.funnelStages.map((id) => (
              <option key={id} value={id}>
                {FUNNEL_LABELS[id]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Objective" htmlFor="hub-content-objective">
          <Select
            id="hub-content-objective"
            name="objective"
            required
            value={clamped.objective}
            onChange={(e) =>
              setField("objective", e.target.value as ObjectiveId | "")
            }
            disabled={!clamped.funnel || opts.objectives.length === 0}
          >
            <option value="" disabled>
              Select objective…
            </option>
            {opts.objectives.map((id) => (
              <option key={id} value={id}>
                {OBJECTIVE_LABELS[id]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Audience (optional)" htmlFor="hub-content-audience">
          <Select
            id="hub-content-audience"
            name="audience"
            value={clamped.audience}
            onChange={(e) =>
              setField("audience", e.target.value as AudienceTypeId | "")
            }
          >
            <option value="">Not specified</option>
            {opts.audienceTypes.map((id) => (
              <option key={id} value={id}>
                {AUDIENCE_LABELS[id]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Optimise for (optional)" htmlFor="hub-content-optimise">
          <Select
            id="hub-content-optimise"
            name="optimiseFor"
            value={clamped.optimiseFor}
            onChange={(e) =>
              setField("optimiseFor", e.target.value as OptimiseForId | "")
            }
            disabled={!clamped.contentType || opts.optimiseFor.length === 0}
          >
            <option value="">Not specified</option>
            {opts.optimiseFor.map((id) => (
              <option key={id} value={id}>
                {OPTIMISE_LABELS[id]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Tone (optional)" htmlFor="hub-content-tone">
        <Select
          id="hub-content-tone"
          name="tone"
          value={clamped.tone}
          onChange={(e) => setField("tone", e.target.value as ToneId)}
        >
          {opts.tones.map((id) => (
            <option key={id} value={id}>
              {TONE_LABELS[id]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Topic / brief" htmlFor="hub-content-topic">
        <Input
          id="hub-content-topic"
          name="topic"
          required
          value={values.topic}
          onChange={(e) => setField("topic", e.target.value)}
          placeholder="e.g. Winter lunch special for locals"
        />
      </Field>

      <Field
        label="Notes (optional)"
        htmlFor="hub-content-notes"
        hint="Extra context for the draft — offers, must-include lines, exclusions"
      >
        <Textarea
          id="hub-content-notes"
          name="notes"
          value={values.notes}
          onChange={(e) => setField("notes", e.target.value)}
          placeholder="Optional constraints or context"
        />
      </Field>
    </div>
  );
}
