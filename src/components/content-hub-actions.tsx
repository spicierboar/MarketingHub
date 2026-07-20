"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  Clapperboard,
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
import { ActionSubmitButton } from "@/components/action-submit-button";
import {
  generateAiVoiceAction,
  hubGenerateContentAction,
  hubGenerateImageAction,
  hubGenerateVideoAction,
} from "@/app/(app)/content/actions";
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

type HubModal = "content" | "image" | "video" | "reel" | "voice" | null;
type CreateScope = "client" | "industry" | "general";

type CompanyOpt = { id: string; name: string };
type IndustryOpt = { id: string; label: string };

function ModalCancelButton({ onClose }: { onClose: () => void }) {
  const { pending } = useFormStatus();
  return (
    <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
      Cancel
    </Button>
  );
}

function ModalActions({ onClose, submitLabel }: { onClose: () => void; submitLabel: string }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      <ModalCancelButton onClose={onClose} />
      <ActionSubmitButton type="submit" pendingLabel="Generating…">
        {submitLabel}
      </ActionSubmitButton>
    </div>
  );
}

function CreateScopeFields({
  scope,
  onScopeChange,
  companies,
  industries,
  defaultCompanyId,
  lockCompany,
  fieldId,
}: {
  scope: CreateScope;
  onScopeChange: (s: CreateScope) => void;
  companies: CompanyOpt[];
  industries: IndustryOpt[];
  defaultCompanyId?: string;
  lockCompany?: boolean;
  fieldId: string;
}) {
  const lockedToClient = Boolean(lockCompany && defaultCompanyId);

  return (
    <div className="space-y-3">
      {!lockedToClient && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Create for</legend>
          <div className="flex flex-wrap gap-3 text-sm">
            {(
              [
                ["client", "Client"],
                ["industry", "Industry"],
                ["general", "General"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="createScope"
                  value={value}
                  checked={scope === value}
                  onChange={() => onScopeChange(value)}
                  className="h-4 w-4"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Client uses Brand Brain. Industry and General go into the shared Library
            (no client required).
          </p>
        </fieldset>
      )}
      {lockedToClient && <input type="hidden" name="createScope" value="client" />}

      {scope === "client" && (
        <LockedCompanyField
          id={fieldId}
          companies={companies}
          companyId={defaultCompanyId}
          locked={lockCompany}
          hint={
            companies.length === 0
              ? "No AI-ready clients — switch to Industry or General."
              : "Draft stays client-scoped."
          }
        />
      )}
      {scope === "industry" && (
        <Field label="Industry" htmlFor={`${fieldId}-industry`}>
          <Select id={`${fieldId}-industry`} name="industryId" required defaultValue="">
            <option value="" disabled>
              Select industry…
            </option>
            {industries.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>
      )}
      {scope === "general" && (
        <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Tenant-wide general content — not tied to a client or industry vertical.
        </p>
      )}
    </div>
  );
}

export function ContentHubActions({
  companies,
  industries,
  defaultCompanyId,
  lockCompany = false,
  isAdmin = false,
}: {
  companies: CompanyOpt[];
  industries: IndustryOpt[];
  defaultCompanyId?: string;
  /** When true (client workspace), hide the company switcher. */
  lockCompany?: boolean;
  /** Industry / general require agency admin. */
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState<HubModal>(null);
  const [scope, setScope] = useState<CreateScope>(
    lockCompany && defaultCompanyId ? "client" : companies.length > 0 ? "client" : "general",
  );
  const close = () => setOpen(null);
  const usable =
    lockCompany && defaultCompanyId
      ? companies.filter((c) => c.id === defaultCompanyId)
      : companies.filter(Boolean);

  const canIndustryOrGeneral = isAdmin && !lockCompany;
  const effectiveScope: CreateScope =
    lockCompany && defaultCompanyId
      ? "client"
      : scope === "client" && usable.length === 0
        ? canIndustryOrGeneral
          ? "general"
          : "client"
        : !canIndustryOrGeneral
          ? "client"
          : scope;

  const tiles: {
    id: Exclude<HubModal, null>;
    label: string;
    hint: string;
    icon: LucideIcon;
  }[] = [
    {
      id: "content",
      label: "AI Content",
      hint: "Copy draft → Library",
      icon: FileText,
    },
    {
      id: "image",
      label: "AI Image Gen",
      hint: "Image → Library + assets",
      icon: ImageIcon,
    },
    {
      id: "video",
      label: "AI Video Gen",
      hint: "Short video → Library",
      icon: Video,
    },
    {
      id: "reel",
      label: "AI Reels",
      hint: "Vertical reel → Library",
      icon: Clapperboard,
    },
    {
      id: "voice",
      label: "AI Voice Gen",
      hint: "VO + audio → Library",
      icon: Mic,
    },
  ];

  const clientBlocked =
    effectiveScope === "client" && usable.length === 0 && !canIndustryOrGeneral;

  if (clientBlocked) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No AI-ready clients yet. Ask an agency admin to create Industry or General
        content, or finish onboarding a client.
      </div>
    );
  }

  function openModal(id: Exclude<HubModal, null>) {
    if (usable.length === 0 && canIndustryOrGeneral && scope === "client") {
      setScope("general");
    }
    setOpen(id);
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => openModal(t.id)}
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
          description="Creates an ai_draft in Library — compliance-checked, never auto-published."
          onClose={close}
          wide
        >
          <form action={hubGenerateContentAction} className="space-y-4">
            <CreateScopeFields
              scope={effectiveScope}
              onScopeChange={setScope}
              companies={usable}
              industries={industries}
              defaultCompanyId={defaultCompanyId}
              lockCompany={lockCompany}
              fieldId="hub-content-company"
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
          description="Creates a Library item plus a pending DAM image. Simulated when VISUALS_LIVE is off."
          onClose={close}
          wide
        >
          <form action={hubGenerateImageAction} className="space-y-4">
            <CreateScopeFields
              scope={effectiveScope}
              onScopeChange={setScope}
              companies={usable}
              industries={industries}
              defaultCompanyId={defaultCompanyId}
              lockCompany={lockCompany}
              fieldId="hub-image-company"
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
            <ModalActions onClose={close} submitLabel="Generate image" />
          </form>
        </FormModal>
      )}

      {open === "video" && (
        <FormModal
          title="AI Video Gen"
          description="Creates a Library item plus a pending DAM video. Placeholder MP4 when live render is off."
          onClose={close}
          wide
        >
          <form action={hubGenerateVideoAction} className="space-y-4">
            <input type="hidden" name="kind" value="video" />
            <CreateScopeFields
              scope={effectiveScope}
              onScopeChange={setScope}
              companies={usable}
              industries={industries}
              defaultCompanyId={defaultCompanyId}
              lockCompany={lockCompany}
              fieldId="hub-video-company"
            />
            <Field label="Topic / title" htmlFor="hub-video-topic">
              <Input id="hub-video-topic" name="topic" required placeholder="15s — winter special" />
            </Field>
            <Field label="Script / prompt" htmlFor="hub-video-script">
              <Textarea
                id="hub-video-script"
                name="script"
                required
                placeholder="Hook → body → CTA. Include on-screen text if needed."
              />
            </Field>
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
            <ModalActions onClose={close} submitLabel="Generate video" />
          </form>
        </FormModal>
      )}

      {open === "reel" && (
        <FormModal
          title="AI Reels"
          description="Vertical short-form video as a Library item plus DAM asset. Defaults toward Instagram Reels."
          onClose={close}
          wide
        >
          <form action={hubGenerateVideoAction} className="space-y-4">
            <input type="hidden" name="kind" value="reel" />
            <CreateScopeFields
              scope={effectiveScope}
              onScopeChange={setScope}
              companies={usable}
              industries={industries}
              defaultCompanyId={defaultCompanyId}
              lockCompany={lockCompany}
              fieldId="hub-reel-company"
            />
            <Field label="Topic / title" htmlFor="hub-reel-topic">
              <Input
                id="hub-reel-topic"
                name="topic"
                required
                placeholder="15s Reel — winter special"
              />
            </Field>
            <Field label="Script / prompt" htmlFor="hub-reel-script">
              <Textarea
                id="hub-reel-script"
                name="script"
                required
                placeholder="Hook (0–3s) → body → CTA. Keep vertical 9:16."
              />
            </Field>
            <Field label="Channel (optional)" htmlFor="hub-reel-channel">
              <Select id="hub-reel-channel" name="channel" defaultValue="instagram">
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="facebook">Facebook</option>
                <option value="">Not specified</option>
              </Select>
            </Field>
            <ModalActions onClose={close} submitLabel="Generate reel" />
          </form>
        </FormModal>
      )}

      {open === "voice" && (
        <FormModal
          title="AI Voice Gen"
          description="Polishes a voiceover as an ai_draft in Library and attaches placeholder audio. Nothing publishes automatically."
          onClose={close}
          wide
        >
          <form action={generateAiVoiceAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <CreateScopeFields
                scope={effectiveScope}
                onScopeChange={setScope}
                companies={usable}
                industries={industries}
                defaultCompanyId={defaultCompanyId}
                lockCompany={lockCompany}
                fieldId="hub-voice-company"
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
              hint="Short label for the draft in Library"
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
