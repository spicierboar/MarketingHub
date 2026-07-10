"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUserByEmail } from "@/lib/db";
import { startSession, endSession, getCurrentUser } from "@/lib/auth/session";
import { postLoginRedirectPath } from "@/lib/auth/rbac";
import { resetStore } from "@/lib/db/store";
import { localDemoEnabled, devToolsOpen } from "@/lib/env";
import { logAction } from "@/lib/audit";

function assertDevTools() {
  if (!devToolsOpen()) {
    throw new Error("Dev tools are locked in production.");
  }
}

/** Re-seed in-memory demo data (Wattle + BrightSpark). */
export async function seedDemoDataAction(_formData?: FormData): Promise<void> {
  assertDevTools();
  if (!localDemoEnabled()) {
    throw new Error(
      "Enable CC_LOCAL_DEMO=true and NEXT_PUBLIC_CC_LOCAL_DEMO=true, then restart npm run dev.",
    );
  }
  resetStore();
  revalidatePath("/", "layout");
  redirect("/dev?seeded=1");
}

/** Clear session + re-seed (fresh demo). */
export async function clearAndReseedAction(_formData?: FormData): Promise<void> {
  assertDevTools();
  if (!localDemoEnabled()) {
    throw new Error(
      "Enable CC_LOCAL_DEMO=true and NEXT_PUBLIC_CC_LOCAL_DEMO=true, then restart npm run dev.",
    );
  }
  await endSession();
  resetStore();
  revalidatePath("/", "layout");
  redirect("/dev?cleared=1");
}

/** Instant cookie login as a seeded demo user (bypasses magic link). */
export async function quickLoginAction(formData: FormData): Promise<void> {
  assertDevTools();
  if (!localDemoEnabled()) {
    throw new Error(
      "Enable CC_LOCAL_DEMO=true and NEXT_PUBLIC_CC_LOCAL_DEMO=true, then restart npm run dev.",
    );
  }
  const email = String(formData.get("email") || "").trim();
  const user = await getUserByEmail(email);
  if (!user) throw new Error(`No seeded account for ${email}`);
  if (!user.active) throw new Error("Account deactivated.");
  await startSession(user.id);
  await logAction(user, "user.login", { detail: "Dev tools quick-login" });
  const acting = await getCurrentUser();
  redirect(acting ? await postLoginRedirectPath(acting) : "/dashboard");
}
