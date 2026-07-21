import Link from "next/link";
import { requirePortalUser } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/page-header";
import { ClientAccountLinks } from "@/components/client-account-links";
import { Card, CardContent } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

const LINKS = [
  {
    href: "/client/strategy",
    label: "Strategy",
    blurb: "Your package-based marketing plan — unlocks 6–12 hours after signup.",
  },
  {
    href: "/client/content",
    label: "Content status",
    blurb: "See what is awaiting you, in progress, or already live.",
  },
  {
    href: "/client/approvals",
    label: "Approvals",
    blurb: "Review drafts when we need your say-so before anything goes live.",
  },
  {
    href: "/client/calendar",
    label: "Schedule",
    blurb: "Glance at what is planned. Ask us if timing needs to change.",
  },
  {
    href: "/client/requests/new",
    label: "Ask us",
    blurb: "Tell us what you need — we’ll already have your company context.",
  },
] as const;

/** Folded into Account — kept for deep links, not primary nav. */
export default async function ClientHelpPage() {
  await requirePortalUser();

  return (
    <div>
      <PageHeader
        title="Help"
        explainerId="client-help"
        explainer="How your managed marketing service works — approvals, asks, billing, and what we handle for you."
        parent={{ href: "/client/account", label: "Account" }}
      />
      <ClientAccountLinks />

      <div className="space-y-8 p-6">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">How it works</h2>
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
                Nothing goes live without the usual checks. The automated content service never
                publishes or spends on its own.
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Useful links</h2>
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
          <h2 className="text-sm font-semibold">Need a hand?</h2>
          <Card>
            <CardContent className="space-y-4 p-6">
              <p className="text-sm text-muted-foreground">
                Send a message — we&apos;ll already know who you are.
              </p>
              <p>
                <Link href="/client/requests/new" className={buttonClasses()}>
                  Ask us
                </Link>
              </p>
              <Link href="/client/account" className="text-xs text-primary hover:underline">
                Back to Account →
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
