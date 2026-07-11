"use client";

import { useState, useTransition } from "react";
import type { CampaignExperiment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  createCampaignExperimentAction,
  evaluateCampaignExperimentAction,
  recordExperimentObservationAction,
  startCampaignExperimentAction,
} from "@/app/(app)/campaigns/experiment-actions";

export function CampaignExperimentsPanel({
  campaignId,
  experiments,
}: {
  campaignId: string;
  experiments: CampaignExperiment[];
}) {
  const [pending, startTransition] = useTransition();
  const [evalMessage, setEvalMessage] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <h2 className="font-semibold">A/B experiments</h2>
      <p className="text-sm text-muted-foreground">
        Winner engine refuses to declare until each arm meets min sample size and
        confidence threshold.
      </p>

      {evalMessage && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm"
        >
          {evalMessage}
        </p>
      )}

      {experiments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No experiments yet.</p>
      ) : (
        <ul className="space-y-3">
          {experiments.map((exp) => {
            const control = exp.variants.find((v) => v.id === exp.controlVariantId);
            const test = exp.variants.find((v) => v.id === exp.testVariantId);
            return (
              <li key={exp.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={exp.status === "completed" ? "success" : "neutral"}>
                    {exp.status}
                  </Badge>
                  <span className="text-sm font-medium">{exp.hypothesis}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Metric: {exp.successMetric} · split {exp.audienceSplit}/
                  {100 - exp.audienceSplit} · min n={exp.minSampleSize} · conf ≥{" "}
                  {(exp.confidenceThreshold * 100).toFixed(0)}%
                </p>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <p>
                    Control ({control?.label}): {control?.impressions ?? 0} imp /{" "}
                    {control?.conversions ?? 0} conv
                  </p>
                  <p>
                    Test ({test?.label}): {test?.impressions ?? 0} imp /{" "}
                    {test?.conversions ?? 0} conv
                  </p>
                </div>
                {exp.winningVariation && (
                  <p className="mt-1 text-sm text-emerald-700">
                    Winner:{" "}
                    {exp.variants.find((v) => v.id === exp.winningVariation)?.label ??
                      exp.winningVariation}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {exp.status === "draft" && (
                    <form action={startCampaignExperimentAction}>
                      <input type="hidden" name="experimentId" value={exp.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        Start
                      </Button>
                    </form>
                  )}
                  {(exp.status === "running" || exp.status === "draft") &&
                    exp.variants.map((v) => (
                      <form
                        key={v.id}
                        action={recordExperimentObservationAction}
                        className="flex flex-wrap items-end gap-1 rounded border border-border p-2"
                      >
                        <input type="hidden" name="experimentId" value={exp.id} />
                        <input type="hidden" name="variantId" value={v.id} />
                        <span className="w-full text-[10px] font-medium uppercase text-muted-foreground">
                          +obs {v.label}
                        </span>
                        <Input
                          name="impressions"
                          type="number"
                          min={0}
                          defaultValue={50}
                          className="h-7 w-20 text-xs"
                          aria-label="Impressions"
                        />
                        <Input
                          name="conversions"
                          type="number"
                          min={0}
                          defaultValue={5}
                          className="h-7 w-20 text-xs"
                          aria-label="Conversions"
                        />
                        <Button type="submit" size="sm" variant="outline">
                          Record
                        </Button>
                      </form>
                    ))}
                  {(exp.status === "running" || exp.status === "completed") && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        const fd = new FormData();
                        fd.set("experimentId", exp.id);
                        startTransition(() => {
                          void evaluateCampaignExperimentAction(fd).then((r) =>
                            setEvalMessage(r.message),
                          );
                        });
                      }}
                    >
                      Evaluate
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form action={createCampaignExperimentAction} className="space-y-3 border-t border-border pt-4">
        <input type="hidden" name="campaignId" value={campaignId} />
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Hypothesis</label>
          <Textarea
            name="hypothesis"
            required
            rows={2}
            placeholder="Test CTA will lift conversion rate vs control"
            className="text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Success metric</label>
            <Select name="successMetric" defaultValue="conversion_rate" className="h-9 w-44">
              <option value="conversion_rate">Conversion rate</option>
              <option value="ctr">CTR</option>
              <option value="bookings">Bookings</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Min sample / arm</label>
            <Input
              name="minSampleSize"
              type="number"
              min={1}
              defaultValue={100}
              className="h-9 w-28"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Confidence</label>
            <Select name="confidenceThreshold" defaultValue="0.95" className="h-9 w-28">
              <option value="0.9">90%</option>
              <option value="0.95">95%</option>
              <option value="0.99">99%</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Control %</label>
            <Input
              name="audienceSplit"
              type="number"
              min={1}
              max={99}
              defaultValue={50}
              className="h-9 w-20"
            />
          </div>
        </div>
        <Button type="submit">Create experiment</Button>
      </form>
    </div>
  );
}
