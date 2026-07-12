import { requireAdmin } from "@/lib/auth/rbac";
import { listAiPromptVersions } from "@/lib/db";
import {
  getBuiltinPrompt,
  listBuiltinPromptKeys,
} from "@/lib/ai/prompt-registry";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import type { AiPromptVersion } from "@/lib/types";
import {
  activatePromptVersionAction,
  createPromptVersionAction,
  deactivatePromptVersionAction,
} from "./actions";

const MODEL_PROVIDERS = [
  { value: "anthropic", label: "Anthropic" },
  { value: "openai", label: "OpenAI" },
] as const;

export default async function AiPromptsPage() {
  const user = await requireAdmin();
  const builtinKeys = listBuiltinPromptKeys();
  const allVersions = await listAiPromptVersions(user.tenantId);
  const tenantVersions = allVersions.filter((v) => v.tenantId === user.tenantId);

  const byKey = new Map<string, AiPromptVersion[]>();
  for (const v of tenantVersions) {
    const list = byKey.get(v.promptKey) ?? [];
    list.push(v);
    byKey.set(v.promptKey, list);
  }
  for (const key of builtinKeys) {
    if (!byKey.has(key)) byKey.set(key, []);
  }

  const keys = Array.from(byKey.keys()).sort((a, b) => a.localeCompare(b));

  return (
    <div>
      <PageHeader
        title="AI prompts"
        description="Versioned prompt library. Built-in defaults apply until a tenant version is activated."
      />

      <div className="space-y-6 p-6">
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-4 font-semibold">Create version</h2>
            <form action={createPromptVersionAction} className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Prompt key"
                htmlFor="promptKey"
                hint="Builtin keys only — versions override the in-code default"
              >
                <Select
                  id="promptKey"
                  name="promptKey"
                  defaultValue={builtinKeys[0] ?? "campaign_plan"}
                  required
                >
                  {builtinKeys.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Name" htmlFor="name">
                <Input id="name" name="name" required placeholder="e.g. Campaign plan v2" />
              </Field>
              <Field label="Model provider" htmlFor="modelProvider">
                <Select id="modelProvider" name="modelProvider" defaultValue="anthropic">
                  {MODEL_PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Model name" htmlFor="modelName">
                <Input
                  id="modelName"
                  name="modelName"
                  placeholder="e.g. claude-sonnet"
                />
              </Field>
              <Field
                label="Temperature"
                htmlFor="temperature"
                hint="0 = deterministic, 1 = more varied (optional)"
              >
                <Input
                  id="temperature"
                  name="temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  placeholder="e.g. 0.3"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Purpose" htmlFor="purpose">
                  <Input
                    id="purpose"
                    name="purpose"
                    required
                    placeholder="e.g. Convert a natural-language goal into a structured campaign plan"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Prompt text" htmlFor="promptText">
                  <Textarea
                    id="promptText"
                    name="promptText"
                    rows={6}
                    required
                    placeholder="You are a marketing campaign planner for an Australian multi-tenant agency…"
                  />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="activate" className="rounded border-border" />
                Activate immediately (retires previous active version)
              </label>
              <div className="sm:col-span-2">
                <Button type="submit">Create version</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {keys.map((key) => {
            const versions = (byKey.get(key) ?? []).sort((a, b) => b.version - a.version);
            const builtin = getBuiltinPrompt(key);
            const active = versions.find((v) => v.active);
            return (
              <Card key={key}>
                <CardContent className="p-5">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{key}</span>
                        {active ? (
                          <Badge tone="success">Active v{active.version}</Badge>
                        ) : builtin ? (
                          <Badge tone="info">Builtin default</Badge>
                        ) : (
                          <Badge tone="neutral">No active version</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {builtin?.purpose ?? versions[0]?.purpose ?? "—"}
                      </p>
                    </div>
                  </div>

                  {builtin && (
                    <details className="mb-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
                      <summary className="cursor-pointer font-medium">
                        Builtin v{builtin.version} — {builtin.name}
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                        {builtin.promptText}
                      </pre>
                    </details>
                  )}

                  {versions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No tenant versions yet — builtin applies at runtime.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border rounded-md border border-border">
                      {versions.map((v) => (
                        <li
                          key={v.id}
                          className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">
                                v{v.version} — {v.name}
                              </span>
                              {v.active ? (
                                <Badge tone="success">Active</Badge>
                              ) : (
                                <Badge tone="neutral">Inactive</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Updated {formatDate(v.updatedAt)}
                              {v.modelName ? ` · ${v.modelProvider}/${v.modelName}` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {!v.active ? (
                              <form action={activatePromptVersionAction}>
                                <input type="hidden" name="versionId" value={v.id} />
                                <Button type="submit" variant="outline" size="sm">
                                  Activate
                                </Button>
                              </form>
                            ) : (
                              <form action={deactivatePromptVersionAction}>
                                <input type="hidden" name="versionId" value={v.id} />
                                <Button type="submit" variant="ghost" size="sm">
                                  Deactivate
                                </Button>
                              </form>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
