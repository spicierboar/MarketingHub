"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { FormModal } from "@/components/form-modal";
import { createCompanyAction } from "@/app/(app)/companies/actions";
import { cn } from "@/lib/utils";

export function AddClientModalTrigger({
  className,
  label = "Add client",
  variant = "default",
  size = "md",
  linkStyle,
}: {
  className?: string;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  /** Render as a text link instead of a button (empty-state CTAs). */
  linkStyle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [pending, startTransition] = useTransition();

  function openModal() {
    setError(null);
    setWebsite("");
    setOpen(true);
  }

  const willScrape = website.trim().length > 0;

  return (
    <>
      {linkStyle ? (
        <button
          type="button"
          className={cn("text-primary hover:underline", className)}
          onClick={openModal}
        >
          {label}
        </button>
      ) : (
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          onClick={openModal}
        >
          {label}
        </Button>
      )}

      {open && (
        <FormModal
          title="Add client"
          description="Add a website to auto-fill the profile from public pages (with consent)."
          onClose={() => setOpen(false)}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              const fd = new FormData(e.currentTarget);
              startTransition(async () => {
                try {
                  const result = await createCompanyAction(fd);
                  if (result?.error) setError(result.error);
                } catch (err) {
                  if (isRedirectError(err)) throw err;
                  setError(
                    err instanceof Error ? err.message : "Could not create client.",
                  );
                }
              });
            }}
          >
            <Field
              label="Client name"
              htmlFor="modal-client-name"
            >
              <Input
                id="modal-client-name"
                name="name"
                required
                autoFocus
                placeholder="e.g. Harbour Roasters"
                disabled={pending}
              />
            </Field>
            <Field
              label="Website"
              htmlFor="modal-client-website"
              hint="Optional but recommended — we scrape public pages to pre-fill onboarding."
            >
              <Input
                id="modal-client-website"
                name="website"
                type="text"
                inputMode="url"
                placeholder="https://example.com or example.com"
                disabled={pending}
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </Field>
            {willScrape && (
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  name="consent"
                  value="on"
                  required
                  disabled={pending}
                  className="mt-1"
                />
                <span>
                  Client consents to collecting publicly available information from
                  this website for onboarding.
                </span>
              </label>
            )}
            {error && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p>{error}</p>
                {/upgrade|billing|plan/i.test(error) && (
                  <Link
                    href="/billing"
                    className="mt-1 inline-block text-sm font-medium text-primary hover:underline"
                  >
                    Open Billing &amp; plan →
                  </Link>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending
                  ? willScrape
                    ? "Creating & scraping…"
                    : "Creating…"
                  : willScrape
                    ? "Create & scrape profile"
                    : "Create & start onboarding"}
              </Button>
            </div>
          </form>
        </FormModal>
      )}
    </>
  );
}

/** For places that need the buttonClasses string (rare). Prefer AddClientModalTrigger. */
export function addClientButtonClass(variant: "default" | "outline" = "default") {
  return buttonClasses(variant);
}
