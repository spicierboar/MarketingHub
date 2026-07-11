// Share a campaign's drafted content pack into the client Approvals queue.
// Runs quality routing first (critique gate) — never publishes or spends.
// FAIL/ESCALATE items stay on agency hold; staff must fix before client sees them.

import { logAction } from "@/lib/audit";
import {
  getCampaign,
  getCompany,
  getContent,
  getTenant,
  listCampaignItems,
} from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  applyQualityRoutingAfterDraft,
  submitHeldContentToClient,
} from "@/lib/managed-service/quality-routing";
import type { ActingUser, ContentItem } from "@/lib/types";

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
}): Promise<{ shared: number; skipped: number; held: number; email: string }> {
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
  let held = 0;
  const titles: string[] = [];

  for (const item of items) {
    if (!item.contentId) {
      skipped += 1;
      continue;
    }
    let content = await getContent(item.contentId);
    if (!content || content.companyId !== campaign.companyId) {
      skipped += 1;
      continue;
    }
    if (!SHAREABLE.includes(content.status)) {
      skipped += 1;
      continue;
    }

    // Already with the client.
    if (content.clientReview?.status === "pending") {
      shared += 1;
      titles.push(content.title);
      continue;
    }

    // Fresh drafts: quality gate first.
    if (content.status === "ai_draft" || content.status === "user_edited" || content.status === "changes_required") {
      const routed = await applyQualityRoutingAfterDraft({
        contentId: content.id,
        actor: input.user,
        origin: input.origin,
      });
      content = routed.content;
      if (routed.decision === "auto_submit_client" && content.clientReview?.status === "pending") {
        shared += 1;
        titles.push(content.title);
        continue;
      }
      if (routed.gate === "fail" || routed.gate === "escalate") {
        held += 1;
        continue;
      }
    }

    // Agency hold (e.g. approval service level) — staff pack send is explicit.
    if (
      content.qualityRouting?.decision === "hold_agency" &&
      (content.qualityRouting.gate === "fail" || content.qualityRouting.gate === "escalate")
    ) {
      held += 1;
      continue;
    }

    try {
      content = await submitHeldContentToClient({
        contentId: content.id,
        actor: input.user,
        origin: input.origin,
        clientEmail: email,
      });
      shared += 1;
      titles.push(content.title);
    } catch {
      skipped += 1;
    }
  }

  if (shared === 0 && held === 0) {
    throw new Error(
      "No draft content to share — generate item drafts first, then send the pack.",
    );
  }
  if (shared === 0 && held > 0) {
    throw new Error(
      `${held} item(s) failed quality checks and were held for agency review. Fix them, then send again.`,
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
           <p style="color:#888">Approve means we can schedule after our usual checks — nothing goes live without those gates.</p>`,
  });

  await logAction(input.user, "campaign.client_pack_shared", {
    targetType: "campaign",
    targetId: input.campaignId,
    companyId: campaign.companyId,
    detail: `Shared ${shared} · held ${held} · skipped ${skipped} with ${email}`,
  });

  return { shared, skipped, held, email };
}
