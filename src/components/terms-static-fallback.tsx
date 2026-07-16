/** Static Terms draft used only when no version is published in the DB yet. */

export function TermsStaticFallback() {
  return (
    <>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-slate-900">
        Terms of Service
      </h1>
      <p className="mt-2 text-sm text-slate-500">Draft template — not yet published as a version</p>

      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <strong>Draft for review.</strong> No version has been published from Settings → Terms &amp;
        Privacy yet. This template remains visible for signup/billing links until an agency owner
        publishes the live Terms.
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">1. Agreement to these terms</h2>
        <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-700">
          <p>
            These Terms of Service (the &ldquo;Terms&rdquo;) govern your access to and use of the
            Marketing Command Centre platform, websites and related services (the
            &ldquo;Service&rdquo;), operated by us (the &ldquo;Provider&rdquo;, &ldquo;we&rdquo;,
            &ldquo;us&rdquo;). By creating a workspace, subscribing to a plan, or using the Service,
            you agree to these Terms on behalf of yourself and any organisation you represent
            (&ldquo;you&rdquo;).
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">2. The Service</h2>
        <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-700">
          <p>
            The Service helps agencies and businesses draft, review, approve, schedule and publish
            marketing content under a governed workflow. AI is used to <em>draft</em> and assist;
            people review and approve, and nothing is published without human approval.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">
          3. Payments and third-party payment processing
        </h2>
        <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-700">
          <p>
            Paid subscriptions are billed through a third-party payment processor. We do not own,
            build or operate credit-card infrastructure. Card details are handled by that processor
            under its own terms and PCI controls.
          </p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">4. Contact</h2>
        <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-700">
          <p>
            Questions about these Terms? Contact us via your workspace administrator once a live
            version is published.
          </p>
        </div>
      </section>
    </>
  );
}
