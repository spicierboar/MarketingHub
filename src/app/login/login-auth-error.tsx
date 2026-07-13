"use client";

import { useSearchParams } from "next/navigation";

export function LoginAuthError() {
  const params = useSearchParams();
  if (params.get("error") !== "auth") return null;
  const reason = (params.get("reason") || "").toLowerCase();
  const expired =
    reason.includes("otp_expired") ||
    reason.includes("expired") ||
    reason.includes("invalid");
  return (
    <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {expired
        ? "Sign-in link invalid or expired."
        : "Sign-in could not be completed."}{" "}
      Request a new link on this exact Preview URL (same browser tab), then open
      the email without switching hosts or browsers. Prefer the stable branch URL
      (contains <code className="text-xs">-git-staging-</code>), not a one-off
      deployment URL.
    </p>
  );
}
