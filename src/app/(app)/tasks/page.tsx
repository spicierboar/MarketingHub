import { redirect } from "next/navigation";

/** Manual task lists are retired — AI recommendations drive work into drafts. */
export default function TasksRedirectPage() {
  redirect("/recommendations");
}
