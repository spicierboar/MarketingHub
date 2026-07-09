import Link from "next/link";
import { requireAdmin } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { createCompanyAction } from "../actions";

export default async function NewCompanyPage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader
        title="Add company"
        description="Create the company, then complete guided onboarding."
      />
      <div className="mx-auto max-w-xl p-6">
        <form action={createCompanyAction}>
          <Card>
            <CardContent className="space-y-4 p-6">
              <Field
                label="Company name"
                htmlFor="name"
                hint="You'll add the full profile on the next screen."
              >
                <Input id="name" name="name" required placeholder="e.g. Acme Roofing" />
              </Field>
            </CardContent>
          </Card>
          <div className="mt-4 flex justify-end gap-2">
            <Link
              href="/companies"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </Link>
            <Button type="submit">Create &amp; start onboarding</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
