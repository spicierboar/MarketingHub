import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { getCompany } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

const LINKS = [
  {
    href: "/client/approvals",
    label: "Approvals",
    blurb: "Review drafts when we need your say-so before anything goes live.",
  },
  {
    href: "/client/calendar",
    label: "Calendar",
    blurb: "See what is planned and ask for a reschedule if timing needs to change.",
  },
  {
    href: "/client/assets",
    label: "Assets",
    blurb: "Share photos, logos and files for your agency to use.",
  },
  {
    href: "/client/payments",
    label: "Payments",
    blurb: "Check your subscription tier and advertising budget at a glance.",
  },
  {
    href: "/client/requests/new",
    label: "New request",
    blurb: "Tell us what you need — we’ll already have your company context.",
  },
] as const;

export default async function ClientHelpPage() {
  const { companyId } = await requirePortalUser();
  const company = await getCompany(companyId);

  return (
    <div>
      <PageHeader
        title="Help"
        description={`How your managed marketing service works for ${company?.name ?? "your business"}.`}
      />

      <div className="space-y-8 p-6">
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">How it works</h2>
          <Card>
            <CardContent className="space-y-3 p-6 text-sm text-muted-foreground">
              <p>
                We prepare your marketing — strategy, calendar, drafts and campaigns — on your
                behalf. You don&apos;t need to run day-to-day publishing yourself.
              </p>
              <p>
                When something needs your approval, it shows up under Approvals. Approve when
                you&apos;re happy; we handle the rest within the limits you and your agency agreed.
              </p>
              <p>
                Nothing goes live without the usual checks. AI never publishes or spends on its own.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Useful links</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {LINKS.map((item) => (
              <li key={item.href}>
                <Card>
                  <CardContent className="p-5">
                    <Link href={item.href} className="text-sm font-semibold text-primary underline">
                      {item.label}
                    </Link>
                    <p className="mt-2 text-sm text-muted-foreground">{item.blurb}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Need a hand?</h2>
          <Card>
            <CardContent className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                Open a request and we&apos;ll already have your account and company details —
                just tell us what you need.
              </p>
              <p>
                <Link href="/client/requests/new" className={buttonClasses()}>
                  Request assistance
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                Support tickets include your account context automatically so your agency can help
                without you re-explaining who you are.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
