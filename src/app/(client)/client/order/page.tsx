import { redirect } from "next/navigation";

/** Order menu lives under Ask us — keep old URL working. */
export default function ClientOrderMenuRedirect() {
  redirect("/client/requests");
}
