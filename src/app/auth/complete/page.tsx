import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { postLoginRedirectPath } from "@/lib/auth/rbac";

// Server-side post-auth landing: resolves portal vs owner-onboarding vs dashboard.
export default async function AuthCompletePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(await postLoginRedirectPath(user));
}
