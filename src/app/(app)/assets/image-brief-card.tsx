import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { LockedCompanyField } from "@/components/locked-company-field";
import { generateImageBriefAction } from "./actions";
import { CONTENT_PLATFORM_OPTIONS } from "@/lib/promo-catalog";
import type { Company } from "@/lib/types";

// AI image-brief generator (§46). Produces a governed creative brief (as a
// content item) grounded in the company Brand Brain. Runs with the template
// fallback when no Claude key is set.
export function ImageBriefCard({
  companies,
  defaultCompanyId,
}: {
  companies: Company[];
  defaultCompanyId?: string;
}) {
  if (companies.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          <h2 className="mb-2 font-semibold text-foreground">AI image brief</h2>
          No AI-ready companies available to brief.
        </CardContent>
      </Card>
    );
  }
  const opts = companies.map((c) => ({ id: c.id, name: c.name }));
  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="mb-1 font-semibold">AI image brief</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Generate a shoot-ready creative brief, grounded in the Brand Brain and
          routed for review like any other content.
        </p>
        <form action={generateImageBriefAction} className="space-y-3">
          <LockedCompanyField
            id="ib-company"
            companies={opts}
            companyId={defaultCompanyId}
            locked={Boolean(defaultCompanyId)}
          />
          <Field label="Topic / subject" htmlFor="ib-topic">
            <Input id="ib-topic" name="topic" required placeholder="e.g. Winter warmers hero shot" />
          </Field>
          <Field label="Objective" htmlFor="ib-objective">
            <Textarea
              id="ib-objective"
              name="objective"
              required
              className="min-h-16"
              placeholder="What should the image achieve?"
            />
          </Field>
          <Field label="Channel (optional)" htmlFor="ib-channel">
            <Select id="ib-channel" name="channel" defaultValue="">
              <option value="">Not specified</option>
              {CONTENT_PLATFORM_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" className="w-full">
            Generate brief
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
