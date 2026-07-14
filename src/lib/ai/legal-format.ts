// Format pasted Terms / Privacy text for agency Settings legal editors.
// Claude when configured; deterministic whitespace/heading cleanup otherwise.
// Never invents legal obligations — only structure and presentation.

import { AI_MODEL, callClaudeDetailed } from "@/lib/ai/claude";
import type { LegalDocKind } from "@/lib/types";

const SYSTEM = [
  "You format Australian SaaS legal document text (Terms of Service or Privacy Policy).",
  "Improve structure only: clear headings, short paragraphs, numbered sections where already implied,",
  "consistent spacing, and a professional Australian legal tone (use Australian English spelling).",
  "CRITICAL RULES:",
  "- Do NOT invent, add, or remove legal obligations, rights, definitions, or parties.",
  "- Preserve the original meaning and substance of every clause.",
  "- Do NOT invent jurisdiction-specific requirements (ACL, Privacy Act, etc.) that are not already present.",
  "- Do NOT wrap the result in markdown code fences.",
  "- Return ONLY the cleaned document body as plain text.",
  "- Use ALL-CAPS or Title Case section headings; keep numbered clauses (1., 1.1) when they exist.",
].join("\n");

export async function formatLegalDocBody(
  kind: LegalDocKind,
  body: string,
): Promise<{ text: string; model: string; inputTokens?: number; outputTokens?: number }> {
  const trimmed = body.trim();
  if (!trimmed) return { text: "", model: "template (empty)" };

  const label = kind === "privacy" ? "Privacy Policy" : "Terms of Service";
  const user = [
    `Document type: ${label}`,
    "Format the following pasted text professionally without changing legal meaning:",
    "",
    trimmed,
  ].join("\n");

  const result = await callClaudeDetailed(SYSTEM, user, 4096);
  if (result?.text) {
    return {
      text: stripCodeFence(result.text),
      model: AI_MODEL,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    };
  }

  return { text: templateFormatLegalBody(trimmed), model: "template (no API key)" };
}

function stripCodeFence(text: string): string {
  return text
    .replace(/^```(?:\w+)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

/** Deterministic formatter: whitespace, blank lines before headings, light numbering cleanup. */
export function templateFormatLegalBody(raw: string): string {
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");

  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/[ \t]+$/g, "");
    const prev = out[out.length - 1];
    const isBlank = line.trim() === "";
    const heading = isHeadingLine(line);

    if (isBlank) {
      if (prev !== undefined && prev !== "") out.push("");
      continue;
    }

    if (heading && prev !== undefined && prev !== "") {
      out.push("");
    }

    out.push(line.trimEnd());
  }

  // Collapse leftover triple blanks and ensure single trailing newline.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 100) return false;
  // Numbered section: "1.", "1.1", "Section 2"
  if (/^(\d+(\.\d+)*\.?|[A-Z]\.|Section\s+\d+)\s+\S/i.test(t)) return true;
  // ALL CAPS short title (allow digits/punctuation)
  const letters = t.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 4 && letters === letters.toUpperCase() && !/[.!?]$/.test(t)) {
    return true;
  }
  // Title-like line ending with colon
  if (/^[A-Z][\w\s,'/-]{2,60}:$/.test(t)) return true;
  return false;
}
