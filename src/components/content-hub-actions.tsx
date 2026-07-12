"use client";

import { useState } from "react";
import {
  FileText,
  ImageIcon,
  Mic,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { FormModal } from "@/components/form-modal";
import { LockedCompanyField } from "@/components/locked-company-field";
import { generateStudioDraftAction } from "@/app/(app)/studio/actions";
import {
  generateAiImageAction,
  generateAiVideoAction,
} from "@/app/(app)/visuals/actions";
import { generateAiVoiceAction } from "@/app/(app)/content/actions";
import { CONTENT_PLATFORM_OPTIONS } from "@/lib/promo-catalog";
import { cn } from "@/lib/utils";

const CONTENT_TYPES: [string, string][] = [
  ["social_post", "Social media post"],
  ["blog_article", "Blog article"],
  ["email_newsletter", "Email newsletter"],
  ["website_copy", "Website page copy"],
  ["landing_page", "Landing page copy"],
  ["ad_copy", "Ad copy"],
  ["video_script", "Video script"],
  ["brochure_copy", "Brochure copy"],
  ["faq", "FAQ section"],
  ["seo_meta", "SEO meta"],
];

const TONES: [string, string][] = [
  ["brand_default", "Brand voice"],
  ["friendly", "Friendly"],
  ["professional", "Professional"],
  ["urgent", "Urgent"],
  ["short_punchy", "Short & punchy"],
];

const IMAGE_FORMATS: [string, string][] = [
  ["square", "Square (1:1)"],
  ["vertical", "Vertical (9:16)"],
  ["landscape", "Landscape (16:9)"],
];

const VOICE_STYLES: [string, string][] = [
  ["warm", "Warm"],
  ["professional", "Professional"],
  ["energetic", "Energetic"],
  ["calm", "Calm"],
];

type HubModal = "content" | "image" | "video" | "voice" | null;

type CompanyOpt = { id: string; name: string };

function CompanyField({
  companies,
  defaultCompanyId,
  id,
  locked,
}: {
  companies: CompanyOpt[];
  defaultCompanyId?: string;
  id: string;
  locked?: boolean;
}) {
  return (
    <LockedCompanyField
      id={id}
      companies={companies}
      companyId={defaultCompanyId}
      locked={locked}
      hint="Required — drafts stay company-scoped."
    />
  );
}

function ModalActions({ onClose, submitLabel }: { onClose: () => void; submitLabel: string }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit">{submitLabel}</Button>
    </div>
  );
}

export function ContentHubActions({
  companies,
  defaultCompanyId,
  lockCompany = false,
}: {
  companies: CompanyOpt[];
  defaultCompanyId?: string;
  /** When true (client workspace), hide the company switcher. */
  lockCompany?: boolean;
}) {
  const [open, setOpen] = useState<HubModal>(null);
  const close = () => setOpen(null);
  const usable =
    lockCompany && defaultCompanyId
      ? companies.filter((c) => c.id === defaultCompanyId)
      : companies.filter(Boolean);

  const tiles: {
    id: Exclude<HubModal, null>;
    label: string;
    hint: string;
    icon: LucideIcon;
  }[] = [
    {
      id: "content",
      label: "AI Content",
      hint: "Governed draft → review → approve",
      icon: FileText,
    },
    {
      id: "image",
      label: "AI Image Gen",
      hint: "DAM asset (video add-on)",
      icon: ImageIcon,
    },
    {
      id: "video",
      label: "AI Video Gen",
      hint: "Short-form (video add-on)",
      icon: Video,
    },
    {
      id: "voice",
      label: "AI Voice Gen",
      hint: "Script + placeholder audio",
      icon: Mic,
    },
  ];

  if (usable.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No AI-ready clients yet. Finish onboarding a client before generating content.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setOpen(t.id)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left transition-colors",
                "hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground">
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold">{t.label}</span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </button>
          );
        })}
      </div>

      {open === "content" && (
        <FormModal
          title="AI Content"
          description="Creates an ai_draft through the Studio pipeline — compliance-checked, never auto-published."
          onClose={close}
          wide
        >
          <form action={generateStudioDraftAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <CompanyField
                companies={usable}
                defaultCompanyId={defaultCompanyId}
                locked={lockCompany}
                id="hub-content-company"
              />
              <Field label="Content type" htmlFor="hub-content-type">
                <Select
                  id="hub-content-type"
                  name="contentType"
                  required
                  defaultValue="social_post"
                >
                  {CONTENT_TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Topic / brief" htmlFor="hub-content-topic">
              <Input
                id="hub-content-topic"
                name="topic"
                required
                placeholder="e.g. Winter lunch special for locals"
              />
            </Field>
            <Field
              label="Objective"
              htmlFor="hub-content-objective"
              hint="What should this piece achieve?"
            >
              <Textarea
                id="hub-content-objective"
                name="objective"
                required
                placeholder="e.g. Fill weekday lunch tables"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Platform (optional)"
                htmlFor="hub-content-channel"
                hint="Where this draft should run"
              >
                <Select id="hub-content-channel" name="channel" defaultValue="">
                  <option value="">Not specified</option>
                  {CONTENT_PLATFORM_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tone (optional)" htmlFor="hub-content-tone">
                <Select id="hub-content-tone" name="tone" defaultValue="brand_default">
                  {TONES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <ModalActions onClose={close} submitLabel="Generate draft" />
          </form>
        </FormModal>
      )}

      {open === "image" && (
        <FormModal
          title="AI Image Gen"
          description="Creates a pending DAM image asset. Requires the video add-on. Simulated when VISUALS_LIVE is off."
          onClose={close}
          wide
        >
          <form action={generateAiImageAction} className="space-y-4">
            <CompanyField
              companies={usable}
              defaultCompanyId={defaultCompanyId}
                locked={lockCompany}
              id="hub-image-company"
            />
            <Field label="Topic / title" htmlFor="hub-image-topic">
              <Input id="hub-image-topic" name="topic" required placeholder="Hero — winter special" />
            </Field>
            <Field label="Prompt" htmlFor="hub-image-prompt">
              <Textarea
                id="hub-image-prompt"
                name="objective"
                required
                placeholder="Describe the image: scene, mood, product, text overlays to avoid…"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Aspect" htmlFor="hub-image-format">
                <Select id="hub-image-format" name="format" defaultValue="square">
                  {IMAGE_FORMATS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Channel (optional)" htmlFor="hub-image-channel">
                <Select id="hub-image-channel" name="channel" defaultValue="">
                  <option value="">Not specified</option>
                  {CONTENT_PLATFORM_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label="Attach to content ID (optional)"
              htmlFor="hub-image-content"
              hint="After creative approval, the asset can auto-attach to this content."
            >
              <Input id="hub-image-content" name="contentId" placeholder="cnt_…" />
            </Field>
            <ModalActions onClose={close} submitLabel="Generate image" />
          </form>
        </FormModal>
      )}

      {open === "video" && (
        <FormModal
          title="AI Video Gen"
          description="Creates a pending DAM video asset. Requires the video add-on. Placeholder MP4 when live render is off."
          onClose={close}
          wide
        >
          <form action={generateAiVideoAction} className="space-y-4">
            <CompanyField
              companies={usable}
              defaultCompanyId={defaultCompanyId}
                locked={lockCompany}
              id="hub-video-company"
            />
            <Field label="Topic / title" htmlFor="hub-video-topic">
              <Input id="hub-video-topic" name="topic" required placeholder="15s Reels — winter special" />
            </Field>
            <Field label="Script / prompt" htmlFor="hub-video-script">
              <Textarea
                id="hub-video-script"
                name="script"
                required
                placeholder="Hook → body → CTA. Include on-screen text if needed."
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Channel (optional)" htmlFor="hub-video-channel">
                <Select id="hub-video-channel" name="channel" defaultValue="">
                  <option value="">Not specified</option>
                  {CONTENT_PLATFORM_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Target duration (optional)"
                htmlFor="hub-video-duration"
                hint="Hint only — length is derived from script until live render."
              >
                <Input
                  id="hub-video-duration"
                  name="durationSec"
                  type="number"
                  min={5}
                  max={60}
                  placeholder="15"
                />
              </Field>
            </div>
            <Field label="Attach to content ID (optional)" htmlFor="hub-video-content">
              <Input id="hub-video-content" name="contentId" placeholder="cnt_…" />
            </Field>
            <ModalActions onClose={close} submitLabel="Generate video" />
          </form>
        </FormModal>
      )}

      {open === "voice" && (
        <FormModal
          title="AI Voice Gen"
          description="Polishes a voiceover script as an ai_draft and attaches a placeholder audio asset. Live TTS lands when a provider is configured — nothing is published automatically."
          onClose={close}
          wide
        >
          <form action={generateAiVoiceAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <CompanyField
                companies={usable}
                defaultCompanyId={defaultCompanyId}
                locked={lockCompany}
                id="hub-voice-company"
              />
              <Field label="Voice style" htmlFor="hub-voice-style">
                <Select id="hub-voice-style" name="voiceStyle" defaultValue="warm">
                  {VOICE_STYLES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field
              label="Topic (optional)"
              htmlFor="hub-voice-topic"
              hint="Short label for the draft in the content list"
            >
              <Input id="hub-voice-topic" name="topic" placeholder="e.g. Winter lunch VO" />
            </Field>
            <Field
              label="Script"
              htmlFor="hub-voice-script"
              hint="Spoken lines only — keep under ~60 seconds unless needed"
            >
              <Textarea
                id="hub-voice-script"
                name="script"
                required
                className="min-h-28"
                placeholder="e.g. Looking for a cosy lunch this week? Our winter specials are on now — book a table or order takeaway."
              />
            </Field>
            <ModalActions onClose={close} submitLabel="Generate voice draft" />
          </form>
        </FormModal>
      )}
    </>
  );
}
