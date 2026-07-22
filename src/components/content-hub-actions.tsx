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
import {
  randomContentDemoFill,
  randomImageDemoFill,
  randomVideoDemoFill,
  randomVoiceDemoFill,
} from "@/lib/demo-fill";
import { CONTENT_PLATFORM_OPTIONS } from "@/lib/promo-catalog";
import { cn } from "@/lib/utils";
import {
  ContentRecipeComposer,
  EMPTY_RECIPE_VALUES,
  recipeComposerReady,
  type RecipeComposerValues,
} from "@/components/content-recipe-composer";
import type { CreateForId } from "@/lib/content-recipe";

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

function ModalActions({
  onClose,
  submitLabel,
  submitDisabled = false,
}: {
  onClose: () => void;
  submitLabel: string;
  submitDisabled?: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-border pt-4">
      <ModalCancelButton onClose={onClose} />
      <ActionSubmitButton
        type="submit"
        pendingLabel="Generating…"
        disabled={submitDisabled}
      >
        {submitLabel}
      </ActionSubmitButton>
    </div>
  );
}

/** Staging / local only — never pass true from production. */
function DemoFillBar({ onFill }: { onFill: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      <span>
        Staging / local only — fills sample marketing copy so you can demo without typing.
      </span>
      <Button type="button" variant="secondary" size="sm" onClick={onFill}>
        Fill random demo values
      </Button>
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
  allowDemoFill = false,
}: {
  companies: CompanyOpt[];
  industries: IndustryOpt[];
  defaultCompanyId?: string;
  /** When true (client workspace), hide the company switcher. */
  lockCompany?: boolean;
  /** Industry / general require agency admin. */
  isAdmin?: boolean;
  /**
   * Staging / local only. Must be `devToolsOpen()` from a Server Component —
   * never true in production.
   */
  allowDemoFill?: boolean;
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
          <ContentDemoForm
            allowDemoFill={allowDemoFill}
            scope={effectiveScope}
            onScopeChange={setScope}
            companies={usable}
            industries={industries}
            defaultCompanyId={defaultCompanyId}
            lockCompany={lockCompany}
            onClose={close}
          />
        </FormModal>
      )}

      {open === "image" && (
        <FormModal
          title="AI Image Gen"
          description="Creates a Library item plus a pending DAM image. Simulated when VISUALS_LIVE is off."
          onClose={close}
          wide
        >
          <ImageDemoForm
            allowDemoFill={allowDemoFill}
            scope={effectiveScope}
            onScopeChange={setScope}
            companies={usable}
            industries={industries}
            defaultCompanyId={defaultCompanyId}
            lockCompany={lockCompany}
            onClose={close}
          />
        </FormModal>
      )}

      {open === "video" && (
        <FormModal
          title="AI Video Gen"
          description="Creates a Library item plus a pending DAM video. Placeholder MP4 when live render is off."
          onClose={close}
          wide
        >
          <VideoDemoForm
            kind="video"
            allowDemoFill={allowDemoFill}
            scope={effectiveScope}
            onScopeChange={setScope}
            companies={usable}
            industries={industries}
            defaultCompanyId={defaultCompanyId}
            lockCompany={lockCompany}
            onClose={close}
          />
        </FormModal>
      )}

      {open === "reel" && (
        <FormModal
          title="AI Reels"
          description="Vertical short-form video as a Library item plus DAM asset. Defaults toward Instagram Reels."
          onClose={close}
          wide
        >
          <VideoDemoForm
            kind="reel"
            allowDemoFill={allowDemoFill}
            scope={effectiveScope}
            onScopeChange={setScope}
            companies={usable}
            industries={industries}
            defaultCompanyId={defaultCompanyId}
            lockCompany={lockCompany}
            onClose={close}
          />
        </FormModal>
      )}

      {open === "voice" && (
        <FormModal
          title="AI Voice Gen"
          description="Polishes a voiceover as an ai_draft in Library and attaches placeholder audio. Nothing publishes automatically."
          onClose={close}
          wide
        >
          <VoiceDemoForm
            allowDemoFill={allowDemoFill}
            scope={effectiveScope}
            onScopeChange={setScope}
            companies={usable}
            industries={industries}
            defaultCompanyId={defaultCompanyId}
            lockCompany={lockCompany}
            onClose={close}
          />
        </FormModal>
      )}
    </>
  );
}

type DemoFormShared = {
  allowDemoFill: boolean;
  scope: CreateScope;
  onScopeChange: (s: CreateScope) => void;
  companies: CompanyOpt[];
  industries: IndustryOpt[];
  defaultCompanyId?: string;
  lockCompany?: boolean;
  onClose: () => void;
};

function ContentDemoForm({
  allowDemoFill,
  scope,
  onScopeChange,
  companies,
  industries,
  defaultCompanyId,
  lockCompany,
  onClose,
}: DemoFormShared) {
  const createFor = scope as CreateForId;
  const [recipe, setRecipe] = useState<RecipeComposerValues>(EMPTY_RECIPE_VALUES);

  function handleScopeChange(next: CreateScope) {
    setRecipe(EMPTY_RECIPE_VALUES);
    onScopeChange(next);
  }

  return (
    <form action={hubGenerateContentAction} className="space-y-4">
      {allowDemoFill ? (
        <DemoFillBar
          onFill={() => {
            const fill = randomContentDemoFill(createFor);
            setRecipe({
              contentType: fill.contentType as RecipeComposerValues["contentType"],
              channel: fill.channel as RecipeComposerValues["channel"],
              funnel: fill.funnel as RecipeComposerValues["funnel"],
              objective: fill.objective as RecipeComposerValues["objective"],
              audience: (fill.audience || "") as RecipeComposerValues["audience"],
              optimiseFor: (fill.optimiseFor ||
                "") as RecipeComposerValues["optimiseFor"],
              tone: fill.tone as RecipeComposerValues["tone"],
              topic: fill.topic,
              notes: fill.notes ?? "",
            });
          }}
        />
      ) : null}
      <CreateScopeFields
        scope={scope}
        onScopeChange={handleScopeChange}
        companies={companies}
        industries={industries}
        defaultCompanyId={defaultCompanyId}
        lockCompany={lockCompany}
        fieldId="hub-content-company"
      />
      <ContentRecipeComposer
        createFor={createFor}
        values={recipe}
        onChange={setRecipe}
      />
      <ModalActions
        onClose={onClose}
        submitLabel="Generate draft"
        submitDisabled={!recipeComposerReady(recipe)}
      />
    </form>
  );
}

function ImageDemoForm({
  allowDemoFill,
  scope,
  onScopeChange,
  companies,
  industries,
  defaultCompanyId,
  lockCompany,
  onClose,
}: DemoFormShared) {
  const [topic, setTopic] = useState("");
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState("square");
  const [channel, setChannel] = useState("");

  return (
    <form action={hubGenerateImageAction} className="space-y-4">
      {allowDemoFill ? (
        <DemoFillBar
          onFill={() => {
            const fill = randomImageDemoFill();
            setTopic(fill.topic);
            setPrompt(fill.prompt);
            setChannel(fill.channel);
            setFormat(fill.format ?? "square");
          }}
        />
      ) : null}
      <CreateScopeFields
        scope={scope}
        onScopeChange={onScopeChange}
        companies={companies}
        industries={industries}
        defaultCompanyId={defaultCompanyId}
        lockCompany={lockCompany}
        fieldId="hub-image-company"
      />
      <Field label="Topic / title" htmlFor="hub-image-topic">
        <Input
          id="hub-image-topic"
          name="topic"
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Hero — winter special"
        />
      </Field>
      <Field label="Prompt" htmlFor="hub-image-prompt">
        <Textarea
          id="hub-image-prompt"
          name="objective"
          required
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the image: scene, mood, product, text overlays to avoid…"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Aspect" htmlFor="hub-image-format">
          <Select
            id="hub-image-format"
            name="format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          >
            {IMAGE_FORMATS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Channel (optional)" htmlFor="hub-image-channel">
          <Select
            id="hub-image-channel"
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="">Not specified</option>
            {CONTENT_PLATFORM_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <ModalActions onClose={onClose} submitLabel="Generate image" />
    </form>
  );
}

function VideoDemoForm({
  kind,
  allowDemoFill,
  scope,
  onScopeChange,
  companies,
  industries,
  defaultCompanyId,
  lockCompany,
  onClose,
}: DemoFormShared & { kind: "video" | "reel" }) {
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [channel, setChannel] = useState(kind === "reel" ? "instagram" : "");

  return (
    <form action={hubGenerateVideoAction} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      {allowDemoFill ? (
        <DemoFillBar
          onFill={() => {
            const fill = randomVideoDemoFill(kind);
            setTopic(fill.topic);
            setScript(fill.script);
            setChannel(fill.channel || (kind === "reel" ? "instagram" : ""));
          }}
        />
      ) : null}
      <CreateScopeFields
        scope={scope}
        onScopeChange={onScopeChange}
        companies={companies}
        industries={industries}
        defaultCompanyId={defaultCompanyId}
        lockCompany={lockCompany}
        fieldId={kind === "reel" ? "hub-reel-company" : "hub-video-company"}
      />
      <Field
        label="Topic / title"
        htmlFor={kind === "reel" ? "hub-reel-topic" : "hub-video-topic"}
      >
        <Input
          id={kind === "reel" ? "hub-reel-topic" : "hub-video-topic"}
          name="topic"
          required
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={
            kind === "reel" ? "15s Reel — winter special" : "15s — winter special"
          }
        />
      </Field>
      <Field
        label="Script / prompt"
        htmlFor={kind === "reel" ? "hub-reel-script" : "hub-video-script"}
      >
        <Textarea
          id={kind === "reel" ? "hub-reel-script" : "hub-video-script"}
          name="script"
          required
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder={
            kind === "reel"
              ? "Hook (0–3s) → body → CTA. Keep vertical 9:16."
              : "Hook → body → CTA. Include on-screen text if needed."
          }
        />
      </Field>
      <Field
        label="Channel (optional)"
        htmlFor={kind === "reel" ? "hub-reel-channel" : "hub-video-channel"}
      >
        {kind === "reel" ? (
          <Select
            id="hub-reel-channel"
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="facebook">Facebook</option>
            <option value="">Not specified</option>
          </Select>
        ) : (
          <Select
            id="hub-video-channel"
            name="channel"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="">Not specified</option>
            {CONTENT_PLATFORM_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <ModalActions
        onClose={onClose}
        submitLabel={kind === "reel" ? "Generate reel" : "Generate video"}
      />
    </form>
  );
}

function VoiceDemoForm({
  allowDemoFill,
  scope,
  onScopeChange,
  companies,
  industries,
  defaultCompanyId,
  lockCompany,
  onClose,
}: DemoFormShared) {
  const [topic, setTopic] = useState("");
  const [script, setScript] = useState("");
  const [voiceStyle, setVoiceStyle] = useState("warm");

  return (
    <form action={generateAiVoiceAction} className="space-y-4">
      {allowDemoFill ? (
        <DemoFillBar
          onFill={() => {
            const fill = randomVoiceDemoFill();
            setTopic(fill.topic);
            setScript(fill.script);
            setVoiceStyle(pickVoiceStyle());
          }}
        />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <CreateScopeFields
          scope={scope}
          onScopeChange={onScopeChange}
          companies={companies}
          industries={industries}
          defaultCompanyId={defaultCompanyId}
          lockCompany={lockCompany}
          fieldId="hub-voice-company"
        />
        <Field label="Voice style" htmlFor="hub-voice-style">
          <Select
            id="hub-voice-style"
            name="voiceStyle"
            value={voiceStyle}
            onChange={(e) => setVoiceStyle(e.target.value)}
          >
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
        <Input
          id="hub-voice-topic"
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Winter lunch VO"
        />
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
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="e.g. Looking for a cosy lunch this week? Our winter specials are on now — book a table or order takeaway."
        />
      </Field>
      <ModalActions onClose={onClose} submitLabel="Generate voice draft" />
    </form>
  );
}

function pickVoiceStyle(): string {
  return VOICE_STYLES[Math.floor(Math.random() * VOICE_STYLES.length)]![0];
}
