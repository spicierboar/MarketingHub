import { NextResponse } from "next/server";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCompany } from "@/lib/auth/rbac";
import {
  getCampaign,
  getCompany,
  getContent,
  getOffer,
  listCampaignItems,
} from "@/lib/db";
import { logAction } from "@/lib/audit";
import { titleCase } from "@/lib/utils";

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Campaign pack export (Phase 4 go-live criterion: "campaign packs can be
// exported"): the full plan, briefs and any drafted content as a Word document.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign || !(await canAccessCompany(user, campaign.companyId))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const company = (await getCompany(campaign.companyId))!;
  const items = await listCampaignItems(campaign.id);
  const offer = campaign.offerId ? await getOffer(campaign.offerId) : undefined;

  const children: Paragraph[] = [
    new Paragraph({ text: campaign.name, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({ text: company.name, bold: true }),
        new TextRun({
          text: `  ·  ${campaign.durationDays}-day plan  ·  starts ${campaign.startDate}  ·  ${titleCase(campaign.status)}`,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Objective", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: campaign.objective }),
  ];

  if (campaign.keyMessage) {
    children.push(
      new Paragraph({ text: "Key message", heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: campaign.keyMessage }),
    );
  }
  if (campaign.audience) {
    children.push(
      new Paragraph({ text: "Audience", heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: campaign.audience }),
    );
  }
  if (offer) {
    children.push(
      new Paragraph({ text: "Offer", heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        text: `${offer.name} — “${offer.approvedWording}”${offer.endDate ? ` (ends ${offer.endDate})` : ""}`,
      }),
    );
  }
  if (campaign.eventName) {
    children.push(
      new Paragraph({ text: "Local event", heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        text: `${campaign.eventName}${campaign.eventDate ? ` — ${campaign.eventDate}` : ""}`,
      }),
    );
  }

  children.push(
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Content calendar", heading: HeadingLevel.HEADING_2 }),
  );

  for (const item of items) {
    const date = addDays(campaign.startDate, item.dayOffset - 1);
    children.push(
      new Paragraph({
        text: `Day ${item.dayOffset} (${date}) — ${item.title}`,
        heading: HeadingLevel.HEADING_3,
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: `${item.channel} · ${titleCase(item.contentType)} · ${titleCase(item.status)}`,
            italics: true,
            size: 18,
          }),
        ],
      }),
      new Paragraph({ text: `Brief: ${item.brief}` }),
    );
    const content = item.contentId ? await getContent(item.contentId) : undefined;
    if (content) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `Draft (${titleCase(content.status)}):`, bold: true }),
          ],
        }),
        ...content.body.split("\n").map((line) => new Paragraph({ text: line })),
      );
    }
    children.push(new Paragraph({ text: "" }));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);

  await logAction(user, "campaign.pack_exported", {
    targetType: "campaign",
    targetId: campaign.id,
    companyId: company.id,
    detail: campaign.name,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="campaign-pack-${campaign.id}.docx"`,
    },
  });
}
