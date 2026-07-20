import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import {
  emailActivation,
  liveIntegrationsAllowed,
  photoMarketplaceActivation,
  providerActivationStatuses,
} from "../src/lib/env";
import {
  retrieveCheckoutSession,
  stripeConfigured,
  verifyStripeSignature,
} from "../src/lib/billing";
import { aiConfigured, callClaudeDetailed } from "../src/lib/ai/claude";
import {
  matchPlace,
  placesEnrichmentConfigured,
} from "../src/lib/places-enrichment";
import {
  authorizeUrl,
  exchangeCodeForToken,
  oauthConfigured,
} from "../src/lib/oauth";
import {
  dispatchPublish,
  resolvePublishingMode,
} from "../src/lib/publishing-connectors";
import { adsLive } from "../src/lib/ad-connectors";
import { emailConfigured, sendEmail } from "../src/lib/email";
import { photoMarketplaceStripeReady } from "../src/lib/photo-marketplace";
import {
  autoOnboardingLive,
  scrapeForOnboardingPreview,
} from "../src/lib/auto-onboarding";
import {
  isAbnLookupLive,
  lookupAbn,
} from "../src/lib/abn-lookup";
import {
  fetchLiveAbVariantResults,
  fetchLiveLandingPageMetrics,
  funnelConfigured,
} from "../src/lib/funnel-connectors";
import { orderingStripeReady } from "../src/lib/ordering-connectors";
import { createConnectOnboarding } from "../src/lib/ordering-stripe";
import {
  dispatchPartnerWebhook,
  partnerWebhooksLive,
  verifyPartnerWebhookEndpoint,
} from "../src/lib/public-api/partner-webhooks";
import { POST as billingWebhookPost } from "../src/app/api/billing/webhook/route";
import type { Company, PartnerWebhook } from "../src/lib/types";

const names = [
  "CC_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "APP_ORIGIN",
  "CC_LOCAL_DEMO",
  "NEXT_PUBLIC_CC_LOCAL_DEMO",
  "PHOTO_MARKETPLACE_LIVE",
  "STRIPE_SECRET_KEY",
  "STRIPE_BILLING_LIVE",
  "EMAIL_SEND_LIVE",
  "RESEND_API_KEY",
  "CC_AI_LIVE",
  "ANTHROPIC_API_KEY",
  "PLACES_ENRICHMENT_LIVE",
  "GOOGLE_PLACES_API_KEY",
  "PUBLISHING_LIVE",
  "PUBLISHING_TOKEN_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "ADS_LIVE",
  "AUTO_ONBOARDING_LIVE",
  "ABN_LOOKUP_LIVE",
  "ABN_LOOKUP_GUID",
  "FUNNEL_LIVE",
  "FUNNEL_API_KEY",
  "FUNNEL_API_URL",
  "ORDERING_LIVE",
  "PARTNER_WEBHOOKS_LIVE",
  "STRIPE_WEBHOOK_SECRET",
] as const;
const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
const originalNodeEnv = process.env.NODE_ENV;
const originalFetch = globalThis.fetch;
let fetches = 0;

function productionRuntime(): void {
  process.env.CC_ENV = "production";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.VERCEL_URL;
  process.env.APP_ORIGIN = "https://command-centre.example";
  delete process.env.CC_LOCAL_DEMO;
  delete process.env.NEXT_PUBLIC_CC_LOCAL_DEMO;
}

function configureOutboundProviders(): void {
  process.env.STRIPE_SECRET_KEY = "configured_test_key";
  process.env.STRIPE_BILLING_LIVE = "true";
  process.env.CC_AI_LIVE = "true";
  process.env.ANTHROPIC_API_KEY = "configured_test_key";
  process.env.PLACES_ENRICHMENT_LIVE = "true";
  process.env.GOOGLE_PLACES_API_KEY = "configured_test_key";
  process.env.PUBLISHING_LIVE = "true";
  process.env.PUBLISHING_TOKEN_KEY = "configured_test_key_32_bytes_long";
  process.env.META_APP_ID = "configured_test_id";
  process.env.META_APP_SECRET = "configured_test_secret";
  process.env.ADS_LIVE = "true";
}

function configureExpandedProviderCredentials(): void {
  process.env.ABN_LOOKUP_GUID = "configured_test_guid";
  process.env.FUNNEL_API_KEY = "configured_test_key";
  process.env.FUNNEL_API_URL = "https://analytics.example.test";
  process.env.STRIPE_SECRET_KEY = "configured_test_key";
}

function configureExpandedProviderFlags(): void {
  process.env.AUTO_ONBOARDING_LIVE = "true";
  process.env.ABN_LOOKUP_LIVE = "true";
  process.env.FUNNEL_LIVE = "true";
  process.env.ORDERING_LIVE = "true";
  process.env.PARTNER_WEBHOOKS_LIVE = "true";
}

function onboardingCompany(): Company {
  const timestamp = new Date(0).toISOString();
  return {
    id: "co_provider_activation",
    tenantId: "tn_provider_activation",
    name: "Provider Activation Cafe",
    status: "pending_review",
    profile: {
      serviceAreas: [],
      services: [],
      callsToAction: [],
      prohibitedClaims: [],
      approvedClaims: [],
      requiredDisclaimers: [],
    },
    documents: [],
    createdBy: "u_provider_activation",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function partnerWebhook(): PartnerWebhook {
  const timestamp = new Date(0).toISOString();
  return {
    id: "pwh_provider_activation",
    tenantId: "tn_provider_activation",
    label: "Provider activation test",
    url: "https://partner.example.test/webhook",
    events: ["content.updated"],
    secretEnc: "not-used-while-blocked",
    status: "active",
    createdById: "u_provider_activation",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function assertExpandedOutboundPathsBlocked(label: string): Promise<void> {
  const before = fetches;
  assert.equal(autoOnboardingLive(), false, `${label}: auto-onboarding gate`);
  assert.equal(isAbnLookupLive(), false, `${label}: ABN gate`);
  assert.equal(funnelConfigured(), false, `${label}: funnel gate`);
  assert.equal(orderingStripeReady(), false, `${label}: ordering gate`);
  assert.equal(partnerWebhooksLive(), false, `${label}: partner webhook gate`);

  const preview = await scrapeForOnboardingPreview({
    company: onboardingCompany(),
    consent: true,
    urls: {
      website: "https://provider-activation.example",
      socialLinks: [],
    },
  });
  assert.equal(preview.mode, "simulated", `${label}: auto-onboarding simulation`);
  assert.equal((await lookupAbn("51 824 753 556"))?.mode, "simulated");
  assert.equal(
    await fetchLiveLandingPageMetrics({
      id: "landing_provider_activation",
      slug: "provider-activation",
      url: "https://provider-activation.example/landing",
    }),
    null,
  );
  assert.equal(
    await fetchLiveAbVariantResults("experiment_provider_activation", [
      {
        id: "variant_a",
        label: "A",
        headline: "Provider activation",
        ctaText: "Test",
        weight: 100,
      },
    ]),
    null,
  );
  assert.equal(
    await createConnectOnboarding(
      "co_provider_activation",
      "Provider Activation Cafe",
      "https://command-centre.example",
    ),
    null,
  );
  assert.equal(
    (await verifyPartnerWebhookEndpoint(partnerWebhook())).ok,
    false,
  );
  await dispatchPartnerWebhook(
    "tn_provider_activation",
    "content.updated",
    { contentId: "content_provider_activation" },
  );
  assert.equal(fetches, before, `${label}: expanded paths made no provider calls`);
}

async function assertInboundStripeVerificationIndependent(): Promise<void> {
  const before = fetches;
  const secret = "whsec_provider_activation_test";
  const body = JSON.stringify({
    id: "evt_provider_activation",
    type: "provider.activation.test",
    data: {},
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
  const invalid = "0".repeat(signature.length);
  process.env.STRIPE_WEBHOOK_SECRET = secret;
  process.env.STRIPE_BILLING_LIVE = "false";
  assert.equal(
    verifyStripeSignature(
      body,
      `t=${timestamp},v1=${signature},v1=${invalid}`,
      secret,
    ),
    true,
    "the first v1 signature may match during secret rotation",
  );
  assert.equal(
    verifyStripeSignature(
      body,
      `t=${timestamp},v1=${invalid},v1=${signature}`,
      secret,
    ),
    true,
    "a later v1 signature may match during secret rotation",
  );
  assert.equal(
    verifyStripeSignature(
      body,
      `t=${timestamp},v1=${invalid},v1=${"f".repeat(signature.length)}`,
      secret,
    ),
    false,
    "all-invalid v1 signatures must reject",
  );
  const response = await billingWebhookPost(
    new NextRequest("https://command-centre.example/api/billing/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": `t=${timestamp},v1=${signature}`,
      },
      body,
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });
  assert.equal(stripeConfigured(), false, "inbound verification must not enable billing");
  assert.equal(fetches, before, "signed inbound verification must make no outbound call");
}

async function assertOutboundProvidersBlocked(label: string): Promise<void> {
  const before = fetches;
  assert.equal(liveIntegrationsAllowed(), false, `${label}: shared gate`);
  assert.equal(stripeConfigured(), false, `${label}: Stripe billing`);
  assert.equal(aiConfigured(), false, `${label}: Anthropic`);
  assert.equal(
    placesEnrichmentConfigured(),
    false,
    `${label}: Google Places`,
  );
  assert.equal(oauthConfigured("facebook"), false, `${label}: OAuth`);
  assert.equal(adsLive(), false, `${label}: ads`);
  assert.notEqual(resolvePublishingMode().kind, "live", `${label}: publishing`);

  assert.equal(await retrieveCheckoutSession("cs_test_blocked"), null);
  assert.equal(await callClaudeDetailed("system", "user"), null);
  assert.equal((await matchPlace({ name: "Safe Cafe" }))?.mode, "simulated");
  assert.equal(
    authorizeUrl("facebook", "signed-state", "https://example.test/callback"),
    null,
  );
  assert.equal(
    (await exchangeCodeForToken(
      "facebook",
      "code",
      "https://example.test/callback",
    )).ok,
    false,
  );
  const publish = await dispatchPublish(
    {
      platform: "Facebook",
      encryptedToken: "not-used-while-blocked",
    } as Parameters<typeof dispatchPublish>[0],
    "blocked test",
  );
  assert.equal(publish.blocked, true);
  assert.equal(fetches, before, `${label}: no provider fetch may run`);
}

async function main(): Promise<void> {
  try {
    globalThis.fetch = async () => {
      fetches += 1;
      throw new Error("provider request must not run in simulated tests");
    };

    productionRuntime();
    delete process.env.PHOTO_MARKETPLACE_LIVE;
    delete process.env.EMAIL_SEND_LIVE;
    delete process.env.STRIPE_BILLING_LIVE;
    delete process.env.CC_AI_LIVE;
    delete process.env.PLACES_ENRICHMENT_LIVE;
    delete process.env.PUBLISHING_LIVE;
    delete process.env.ADS_LIVE;
    delete process.env.AUTO_ONBOARDING_LIVE;
    delete process.env.ABN_LOOKUP_LIVE;
    delete process.env.FUNNEL_LIVE;
    delete process.env.ORDERING_LIVE;
    delete process.env.PARTNER_WEBHOOKS_LIVE;
    process.env.STRIPE_SECRET_KEY = "configured_test_key";
    process.env.RESEND_API_KEY = "configured_test_key";
    process.env.ANTHROPIC_API_KEY = "configured_test_key";
    process.env.GOOGLE_PLACES_API_KEY = "configured_test_key";
    process.env.PUBLISHING_TOKEN_KEY = "configured_test_key_32_bytes_long";
    process.env.META_APP_ID = "configured_test_id";
    process.env.META_APP_SECRET = "configured_test_secret";
    configureExpandedProviderCredentials();
    assert.equal(
      photoMarketplaceStripeReady(),
      false,
      "Stripe key alone must stay simulated",
    );
    assert.equal(
      emailConfigured(),
      false,
      "Resend key alone must stay simulated",
    );
    assert.equal(stripeConfigured(), false, "Stripe key alone must not activate billing");
    assert.equal(aiConfigured(), false, "Anthropic key alone must stay deterministic");
    assert.equal(
      placesEnrichmentConfigured(),
      false,
      "Places key alone must stay simulated",
    );
    assert.equal(oauthConfigured("facebook"), false, "OAuth credentials alone are inert");
    assert.equal(adsLive(), false, "ad credentials alone are inert");
    assert.equal(await retrieveCheckoutSession("cs_key_only"), null);
    assert.equal(await callClaudeDetailed("system", "key-only"), null);
    assert.equal((await matchPlace({ name: "Key Only Cafe" }))?.mode, "simulated");
    assert.equal(
      (await exchangeCodeForToken(
        "facebook",
        "code",
        "https://example.test/callback",
      )).ok,
      false,
    );
    assert.equal(
      JSON.stringify(providerActivationStatuses()).includes("configured_test_key"),
      false,
      "provider status must not expose credentials",
    );
    const keyOnlyEmail = await sendEmail({
      to: "preview@example.test",
      subject: "key-only safety",
      html: "<p>simulated</p>",
    });
    assert.equal(keyOnlyEmail.simulated, true);
    assert.equal(fetches, 0);
    await assertExpandedOutboundPathsBlocked("credentials only");

    process.env.PHOTO_MARKETPLACE_LIVE = "true";
    process.env.EMAIL_SEND_LIVE = "true";
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.RESEND_API_KEY;
    assert.equal(
      photoMarketplaceActivation().issue,
      "live_flag_without_credential",
    );
    assert.equal(emailActivation().issue, "live_flag_without_credential");
    assert.equal(photoMarketplaceStripeReady(), false);
    assert.equal(emailConfigured(), false);
    await sendEmail({
      to: "blocked@example.test",
      subject: "missing-key safety",
      html: "<p>blocked</p>",
    });
    assert.equal(fetches, 0);

    process.env.STRIPE_SECRET_KEY = "configured_test_key";
    process.env.RESEND_API_KEY = "configured_test_key";
    assert.equal(
      photoMarketplaceStripeReady(),
      true,
      "explicit live + key selects Stripe in production",
    );
    assert.equal(
      emailConfigured(),
      true,
      "explicit live + key selects Resend in production",
    );

    configureOutboundProviders();
    configureExpandedProviderCredentials();
    configureExpandedProviderFlags();
    delete process.env.STRIPE_BILLING_LIVE;
    assert.equal(
      orderingStripeReady(),
      true,
      "ordering needs its own live flag, production evidence, and Stripe key",
    );
    assert.equal(
      stripeConfigured(),
      false,
      "ordering must not implicitly enable Stripe billing",
    );
    await assertInboundStripeVerificationIndependent();
    process.env.STRIPE_BILLING_LIVE = "true";
    assert.equal(stripeConfigured(), true, "billing needs its explicit live flag");
    assert.equal(aiConfigured(), true, "AI needs its explicit live flag");
    assert.equal(
      placesEnrichmentConfigured(),
      true,
      "Places needs its explicit live flag",
    );
    assert.equal(oauthConfigured("facebook"), true, "OAuth uses effective publishing gate");
    assert.equal(adsLive(), true, "ads live gate opens only in explicit production");
    assert.equal(resolvePublishingMode().kind, "live");

    process.env.CC_ENV = "development";
    process.env.APP_ORIGIN = "http://localhost:3000";
    assert.equal(photoMarketplaceStripeReady(), false);
    assert.equal(emailConfigured(), false);
    assert.equal(photoMarketplaceActivation().issue, "environment_blocks_live");
    assert.equal(emailActivation().issue, "environment_blocks_live");
    await sendEmail({
      to: "local@example.test",
      subject: "local safety",
      html: "<p>simulated</p>",
    });
    assert.equal(fetches, 0);
    await assertOutboundProvidersBlocked("development localhost");
    await assertExpandedOutboundPathsBlocked("development localhost");

    productionRuntime();
    configureOutboundProviders();
    configureExpandedProviderCredentials();
    configureExpandedProviderFlags();
    process.env.VERCEL_ENV = "preview";
    assert.equal(photoMarketplaceStripeReady(), false);
    assert.equal(emailConfigured(), false);
    assert.equal(photoMarketplaceActivation().issue, "environment_blocks_live");
    assert.equal(emailActivation().issue, "environment_blocks_live");
    assert.equal(fetches, 0);
    await assertOutboundProvidersBlocked("Vercel Preview");
    await assertExpandedOutboundPathsBlocked("Vercel Preview");

    delete process.env.CC_ENV;
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    delete process.env.APP_ORIGIN;
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.equal(photoMarketplaceStripeReady(), false, "NODE_ENV alone is not deployment evidence");
    assert.equal(emailConfigured(), false, "NODE_ENV alone cannot activate Resend");
    await sendEmail({
      to: "indeterminate@example.test",
      subject: "indeterminate production safety",
      html: "<p>simulated</p>",
    });
    assert.equal(fetches, 0);
    await assertOutboundProvidersBlocked("NODE_ENV-only");

    process.env.CC_ENV = "production";
    assert.equal(
      photoMarketplaceStripeReady(),
      false,
      "non-Vercel production without APP_ORIGIN remains indeterminate",
    );
    assert.equal(emailConfigured(), false);
    await assertOutboundProvidersBlocked("missing APP_ORIGIN");

    delete process.env.CC_ENV;
    process.env.APP_ORIGIN = "https://command-centre.example";
    assert.equal(photoMarketplaceStripeReady(), false, "remote origin cannot replace a runtime marker");
    assert.equal(emailConfigured(), false);
    await assertOutboundProvidersBlocked("absent runtime marker");

    process.env.CC_ENV = "production";
    process.env.VERCEL_ENV = "development";
    assert.equal(photoMarketplaceStripeReady(), false, "Vercel development must override CC_ENV");
    assert.equal(emailConfigured(), false);
    await assertOutboundProvidersBlocked("Vercel development");

    process.env.VERCEL_ENV = "production";
    process.env.CC_ENV = "development";
    assert.equal(photoMarketplaceStripeReady(), false, "conflicting runtime markers fail closed");
    assert.equal(emailConfigured(), false);
    await assertOutboundProvidersBlocked("conflicting markers");

    delete process.env.VERCEL_ENV;
    process.env.CC_ENV = "production";
    process.env.APP_ORIGIN = "http://[::1]:3000";
    await assertOutboundProvidersBlocked("IPv6 loopback");

    process.env.APP_ORIGIN = "http://localhost.:3000";
    await assertOutboundProvidersBlocked("localhost trailing dot");

    delete process.env.CC_ENV;
    delete process.env.APP_ORIGIN;
    process.env.VERCEL = "1";
    delete process.env.VERCEL_ENV;
    await assertOutboundProvidersBlocked("Vercel marker without VERCEL_ENV");

    process.env.VERCEL_ENV = "production";
    assert.equal(photoMarketplaceStripeReady(), true, "Vercel production is explicit deployment evidence");
    assert.equal(emailConfigured(), true);
    assert.equal(stripeConfigured(), true);
    assert.equal(aiConfigured(), true);
    assert.equal(placesEnrichmentConfigured(), true);
    assert.equal(oauthConfigured("facebook"), true);
    console.log("PROVIDER_ACTIVATION_OK");
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      const value = original[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Object.assign(process.env, { NODE_ENV: originalNodeEnv });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
