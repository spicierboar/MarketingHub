"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

export function ActionSubmitButton({
  pendingLabel = "Saving…",
  children,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} disabled={pending || props.disabled} aria-busy={pending}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
