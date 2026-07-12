import { redirect } from "next/navigation";

/** Alias under Schedule & results — canonical calendar lives at /client/calendar. */
export default function ClientScheduleAliasPage() {
  redirect("/client/calendar");
}
