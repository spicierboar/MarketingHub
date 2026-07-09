"use server";

import { revalidatePath } from "next/cache";
import { getTenant, updateTenant } from "@/lib/db";
import { requireTenantOwner } from "@/lib/auth/rbac";
import { planIncludesWhiteLabel } from "@/lib/billing";
import { logAction } from "@/lib/audit";
import type { TenantBranding } from "@/lib/types";

function text(fd: FormData, key: string): string | undefined {
  const v = String(fd.get(key) || "").trim();
  return v || undefined;
}

// Normalise a hex colour, else drop it (never trust raw input into a style var).
function hex(fd: FormData, key: string): string | undefined {
  const v = String(fd.get(key) || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined;
}

// Only accept an http(s) URL for the logo — it is rendered into <img src> on
// the PUBLIC client page, so reject javascript:/data: and other schemes.
function httpUrl(fd: FormData, key: string): string | undefined {
  const v = String(fd.get(key) || "").trim();
  if (!v) return undefined;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

// Save white-label branding — OWNER-only, plan-gated, always on the session
// tenant (never a tenant id from the form).
export async function saveBrandingAction(formData: FormData) {
  const user = await requireTenantOwner();
  if (!(await planIncludesWhiteLabel(user.tenantId))) {
    throw new Error("White-label branding is not included in your plan. Upgrade on the Billing page.");
  }
  const tenant = await getTenant(user.tenantId);
  if (!tenant) throw new Error("Workspace not found.");

  const branding: TenantBranding = {
    accentColor: hex(formData, "accentColor"),
    logoUrl: httpUrl(formData, "logoUrl"),
    emailFromName: text(formData, "emailFromName"),
    approvalMessage: text(formData, "approvalMessage"),
  };
  await updateTenant(user.tenantId, { branding });
  await logAction(user, "tenant.branding_saved", {
    targetType: "tenant",
    targetId: user.tenantId,
    detail: [branding.accentColor, branding.emailFromName].filter(Boolean).join(" · ") || "cleared",
  });
  revalidatePath("/branding");
  revalidatePath("/", "layout");
}
