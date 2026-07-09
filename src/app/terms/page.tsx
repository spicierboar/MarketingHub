// Public Terms of Service page. Outside the (app) auth group — anyone (incl.
// prospective customers at signup/checkout) can read it with no login.
//
// IMPORTANT: this is a STARTING TEMPLATE for the owner to review with legal
// counsel before launch, not legal advice. The Payments section (§6) contains
// the third-party payment-processor disclosure ("we don't own the card
// infrastructure") and is the part written most carefully.

import Link from "next/link";

export const metadata = { title: "Terms of Service — Marketing Command Centre" };

const UPDATED = "5 July 2026";

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight">
        <span className="mr-2 font-mono text-sm text-slate-400">{n}</span>
        {title}
      </h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-5 py-12">
        <div className="mb-2 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
            MC
          </div>
          <span className="text-sm font-semibold text-slate-900">Marketing Command Centre</span>
        </div>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {UPDATED}</p>

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Draft for review.</strong> This document is a starting template. Have it reviewed
          by qualified legal counsel for your jurisdiction before you rely on it. It is not legal advice.
        </div>

        <Section n="1." title="Agreement to these terms">
          <p>
            These Terms of Service (the &ldquo;Terms&rdquo;) govern your access to and use of the
            Marketing Command Centre platform, websites and related services (the &ldquo;Service&rdquo;),
            operated by us (the &ldquo;Provider&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). By
            creating a workspace, subscribing to a plan, or using the Service, you agree to these Terms
            on behalf of yourself and any organisation you represent (&ldquo;you&rdquo;).
          </p>
        </Section>

        <Section n="2." title="The Service">
          <p>
            The Service helps agencies and businesses draft, review, approve, schedule and publish
            marketing content under a governed workflow. AI is used to <em>draft</em> and assist;
            people review and approve, and nothing is published without human approval.
          </p>
        </Section>

        <Section n="3." title="Accounts, workspaces and access">
          <p>
            You are responsible for your account credentials, for the users you invite to your
            workspace, and for all activity that occurs under your workspace. Keep your access secure
            and notify us promptly of any unauthorised use.
          </p>
        </Section>

        <Section n="4." title="Your content and AI-assisted output">
          <p>
            You retain ownership of the content, brand materials and data you provide. You are
            responsible for reviewing and approving any AI-assisted drafts before they are published or
            sent, and for ensuring the final content is accurate, lawful, and appropriately consented
            (including any personal likeness, claims or offers). The Service&rsquo;s governance,
            compliance and approval tools are aids, not a substitute for your own review and legal
            obligations.
          </p>
        </Section>

        <Section n="5." title="Acceptable use">
          <p>
            You agree not to use the Service to publish unlawful, infringing, misleading or harmful
            content, to breach any platform&rsquo;s rules, to bypass approval or compliance controls, or
            to attempt to access another customer&rsquo;s workspace or data.
          </p>
        </Section>

        <Section n="6." title="Payments, billing and third-party payment processing">
          <p>
            <strong>6.1 Payment processor.</strong> Paid subscriptions are billed through Stripe, a
            third-party payment processor. <strong>We do not own, build or operate any credit-card or
            payment-processing infrastructure ourselves.</strong> When you enter your payment details,
            they are transmitted directly to and held by the payment processor under its own security
            and PCI-DSS controls. We do not receive, collect, store or process your full card number or
            other sensitive payment credentials. We retain only a payment token and limited,
            non-sensitive information (such as the card brand, last four digits and expiry) for display
            and account management.
          </p>
          <p>
            <strong>6.2 The processor&rsquo;s terms.</strong> Your use of the payment features is also
            subject to the payment processor&rsquo;s own terms of service and privacy policy. By
            providing payment details and subscribing, you authorise us and the processor to charge your
            chosen payment method, on a recurring basis, for the applicable plan fees until you cancel.
          </p>
          <p>
            <strong>6.3 Recurring billing and renewal.</strong> Subscriptions renew automatically at the
            end of each billing period (monthly, or as selected) at the then-current price, unless
            cancelled before the renewal date.
          </p>
          <p>
            <strong>6.4 Failed payments.</strong> If a charge is declined, the payment processor may
            retry it. We may suspend, downgrade or restrict your workspace if fees remain unpaid after a
            reasonable period.
          </p>
          <p>
            <strong>6.5 Cancellation and refunds.</strong> You may cancel at any time via the billing
            portal or your workspace settings; cancellation takes effect at the end of the current
            billing period. Except where required by law, fees already paid are non-refundable.
            <em> [Owner: confirm your refund policy here.]</em>
          </p>
          <p>
            <strong>6.6 Taxes.</strong> Prices are exclusive of taxes unless stated otherwise. You are
            responsible for any taxes, duties or levies applicable to your purchase, other than taxes on
            our income.
          </p>
          <p>
            <strong>6.7 Price changes.</strong> We may change plan prices on reasonable prior notice;
            changes take effect from your next renewal.
          </p>
          <p>
            <strong>6.8 No liability for the processor.</strong> We are not responsible for the acts or
            omissions of the payment processor. We will use a reputable, PCI-DSS-compliant provider, but
            the processing of payments is performed by that provider and not by us.
          </p>
        </Section>

        <Section n="7." title="Data protection and privacy">
          <p>
            We handle your data in accordance with our Privacy Policy. Because payments are processed by
            a third party (see §6), your payment-card data is collected and stored by that processor
            under its own privacy terms, not by us. You may request an export or deletion of your
            workspace data from your account settings.
          </p>
        </Section>

        <Section n="8." title="Availability, warranties and liability">
          <p>
            The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis. To
            the maximum extent permitted by law, and without limiting any rights you have under
            applicable consumer law, we exclude implied warranties and limit our liability for the
            Service. <em>[Owner: your counsel should tailor the warranty/liability wording to your
            jurisdiction, e.g. Australian Consumer Law.]</em>
          </p>
        </Section>

        <Section n="9." title="Termination">
          <p>
            You may stop using the Service and delete your workspace at any time. We may suspend or
            terminate access for breach of these Terms or non-payment. On termination, your right to use
            the Service ends; sections intended to survive (including payment obligations already
            incurred) will survive.
          </p>
        </Section>

        <Section n="10." title="Changes to these terms">
          <p>
            We may update these Terms from time to time. Material changes will be notified through the
            Service or by email, and take effect on the date stated in the notice.
          </p>
        </Section>

        <Section n="11." title="Contact">
          <p>
            Questions about these Terms? Contact us at <em>[Owner: add your support/legal email]</em>.
          </p>
        </Section>

        <div className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
          <Link href="/login" className="text-slate-700 underline">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
