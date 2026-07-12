import Link from "next/link";
import type { ActivityHub } from "@/lib/client-activity-hubs";

/** Compact link grid for client-scoped activity surfaces (agency or portal). */
export function ActivityHubsGrid({
  hubs,
  title = "Under this client",
  subtitle,
}: {
  hubs: ActivityHub[];
  title?: string;
  subtitle?: string;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {hubs.map((hub) => (
          <li key={hub.id}>
            <Link
              href={hub.href}
              className="block h-full rounded-md border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <p className="text-sm font-medium text-primary">{hub.label}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {hub.blurb}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
