// Export approved content to CSV or Word (master prompt Phase 1 feature).

import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import type { Company, ContentItem } from "@/lib/types";
import { formatDate, titleCase } from "@/lib/utils";

function csvCell(v: string): string {
  const s = (v ?? "").toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function contentToCsv(
  items: ContentItem[],
  companyName: (id: string) => string,
): string {
  const header = [
    "id",
    "company",
    "type",
    "title",
    "status",
    "risk",
    "approvedAt",
    "body",
  ];
  const rows = items.map((c) =>
    [
      c.id,
      companyName(c.companyId),
      titleCase(c.type),
      c.title,
      titleCase(c.status),
      c.compliance?.riskLevel ?? "",
      c.approvedAt ?? "",
      c.body,
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\r\n");
}

export async function contentToDocx(
  item: ContentItem,
  company: Company,
): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: item.title, heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun({ text: `${company.name}`, bold: true }),
              new TextRun({
                text: `  ·  ${titleCase(item.type)}  ·  ${titleCase(item.status)}`,
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Approved: ${formatDate(item.approvedAt)}   Model: ${item.aiModel ?? "—"}`,
                italics: true,
                size: 18,
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          ...item.body
            .split("\n")
            .map((line) => new Paragraph({ text: line })),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
