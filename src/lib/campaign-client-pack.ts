// Share a campaign's drafted content pack into the client Approvals queue.
// Does not publish or spend — only submits drafts for pending_approval and
// stamps clientReview so /client/approvals lists them.

import { logAction } from "@/lib/audit";
import {
  getCampaign,
  getCompany,
  getContent,
  getTenant,
  listCampaignItems,
  updateContent,
} from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { signPayload } from "@/lib/token";
import type { ActingUser, ContentItem } from "@/lib/types";
import { now } from "@/lib/utils";

const SHAREABLE: ContentItem["status"][] = [
  "ai_draft",
  "user_edited",
  "pending_approval",
  "changes_required",
];

function resolveClientEmail(
  explicit: string | undefined,
  company: { profile: { approvalContact?: string } },
): string {
  const fromForm = (explicit ?? "").trim().toLowerCase();
  if (fromForm && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromForm)) return fromForm;
  const contact = (company.profile.approvalContact ?? "").trim().toLowerCase();
  // approvalContact may be a name — only use when it looks like an email
  if (contact && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) return contact;
  throw new Error(
    "A valid client email is required (or set an email on the company approval contact).",
  );
}

export async function shareCampaignPackForClient(input: {
  campaignId: string;
  user: ActingUser;
  clientEmail?: string;
  origin: string;
}): Promise<{ shared: number; skipped: number; email: string }> {
  const campaign = await getCampaign(input.campaignId);
  if (!campaign) throw new Error("Campaign not found");
  const company = await getCompany(campaign.companyId);
  if (!company || company.tenantId !== input.user.tenantId) {
    throw new Error("Company not found");
  }

  const email = resolveClientEmail(input.clientEmail, company);
  const tenant = await getTenant(input.user.tenantId);
  const items = await listCampaignItems(input.campaignId);

  let shared = 0;
  let skipped = 0;
  const titles: string[] = [];

  for (const item of items) {
    if (!item.contentId) {
      skipped += 1;
      continue;
    }
    const content = await getContent(item.contentId);
    if (!content || content.companyId !== campaign.companyId) {
      skipped += 1;
      continue;
    }
    if (!SHAREABLE.includes(content.status)) {
      skipped += 1;
      continue;
    }

    const issuedAt = Date.now();
    const ttlMs = 7 * 24 * 60 * 60 * 1000;
    const token = signPayload(
      {
        tenantId: input.user.tenantId,
        companyId: content.companyId,
        contentId: content.id,
        clientEmail: email,
        purpose: "client_approval",
      },
      { issuedAt, ttlMs },
    );
    const link = `${input.origin}/approve/${token}`;

    await updateContent(content.id, {
      status: "pending_approval",
      clientReview: {
        email,
        sharedById: input.user.id,
        sharedAt: now(),
        expiresAt: new Date(issuedAt + ttlMs).toISOString(),
        link,
        status: "pending",
      },
    });
    shared += 1;
    titles.push(content.title);
  }

  if (shared === 0) {
    throw new Error(
      "No draft content to share — generate item drafts first, then send the pack.",
    );
  }

  await sendEmail({
    to: email,
    fromName: tenant?.branding?.emailFromName,
    subject: `Please review: ${campaign.name} (${shared} item${shared === 1 ? "" : "s"})`,
    html: `<p>${company.name} has a campaign pack ready for your approval.</p>
           <p><strong>${campaign.name}</strong> — ${shared} piece(s) waiting in your portal Approvals.</p>
           <ul>${titles
             .slice(0, 12)
             .map((t) => `<li>${t}</li>`)
             .join("")}</ul>
           <p><a href="${input.origin}/client/approvals">Open Approvals →</a></p>
           <p style="color:#888">Secure review links also work without logging in (7-day expiry).</p>`,
  });

  await logAction(input.user, "campaign.client_pack_shared", {
    targetType: "campaign",
    targetId: input.campaignId,
    companyId: campaign.companyId,
    detail: `Shared ${shared} item(s) with ${email}`,
  });

  return { shared, skipped, email };
}
