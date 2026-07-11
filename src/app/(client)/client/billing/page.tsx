import { redirect } from "next/navigation";

/** Friendly alias — nav label is Billing; canonical path remains /client/payments. */
export default function ClientBillingAliasPage() {
  redirect("/client/payments");
}
