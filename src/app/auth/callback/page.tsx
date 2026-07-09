import { Suspense } from "react";
import { AuthCallbackClient } from "./auth-callback-client";

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <p className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          Signing you in…
        </p>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
