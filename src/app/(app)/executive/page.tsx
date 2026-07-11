import { redirect } from "next/navigation";

/** Executive scorecards live on the main Dashboard — keep old URL working. */
export default function ExecutiveRedirectPage() {
  redirect("/dashboard#clients");
}
