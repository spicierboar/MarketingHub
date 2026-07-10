import { requireAdmin } from "@/lib/auth/rbac";
import {
  listCompanies,
  listContent,
  listPhotoShoots,
} from "@/lib/db";
import { companyAddonMap } from "@/lib/entitlements";
import { visualsLive } from "@/lib/visuals-connectors";
import { storageConfigured } from "@/lib/storage";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/utils";
import type { Company, PhotoShoot } from "@/lib/types";
import {
  advancePhotoShootAction,
  draftVideoStudioScriptAction,
  generateAiImageAction,
  generateAiVideoAction,
  generateVideoStudioVariantsAction,
  requestPhotoShootAction,
} from "./actions";
import {
  ALL_VIDEO_CHANNELS,
  buildScriptFromPack,
  listScriptPacks,
  listVideoTemplates,
  VIDEO_STUDIO_CHANNELS,
} from "@/lib/video-studio";

export default async function VisualsPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter(
    (c) => c.status !== "archived",
  );
  const companyId = params.company ?? companies[0]?.id;
  const company = companies.find((c) => c.id === companyId);
  const addons = company ? await companyAddonMap(user.tenantId, company.id) : null;

  const [shoots, contentItems] = await Promise.all([
    listPhotoShoots(user.tenantId, companyId),
    listContent(user.tenantId),
  ]);
  const companyContent = contentItems.filter(
    (c) => c.companyId === companyId && !["archived", "rejected"].includes(c.status),
  );
  const videoScripts = companyContent.filter((c) => c.type === "video_script");

  const templates = listVideoTemplates();
  const defaultTemplateId = templates[0]?.id ?? "service_spotlight";
  const defaultPacks = listScriptPacks(defaultTemplateId);
  const defaultPack = defaultPacks[0];
  const prefilledScript =
    company && defaultPack
      ? buildScriptFromPack(company, defaultPack, "Your topic")
      : "";

  const live = visualsLive();
  const storage = storageConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Visuals"
        description="Video-first creative generation and managed photo shoots — gated per company add-on."
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
          <Badge tone={live ? "success" : "neutral"}>
            {live ? "VISUALS_LIVE on" : "Simulated renders"}
          </Badge>
          <Badge tone={storage ? "success" : "neutral"}>
            {storage ? "Media storage ready" : "Metadata-only (set CC_MEDIA_DIR)"}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <Field label="Company" htmlFor="vis-company">
              <Select id="vis-company" name="company" defaultValue={companyId}>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit">View</Button>
          </form>
          {company && addons && (
            <p className="mt-3 text-sm text-muted-foreground">
              Add-ons:{" "}
              {addons.video ? (
                <span className="text-foreground">🎬 AI video</span>
              ) : (
                <span>🎬 AI video (off)</span>
              )}
              {" · "}
              {addons.photo ? (
                <span className="text-foreground">📸 Photo shoots</span>
              ) : (
                <span>📸 Photo shoots (off)</span>
              )}
              {!addons.video && !addons.photo && (
                <>
                  {" "}
                  — enable on{" "}
                  <a href="/billing" className="text-primary underline">
                    Billing
                  </a>
                </>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {company && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-1 font-semibold">🎬 AI image</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Generate a brand-grounded hero image into the asset library (pending approval).
                Requires the AI video add-on.
              </p>
              {!addons?.video ? (
                <p className="text-sm text-amber-700">Enable the AI video add-on on Billing first.</p>
              ) : (
                <form action={generateAiImageAction} className="space-y-3">
                  <input type="hidden" name="companyId" value={company.id} />
                  <Field label="Topic" htmlFor="img-topic">
                    <Input id="img-topic" name="topic" required placeholder="Winter warmers hero" />
                  </Field>
                  <Field label="Objective" htmlFor="img-objective">
                    <Textarea id="img-objective" name="objective" required className="min-h-14" />
                  </Field>
                  <Field label="Format" htmlFor="img-format">
                    <Select id="img-format" name="format" defaultValue="square">
                      <option value="square">Square 1080×1080</option>
                      <option value="vertical">Vertical 9:16</option>
                      <option value="landscape">Landscape 16:9</option>
                    </Select>
                  </Field>
                  <Field label="Channel (optional)" htmlFor="img-channel">
                    <Input id="img-channel" name="channel" placeholder="Instagram" />
                  </Field>
                  <Field label="Auto-attach after approval (optional)" htmlFor="img-content">
                    <Select id="img-content" name="contentId">
                      <option value="">— none —</option>
                      {companyContent.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" className="w-full">
                    Generate image
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-1 font-semibold">🎬 AI vertical video</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                Short-form Reels / TikTok / Shorts from a script. Simulated MP4 until VISUALS_LIVE.
              </p>
              {!addons?.video ? (
                <p className="text-sm text-amber-700">Enable the AI video add-on on Billing first.</p>
              ) : (
                <form action={generateAiVideoAction} className="space-y-3">
                  <input type="hidden" name="companyId" value={company.id} />
                  <Field label="Topic" htmlFor="vid-topic">
                    <Input id="vid-topic" name="topic" required />
                  </Field>
                  <Field label="Script" htmlFor="vid-script">
                    <Textarea
                      id="vid-script"
                      name="script"
                      required
                      className="min-h-24"
                      placeholder="15–30s voiceover / on-screen beats…"
                      defaultValue={videoScripts[0]?.body?.slice(0, 500)}
                    />
                  </Field>
                  <Field label="Channel (optional)" htmlFor="vid-channel">
                    <Input id="vid-channel" name="channel" placeholder="TikTok" />
                  </Field>
                  <Field label="Auto-attach after approval (optional)" htmlFor="vid-content">
                    <Select id="vid-content" name="contentId">
                      <option value="">— none —</option>
                      {companyContent.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" className="w-full">
                    Generate video
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {company && (
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">🎬 Video studio</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Pick a template and script pack, draft an{" "}
              <span className="font-medium">ai_draft</span> script, then generate vertical
              channel variants (assets land as{" "}
              <span className="font-medium">pending_approval</span>). Simulated MP4 until
              VISUALS_LIVE.
            </p>
            {!addons?.video ? (
              <p className="text-sm text-amber-700">Enable the AI video add-on on Billing first.</p>
            ) : (
              <div className="space-y-6">
                <form action={draftVideoStudioScriptAction} className="space-y-3 border-b pb-6">
                  <input type="hidden" name="companyId" value={company.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Template" htmlFor="vs-template">
                      <Select id="vs-template" name="templateId" defaultValue={defaultTemplateId}>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Script pack" htmlFor="vs-pack">
                      <Select id="vs-pack" name="scriptPackId" defaultValue={defaultPack?.id}>
                        {templates.flatMap((t) =>
                          listScriptPacks(t.id).map((p) => (
                            <option key={p.id} value={p.id}>
                              {t.label}: {p.label}
                            </option>
                          )),
                        )}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Topic" htmlFor="vs-topic">
                    <Input id="vs-topic" name="topic" required placeholder="Winter warmers promo" />
                  </Field>
                  <Field label="Script (optional — auto-filled from pack if blank)" htmlFor="vs-script-draft">
                    <Textarea
                      id="vs-script-draft"
                      name="script"
                      className="min-h-28 font-mono text-xs"
                      placeholder={prefilledScript.slice(0, 200)}
                    />
                  </Field>
                  <Button type="submit" variant="secondary">
                    Draft script (ai_draft)
                  </Button>
                </form>

                <form action={generateVideoStudioVariantsAction} className="space-y-3">
                  <input type="hidden" name="companyId" value={company.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Template" htmlFor="vs-template-v">
                      <Select id="vs-template-v" name="templateId" defaultValue={defaultTemplateId}>
                        {templates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Script pack" htmlFor="vs-pack-v">
                      <Select id="vs-pack-v" name="scriptPackId" defaultValue={defaultPack?.id}>
                        {templates.flatMap((t) =>
                          listScriptPacks(t.id).map((p) => (
                            <option key={p.id} value={p.id}>
                              {t.label}: {p.label}
                            </option>
                          )),
                        )}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Topic" htmlFor="vs-topic-v">
                    <Input id="vs-topic-v" name="topic" required />
                  </Field>
                  <Field label="Script" htmlFor="vs-script-v">
                    <Textarea
                      id="vs-script-v"
                      name="script"
                      required
                      className="min-h-28 font-mono text-xs"
                      defaultValue={videoScripts[0]?.body?.slice(0, 2000) || prefilledScript}
                    />
                  </Field>
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Channel variants</legend>
                    <div className="flex flex-wrap gap-4">
                      {ALL_VIDEO_CHANNELS.map((ch) => (
                        <label key={ch} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" name={`channel_${ch}`} defaultChecked />
                          {VIDEO_STUDIO_CHANNELS[ch].label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <Field label="Auto-attach after approval (optional)" htmlFor="vs-content">
                    <Select id="vs-content" name="contentId">
                      <option value="">— none —</option>
                      {companyContent.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Button type="submit" className="w-full sm:w-auto">
                    Generate vertical variants
                  </Button>
                </form>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {company && (
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-1 font-semibold">📸 Photo shoots</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Request a managed shoot — booking → deliverables in the DAM → approve → optional auto-attach.
              Or{" "}
              <a href="/photographers" className="text-primary underline">
                book via the photographer marketplace
              </a>
              .
            </p>
            {!addons?.photo ? (
              <p className="text-sm text-amber-700">Enable the Photo shoots add-on on Billing first.</p>
            ) : (
              <>
                <form action={requestPhotoShootAction} className="mb-6 space-y-3 border-b pb-6">
                  <input type="hidden" name="companyId" value={company.id} />
                  <Field label="Brief" htmlFor="ps-brief">
                    <Textarea id="ps-brief" name="brief" required className="min-h-20" />
                  </Field>
                  <Field label="Location" htmlFor="ps-location">
                    <Input id="ps-location" name="location" placeholder="On-site address or room" />
                  </Field>
                  <Field label="Target channels" htmlFor="ps-channels">
                    <Input id="ps-channels" name="targetChannels" placeholder="instagram, facebook" />
                  </Field>
                  <Button type="submit">Request shoot</Button>
                </form>

                {shoots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No photo shoots yet.</p>
                ) : (
                  <div className="space-y-4">
                    {shoots.map((shoot) => (
                      <ShootRow key={shoot.id} shoot={shoot} company={company} />
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ShootRow({ shoot, company }: { shoot: PhotoShoot; company: Company }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium">{company.name}</span>
        <StatusBadge status={shoot.status} />
        {shoot.scheduledAt && (
          <span className="text-xs text-muted-foreground">
            {formatDate(shoot.scheduledAt)}
          </span>
        )}
      </div>
      <p className="text-sm">{shoot.brief}</p>
      {shoot.location && (
        <p className="mt-1 text-xs text-muted-foreground">📍 {shoot.location}</p>
      )}
      {shoot.deliverableAssetIds.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {shoot.deliverableAssetIds.length} deliverable(s) linked
        </p>
      )}

      {shoot.status === "requested" && (
        <form action={advancePhotoShootAction} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="shootId" value={shoot.id} />
          <input type="hidden" name="to" value="scheduled" />
          <Field label="Schedule for" htmlFor={`sched-${shoot.id}`}>
            <Input
              id={`sched-${shoot.id}`}
              name="scheduledAt"
              type="datetime-local"
              required
            />
          </Field>
          <Button type="submit" size="sm">
            Schedule
          </Button>
          <CancelShoot shootId={shoot.id} />
        </form>
      )}
      {shoot.status === "scheduled" && (
        <form action={advancePhotoShootAction} className="mt-3 flex gap-2">
          <input type="hidden" name="shootId" value={shoot.id} />
          <input type="hidden" name="to" value="in_progress" />
          <Button type="submit" size="sm">
            Mark in progress
          </Button>
          <CancelShoot shootId={shoot.id} />
        </form>
      )}
      {shoot.status === "in_progress" && (
        <form action={advancePhotoShootAction} className="mt-3 space-y-2">
          <input type="hidden" name="shootId" value={shoot.id} />
          <input type="hidden" name="to" value="delivered" />
          <Field label="Photographer notes" htmlFor={`notes-${shoot.id}`}>
            <Input id={`notes-${shoot.id}`} name="photographerNotes" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm">
              Mark delivered
            </Button>
            <CancelShoot shootId={shoot.id} />
          </div>
        </form>
      )}
      {shoot.status === "delivered" && (
        <form action={advancePhotoShootAction} className="mt-3 flex gap-2">
          <input type="hidden" name="shootId" value={shoot.id} />
          <input type="hidden" name="to" value="completed" />
          <Button type="submit" size="sm">
            Complete
          </Button>
          <p className="self-center text-xs text-muted-foreground">
            Upload deliverables via Creative Assets, then link asset ids from the asset page.
          </p>
        </form>
      )}
    </div>
  );
}

function CancelShoot({ shootId }: { shootId: string }) {
  return (
    <form action={advancePhotoShootAction}>
      <input type="hidden" name="shootId" value={shootId} />
      <input type="hidden" name="to" value="cancelled" />
      <Button type="submit" size="sm" variant="outline">
        Cancel
      </Button>
    </form>
  );
}
