import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createCompanyFormAction } from "../actions";

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const sp = searchParams ? await searchParams : {};
  const error = sp.error ? decodeURIComponent(sp.error) : null;

  return (
    <div>
      <PageHeader
        title="Add client"
        description="Add a website to auto-fill the profile from public pages (with consent)."
      />
      <div className="mx-auto max-w-xl p-6">
        <form action={createCompanyFormAction}>
          <Card>
            <CardContent className="space-y-4 p-6">
              <Field label="Client name" htmlFor="name">
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="e.g. Harbour Roasters"
                />
              </Field>
              <Field
                label="Website"
                htmlFor="website"
                hint="Optional but recommended — we scrape public pages to pre-fill onboarding."
              >
                <Input
                  id="website"
                  name="website"
                  type="text"
                  inputMode="url"
                  placeholder="https://example.com or example.com"
                />
              </Field>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="consent"
                  value="on"
                  className="mt-1"
                />
                <span>
                  Client consents to collecting publicly available information from
                  this website for onboarding. Required when a website is entered.
                </span>
              </label>
              {error && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  {error}
                </p>
              )}
            </CardContent>
          </Card>
          <div className="mt-4 flex justify-end gap-2">
            <Link
              href="/companies"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Link>
            <Button type="submit">Create &amp; scrape profile</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
