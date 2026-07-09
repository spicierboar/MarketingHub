"use client";

import { useSearchParams } from "next/navigation";

export function LoginAuthError() {
  const params = useSearchParams();
  if (params.get("error") !== "auth") return null;
  return (
    <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      Sign-in link invalid or expired. Request a new link in this browser, then
      open the email without closing this tab.
    </p>
  );
}
