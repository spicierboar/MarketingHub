import Link from "next/link";
import {
  requireAdmin,
  isTenantOwner,
  isPlatformAdmin,
} from "@/lib/auth/rbac";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users,
  Palette,
  CreditCard,
  ShieldAlert,
  Lock,
  Bot,
  MessageSquareCode,
  Code2,
  ScrollText,
  Landmark,
  type LucideIcon,
} from "lucide-react";

type HubLink = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  ownerOnly?: boolean;
  platformAdminOnly?: boolean;
};

type HubSection = {
  title: string;
  links: HubLink[];
};

const SECTIONS: HubSection[] = [
  {
    title: "People & brand",
    links: [
      {
        href: "/users",
        label: "Users",
        description: "Roles, access, and team membership.",
        icon: Users,
      },
      {
        href: "/branding",
        label: "Branding",
        description: "Workspace logo and accent colour.",
        icon: Palette,
        ownerOnly: true,
      },
    ],
  },
  {
    title: "Billing",
    links: [
      {
        href: "/billing",
        label: "Billing & plan",
        description: "Subscription, invoices, and plan limits.",
        icon: CreditCard,
        ownerOnly: true,
      },
    ],
  },
  {
    title: "Security & compliance",
    links: [
      {
        href: "/admin",
        label: "Admin & security",
        description: "Crisis mode, sandbox, MFA, and system health.",
        icon: ShieldAlert,
      },
      {
        href: "/privacy",
        label: "Privacy",
        description: "Consents, retention, and data subject requests.",
        icon: Lock,
      },
      {
        href: "/audit",
        label: "Audit log",
        description: "Append-only record of material actions.",
        icon: ScrollText,
      },
    ],
  },
  {
    title: "AI configuration",
    links: [
      {
        href: "/ai-control",
        label: "AI control",
        description: "Budgets, kill switches, and generation gates.",
        icon: Bot,
      },
      {
        href: "/ai-prompts",
        label: "AI prompts",
        description: "Prompt templates used across drafting flows.",
        icon: MessageSquareCode,
      },
    ],
  },
  {
    title: "Platform",
    links: [
      {
        href: "/developers",
        label: "Developers & API",
        description: "API keys, webhooks, and partner integrations.",
        icon: Code2,
      },
      {
        href: "/platform-admin",
        label: "Platform admin",
        description: "Cross-tenant operator tools.",
        icon: Landmark,
        platformAdminOnly: true,
      },
    ],
  },
];

export default async function SettingsHubPage() {
  const user = await requireAdmin();
  const owner = isTenantOwner(user);
  const platform = isPlatformAdmin(user);

  const sections = SECTIONS.map((section) => ({
    ...section,
    links: section.links.filter(
      (link) =>
        (!link.ownerOnly || owner) && (!link.platformAdminOnly || platform),
    ),
  })).filter((section) => section.links.length > 0);

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Workspace configuration, security, AI controls, and platform tools."
        explainerId="settings-hub"
        explainer="Day-to-day delivery and catalogs live in the sidebar. This hub is for admin, billing, and configuration."
      />

      <div className="space-y-8 p-6">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {section.links.map((link) => {
                const Icon = link.icon;
                return (
                  <Link key={link.href} href={link.href} className="group block">
                    <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-muted/40">
                      <CardContent className="flex gap-3 p-4">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground group-hover:text-primary">
                            {link.label}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {link.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
