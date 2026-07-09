// Authorized media serving for the real-media DAM.
//
// Bytes are never public. Two ways to be authorized, and NOTHING else serves:
//   1. A signed-in user with access to the asset's company (tenant-checked).
//   2. A valid CLIENT-APPROVAL token (?t=) whose content actually references
//      this asset AND belongs to the same company/tenant — the no-login client
//      view. That path ALSO enforces the usage-rights/consent gate, so a
//      withdrawn or expired consent stops the image from being served to the
//      client (and, already, from being published).
// Anything unauthorized returns 404 — never confirm an asset exists across
// tenants. Object keys are validated in the storage layer (no path traversal).

import { NextRequest, NextResponse } from "next/server";
import { getAsset, getCompany, getContent } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { canAccessCompany } from "@/lib/auth/rbac";
import { assetUsableReason } from "@/lib/assets";
import { verifyPayload } from "@/lib/token";
import { getObject } from "@/lib/storage";

const notFound = () => new NextResponse("Not found", { status: 404 });

interface ApprovalTokenShape {
  tenantId: string;
  companyId: string;
  contentId: string;
  purpose: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  const asset = await getAsset(assetId);
  if (!asset || !asset.storedFile) return notFound();

  const token = new URL(req.url).searchParams.get("t");
  let authorized = false;
  let enforceConsent = false;

  if (token) {
    // Public client path: the token must resolve to content that references
    // THIS asset, in the token's own company/tenant.
    const p = verifyPayload<ApprovalTokenShape>(token, Date.now());
    if (p && p.purpose === "client_approval") {
      const content = await getContent(p.contentId);
      const company = content ? await getCompany(content.companyId) : undefined;
      if (
        content &&
        company &&
        content.companyId === p.companyId &&
        company.tenantId === p.tenantId &&
        content.companyId === asset.companyId &&
        (content.assetIds ?? []).includes(asset.id)
      ) {
        authorized = true;
        enforceConsent = true; // client-facing → consent/rights gate applies
      }
    }
  } else {
    // Internal path: a signed-in user with access to the asset's company.
    const user = await getCurrentUser();
    if (user && (await canAccessCompany(user, asset.companyId))) authorized = true;
  }

  if (!authorized) return notFound();

  // On the client-facing path, a blocked asset (withdrawn/expired consent,
  // expired licence, channel restriction) must not be served at all.
  if (enforceConsent && (await assetUsableReason(asset))) return notFound();

  const bytes = await getObject(asset.storedFile.key);
  if (!bytes) return notFound();

  // The stored MIME is client-declared, so only an allowlist may render INLINE
  // in our origin. Anything else (SVG, HTML, docs…) is forced to download as an
  // opaque attachment — a mislabelled `text/html`/`image/svg+xml` can never
  // execute script in the app's origin. nosniff keeps the browser honest.
  const mime = asset.storedFile.mimeType.toLowerCase();
  const inlineOk = INLINE_TYPES.has(mime);
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": inlineOk ? asset.storedFile.mimeType : "application/octet-stream",
      "Content-Disposition": inlineOk
        ? "inline"
        : `attachment; filename="${(asset.fileName ?? "download").replace(/[^\w.-]/g, "_")}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// MIME types safe to render inline in our origin (no scriptable formats — SVG
// and HTML are deliberately excluded and served as downloads instead).
const INLINE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "application/pdf",
]);
