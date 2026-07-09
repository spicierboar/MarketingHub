import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GbpAuditCheck, GbpAuditResult } from "@/lib/gbp-audit";

const STATUS_TONE: Record<GbpAuditCheck["status"], "success" | "warning" | "danger" | "neutral" | "info"> = {
  pass: "success",
  warn: "warning",
  fail: "danger",
  info: "info",
};

const CATEGORY_LABEL: Record<GbpAuditCheck["category"], string> = {
  connect: "Connection",
  nap: "NAP",
  hours: "Hours",
  categories: "Categories",
  photos: "Photos",
  faq: "FAQ",
};

export function GbpAuditPanel({ audit }: { audit: GbpAuditResult }) {
  const fails = audit.checks.filter((c) => c.status === "fail");
  const warns = audit.checks.filter((c) => c.status === "warn");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Audit score</p>
            <p className="text-3xl font-bold">{audit.score}</p>
            <p className="text-xs text-muted-foreground">
              {audit.mode === "live" ? "Live GBP API" : "Simulated listing"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">GBP connected</p>
            <p className="text-2xl font-bold">{audit.gbpConnected ? "Yes" : "No"}</p>
            <p className="text-xs text-muted-foreground">
              {audit.gbpConnected ? audit.snapshot.source : "Connect to compare listing"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Fixes needed</p>
            <p className="text-2xl font-bold">{fails.length + warns.length}</p>
            <p className="text-xs text-muted-foreground">
              {fails.length} critical · {warns.length} warnings
            </p>
          </CardContent>
        </Card>
      </div>

      {fails.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-base">Priority fixes</CardTitle>
            <CardDescription>Address these before the next local SEO review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {fails.map((c) => (
              <FixRow key={c.id} check={c} />
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Full audit checklist</CardTitle>
          <CardDescription>
            NAP, hours, categories, photos and FAQ vs{" "}
            {audit.gbpConnected ? "connected GBP profile" : "profile-only baseline"}.
            Last run: {new Date(audit.ranAt).toLocaleString()}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {audit.checks.map((c) => (
            <div key={c.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                <Badge tone="neutral">{CATEGORY_LABEL[c.category]}</Badge>
                <span className="font-medium">{c.title}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{c.detail}</p>
              <FixRow check={c} compact />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function FixRow({ check, compact }: { check: GbpAuditCheck; compact?: boolean }) {
  return (
    <div className={compact ? "mt-2 flex flex-wrap items-center gap-2 text-sm" : "flex flex-wrap items-start justify-between gap-3"}>
      <p className={compact ? "text-muted-foreground" : "text-sm"}>
        <span className="font-medium text-foreground">Fix: </span>
        {check.fixAction}
      </p>
      {check.fixHref && (
        <Link
          href={check.fixHref}
          className="shrink-0 text-sm text-primary hover:underline"
        >
          Go →
        </Link>
      )}
    </div>
  );
}
