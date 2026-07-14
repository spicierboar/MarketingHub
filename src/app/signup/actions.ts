"use server";

import { redirect } from "next/navigation";
import {
  addMembership,
  createTenant,
  createUser,
  getUserByEmail,
} from "@/lib/db";
import { setActiveTenant, startSession } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { assertPublicRate, clientIp } from "@/lib/ratelimit";
import { logAction } from "@/lib/audit";

// Self-serve client signup. Provisions a temporary HOLDING tenant so the
// onboarding wizard (owner-gated) can run; payment attaches a company under
// the platform agency and converts the user to a portal member.
export async function signUpAction(_prev: unknown, formData: FormData) {
  const orgName = String(formData.get("orgName") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  if (!orgName || !name || !email) {
    return { error: "Workspace name, your name and email are all required." };
  }

  // Throttle anonymous workspace creation per IP (T7): self-serve signup is an
  // unauthenticated write, so cap it before provisioning anything.
  try {
    await assertPublicRate("signup", await clientIp());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Too many sign-up attempts — please try again later." };
  }

  // Production: Supabase Auth owns signup (magic link / OAuth). This demo path
  // provisions directly so it runs with zero accounts.
  if (isSupabaseConfigured()) {
    return {
      error:
        "Sign-up runs through Supabase Auth in production — use the sign-in link.",
    };
  }

  const tenant = await createTenant({
    name: orgName,
    // Holding seat for the client wizard only — payment migrates the company
    // onto the platform agency and suspends this row. Never create agency SaaS.
    kind: "business_group",
    plan: "starter",
    status: "active",
  });

  // Link or create the identity, then make them OWNER of the holding seat
  // (wizard requires requireTenantOwnerRaw). Completion converts them to a
  // portal member on the platform agency.
  const existing = await getUserByEmail(email);
  const user = existing ?? (await createUser({ email, name, role: "user" }));
  await addMembership({ tenantId: tenant.id, userId: user.id, role: "owner" });

  await logAction({ id: user.id, email: user.email, tenantId: tenant.id }, "tenant.created", {
    tenantId: tenant.id,
    detail: `${orgName} (client-holding → platform agency on payment)`,
  });

  await startSession(user.id);
  // Land them in the holding seat they just created (they may belong to others).
  await setActiveTenant(user.id, tenant.id);
  // Client onboarding (details → marketing package → T&C → payment).
  // Agency SaaS / white-label signup is parked — we are the agency; signup = client.
  redirect("/onboarding");
}
