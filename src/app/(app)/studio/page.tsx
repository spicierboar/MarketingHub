import { requireUser } from "@/lib/auth/rbac";
import { visibleCompanies, visibleContent } from "@/lib/scope";
import { getContent, getPromptTemplate, listPromptTemplates } from "@/lib/db";
import {
  canRepurposeSource,
  V1_REPURPOSE_PLATFORMS,
} from "@/lib/content-repurposing";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { generateStudioDraftAction, repurposeForPlatformsAction } from "./actions";
import Link from "next/link";

const STUDIO_TYPES: [string, string][] = [
  ["social_post", "Social media post"],
  ["blog_article", "Blog article"],
  ["email_newsletter", "Email newsletter"],
  ["website_copy", "Website page copy"],
  ["landing_page", "Landing page copy"],
  ["landing_page_brief", "Local landing page brief (structured)"],
  ["faq", "FAQ section"],
  ["ad_copy", "Ad copy"],
  ["video_script", "Video script"],
  ["brochure_copy", "Brochure copy"],
  ["proposal", "Proposal text"],
  ["seo_meta", "SEO meta title & description"],
];

const TONES: [string, string][] = [
  ["brand_default", "Brand voice (default)"],
  ["friendly", "Friendly"],
  ["professional", "Professional"],
  ["urgent", "Urgent"],
  ["short_punchy", "Short & punchy"],
];

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{
    template?: string;
    repurposeFrom?: string;
    company?: string;
  }>;
}) {
  const user = await requireUser();
  const companies = (await visibleCompanies(user)).filter(
    (c) => c.status === "ai_ready" || c.status === "approved",
  );
  const companyIds = new Set(companies.map((c) => c.id));
  const templates = (await listPromptTemplates(user.tenantId)).filter(
    (t) => t.companyId === null || companyIds.has(t.companyId),
  );
  const allContent = (await visibleContent(user)).filter(
    (c) => companyIds.has(c.companyId) && canRepurposeSource(c),
  );
  const {
    template: templateId,
    repurposeFrom,
    company: companyParam,
  } = await searchParams;
  const contextCompanyId =
    companyParam && companyIds.has(companyParam) ? companyParam : undefined;
  const preset = templateId ? await getPromptTemplate(templateId) : undefined;
  const repurposePreset = repurposeFrom ? await getContent(repurposeFrom) : undefined;
  const repurposeSource =
    repurposePreset &&
    companyIds.has(repurposePreset.companyId) &&
    canRepurposeSource(repurposePreset)
      ? repurposePreset
      : undefined;
  // Only prefill from templates the user could use anyway.
  const prefill =
    preset && (preset.companyId === null || companyIds.has(preset.companyId))
      ? preset
      : undefined;
  const companyDefault =
    (prefill?.companyId && companyIds.has(prefill.companyId)
      ? prefill.companyId
      : undefined) ?? contextCompanyId;

  return (
    <div>
      <PageHeader
        title="Content Studio"
        explainerId="studio"
        explainer="Generate any content type here. Drafts are compliance-checked and routed for approval — never published automatically."
      />

      <div className="grid gap-6 p-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {companies.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                No AI-ready companies available to you.
              </CardContent>
            </Card>
          ) : (
            <form action={generateStudioDraftAction}>
              <Card>
                <CardContent className="space-y-5 p-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Client" htmlFor="companyId">
                      <Select
                        id="companyId"
                        name="companyId"
                        required
                        defaultValue={companyDefault}
                      >
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Content type" htmlFor="contentType">
                      <Select
                        id="contentType"
                        name="contentType"
                        defaultValue={prefill?.contentType ?? "social_post"}
                      >
                        {STUDIO_TYPES.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <Field label="Topic / key message" htmlFor="topic">
                    <Input
                      id="topic"
                      name="topic"
                      required
                      defaultValue={prefill?.topic}
                    />
                  </Field>
                  <Field label="Objective" htmlFor="objective">
                    <Textarea
                      id="objective"
                      name="objective"
                      required
                      defaultValue={prefill?.objective}
                    />
                  </Field>

                  <div className="grid gap-5 sm:grid-cols-3">
                    <Field label="Audience" htmlFor="audience">
                      <Input id="audience" name="audience" defaultValue={prefill?.audience} />
                    </Field>
                    <Field label="Channel / platform" htmlFor="channel">
                      <Input id="channel" name="channel" defaultValue={prefill?.channel} />
                    </Field>
                    <Field label="Tone" htmlFor="tone">
                      <Select id="tone" name="tone" defaultValue={prefill?.tone ?? "brand_default"}>
                        {TONES.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="compare" className="h-4 w-4" />
                    <span>
                      <span className="font-medium">Draft comparison</span>{" "}
                      <span className="text-muted-foreground">
                        — generate 3 tone/length variants to compare (§24)
                      </span>
                    </span>
                  </label>

                  <fieldset className="rounded-md border border-dashed border-border p-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="saveTemplate" className="h-4 w-4" />
                      Save these settings as a reusable template
                    </label>
                    <div className="mt-2">
                      <Input name="templateName" placeholder="Template name (optional)" />
                    </div>
                  </fieldset>
                </CardContent>
              </Card>
              <div className="mt-4 flex justify-end">
                <Button type="submit">Generate</Button>
              </div>
            </form>
          )}
        </div>

        <Card className="h-fit">
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Repurpose for platforms</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Turn one draft or approved post into Facebook, Instagram, Google
              Business Profile, and TikTok variants — each becomes a new{" "}
              <span className="font-medium">ai_draft</span> for approval.
            </p>
            {companies.length === 0 || allContent.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {companies.length === 0
                  ? "No AI-ready companies available."
                  : "No draft or approved content yet — generate a post first."}
              </p>
            ) : (
              <form action={repurposeForPlatformsAction} className="space-y-4">
                <Field label="Source content" htmlFor="sourceContentId">
                  <Select
                    id="sourceContentId"
                    name="sourceContentId"
                    required
                    defaultValue={repurposeSource?.id}
                  >
                    {allContent.map((c) => {
                      const co = companies.find((x) => x.id === c.companyId);
                      return (
                        <option key={c.id} value={c.id}>
                          {co?.name}: {c.title} ({c.status.replace(/_/g, " ")})
                        </option>
                      );
                    })}
                  </Select>
                </Field>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Platforms</legend>
                  <div className="space-y-2">
                    {V1_REPURPOSE_PLATFORMS.map((platform) => (
                      <label key={platform} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="platforms"
                          value={platform}
                          defaultChecked
                          className="h-4 w-4"
                        />
                        <span>{platform}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Button type="submit" variant="secondary" className="w-full">
                  Repurpose for platforms
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">Prompt templates</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Reusable briefs — click to prefill the studio.
            </p>
            <ul className="space-y-2">
              {templates.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/studio?template=${t.id}`}
                    className="block rounded-md border border-border p-3 text-sm transition-colors hover:border-primary/40"
                  >
                    <span className="font-medium">{t.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t.topic}
                    </span>
                  </Link>
                </li>
              ))}
              {templates.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No templates yet — save one from the form.
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
