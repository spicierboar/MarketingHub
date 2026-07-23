"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonClasses } from "@/components/ui/button";
import { FormModal } from "@/components/form-modal";

/** Success dialog after any Extras “Pay and place order” — stays on /client/order. */
export function ClientOrderPlacedModal({ requestId }: { requestId: string }) {
  const router = useRouter();
  const close = () => {
    router.replace("/client/order", { scroll: false });
  };

  return (
    <FormModal
      title="Order placed"
      description="We've sent this to your agency. Nothing publishes without your approval."
      onClose={close}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          You can keep browsing Extras, or open the request to track progress.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={close}>
            Back to Extras
          </Button>
          <Link
            href={`/client/requests/${requestId}`}
            className={buttonClasses("default", "md")}
          >
            View request
          </Link>
        </div>
      </div>
    </FormModal>
  );
}
