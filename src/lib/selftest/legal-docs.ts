// Self-tests for versioned Terms + Privacy legal docs (publish → gate → accept).

import {
  addMembership,
  createTenant,
  createUser,
  currentLegalDoc,
  hasAcceptedTerms,
  pendingLegalDocs,
  publishTermsVersion,
  purgeTenant,
  recordTermsAcceptance,
  updateTermsVersion,
} from "@/lib/db";
import { TENANT_ROLE_TIER } from "@/lib/types";
import type { ActingUser, TermsVersion, User } from "@/lib/types";
import { broadcastLegalDocUpdate } from "@/lib/terms";

function acting(user: User, tenantId: string): ActingUser {
  return {
    ...user,
    tenantId,
    tenantRole: "owner",
    role: TENANT_ROLE_TIER.owner,
  };
}

async function restoreLegalDoc(previous: TermsVersion | undefined, publishedId: string) {
  await updateTermsVersion(publishedId, { active: false });
  if (previous) await updateTermsVersion(previous.id, { active: true });
}

export async function checkLegalDocsIndependentVersions(): Promise<{
  ok: boolean;
  detail: string;
}> {
  const suffix = Date.now();
  const t = await createTenant({
    name: `Legal Docs ${suffix}`,
    kind: "agency",
    plan: "starter",
    status: "active",
    timezone: "Australia/Sydney",
  });
  const userRow = await createUser({
    email: `legal-docs-${suffix}@selftest.dev`,
    name: "Legal Publisher",
    role: "admin",
  });
  await addMembership({ tenantId: t.id, userId: userRow.id, role: "owner" });
  const actor = acting(userRow, t.id);

  const beforeTerms = await currentLegalDoc("terms");
  const beforePrivacy = await currentLegalDoc("privacy");
  let publishedTerms: TermsVersion | undefined;
  let publishedPrivacy: TermsVersion | undefined;

  try {
    const termsBase = beforeTerms?.version ?? 0;
    const privacyBase = beforePrivacy?.version ?? 0;

    publishedTerms = await publishTermsVersion({
      kind: "terms",
      title: "Self-test Terms",
      body: "Self-test terms body.",
      summary: "Self-test bump",
      effectiveDate: "2026-07-14",
      publishedById: actor.id,
    });
    publishedPrivacy = await publishTermsVersion({
      kind: "privacy",
      title: "Self-test Privacy",
      body: "Self-test privacy body.",
      summary: "Self-test privacy bump",
      effectiveDate: "2026-07-14",
      publishedById: actor.id,
    });

    const currentTerms = await currentLegalDoc("terms");
    const currentPrivacy = await currentLegalDoc("privacy");

    const versionsOk =
      publishedTerms.version === termsBase + 1 &&
      publishedPrivacy.version === privacyBase + 1 &&
      currentTerms?.id === publishedTerms.id &&
      currentPrivacy?.id === publishedPrivacy.id &&
      currentTerms?.active === true &&
      currentPrivacy?.active === true;

    const termsStillActive = currentTerms?.kind === "terms" && currentTerms.active;

    if (!versionsOk || !termsStillActive) {
      return {
        ok: false,
        detail: `versions/active mismatch terms=${currentTerms?.version} privacy=${currentPrivacy?.version}`,
      };
    }

    const pending = await pendingLegalDocs(userRow.id);
    const needsBoth =
      pending.some((d) => d.kind === "terms" && d.version === publishedTerms!.version) &&
      pending.some((d) => d.kind === "privacy" && d.version === publishedPrivacy!.version);

    if (!needsBoth) {
      return { ok: false, detail: `pending kinds=${pending.map((d) => d.kind).join(",")}` };
    }

    await recordTermsAcceptance({
      userId: userRow.id,
      tenantId: t.id,
      kind: "terms",
      version: publishedTerms.version,
    });
    await recordTermsAcceptance({
      userId: userRow.id,
      tenantId: t.id,
      kind: "privacy",
      version: publishedPrivacy.version,
    });

    const acceptedTerms = await hasAcceptedTerms(userRow.id, publishedTerms.version, "terms");
    const acceptedPrivacy = await hasAcceptedTerms(
      userRow.id,
      publishedPrivacy.version,
      "privacy",
    );
    const pendingAfter = await pendingLegalDocs(userRow.id);
    const stillOurPending = pendingAfter.filter(
      (d) => d.id === publishedTerms!.id || d.id === publishedPrivacy!.id,
    );

    const broadcast = await broadcastLegalDocUpdate(actor, publishedPrivacy, "https://example.test");

    return {
      ok:
        acceptedTerms &&
        acceptedPrivacy &&
        stillOurPending.length === 0 &&
        typeof broadcast.recipients === "number",
      detail: `terms v${publishedTerms.version} privacy v${publishedPrivacy.version} notify recipients=${broadcast.recipients}`,
    };
  } finally {
    if (publishedTerms) await restoreLegalDoc(beforeTerms, publishedTerms.id);
    if (publishedPrivacy) await restoreLegalDoc(beforePrivacy, publishedPrivacy.id);
    await purgeTenant(t.id);
  }
}
