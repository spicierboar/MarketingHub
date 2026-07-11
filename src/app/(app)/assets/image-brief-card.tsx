import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { generateImageBriefAction } from "./actions";
import type { Company } from "@/lib/types";

// AI image-brief generator (§46). Produces a governed creative brief (as a
// content item) grounded in the company Brand Brain. Runs with the template
// fallback when no Claude key is set.
export function ImageBriefCard({ companies }: { companies: Company[] }) {
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
  return (
    <Card>
      <CardContent className="p-6">
        <h2 className="mb-1 font-semibold">AI image brief</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Generate a shoot-ready creative brief, grounded in the Brand Brain and
          routed for review like any other content.
        </p>
        <form action={generateImageBriefAction} className="space-y-3">
          <Field label="Client" htmlFor="ib-company">
            <Select id="ib-company" name="companyId" required>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
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
            <Input id="ib-channel" name="channel" placeholder="e.g. Instagram" />
          </Field>
          <Button type="submit" className="w-full">
            Generate brief
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
