import { requireAdmin } from "@/lib/auth/rbac";
import {
  getLoyaltyProgram,
  listCompanies,
  listLoyaltyCoupons,
  listLoyaltyMembers,
  listLoyaltyRedemptions,
  listLoyaltyReferrals,
  listLoyaltyTiers,
} from "@/lib/db";
import { loyaltyLive } from "@/lib/loyalty";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { createCouponAction, createTierAction, enrollMemberAction, recordReferralAction } from "./actions";

export default async function LoyaltyPage({ searchParams }: { searchParams: Promise<{ company?: string }> }) {
  const user = await requireAdmin();
  const params = await searchParams;
  const companies = (await listCompanies(user.tenantId)).filter((c) => c.status !== "archived");
  const companyId = params.company ?? companies[0]?.id;
  const [tiers, members, coupons, referrals, redemptions, program] = companyId
    ? await Promise.all([
        listLoyaltyTiers(user.tenantId, companyId),
        listLoyaltyMembers(user.tenantId, companyId),
        listLoyaltyCoupons(user.tenantId, companyId),
        listLoyaltyReferrals(user.tenantId, companyId),
        listLoyaltyRedemptions(user.tenantId, companyId),
        getLoyaltyProgram(companyId),
      ])
    : [[], [], [], [], [], undefined];

  return (
    <div className="space-y-6 p-6">
      <PageHeader title="Loyalty" description="Tiers, points, coupons, referrals, and redemption tracking." />
      <Badge tone={loyaltyLive() ? "success" : "neutral"}>{loyaltyLive() ? "LOYALTY_LIVE on" : "Simulated redemption"}</Badge>
      <Card><CardContent className="p-4">
        <form method="get">
          <Select name="company" defaultValue={companyId}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Button type="submit">View</Button>
        </form>
      </CardContent></Card>
      {companyId && (
        <>
          <p className="text-sm text-muted-foreground">
            Program: {program?.enabled ? program.rewardMode : "not configured"} · members {members.length} · redemptions {redemptions.length}
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardContent className="space-y-3 p-4">
              <h3 className="font-medium">Add tier</h3>
              <form action={createTierAction} className="space-y-3">
                <input type="hidden" name="companyId" value={companyId} />
                <Field label="Name" hint="Tier label customers see">
                  <Input name="name" required placeholder="e.g. Gold" />
                </Field>
                <Field label="Points threshold" hint="Points needed to unlock">
                  <Input
                    name="thresholdPoints"
                    type="number"
                    min={0}
                    defaultValue={500}
                    placeholder="500"
                  />
                </Field>
                <Field label="Benefits" hint="Short perk summary">
                  <Input name="benefits" placeholder="e.g. 10% off + free coffee" />
                </Field>
                <Button type="submit">Add tier</Button>
              </form>
            </CardContent></Card>
            <Card><CardContent className="space-y-3 p-4">
              <h3 className="font-medium">Enroll member</h3>
              <form action={enrollMemberAction} className="space-y-3">
                <input type="hidden" name="companyId" value={companyId} />
                <Field label="Name" hint="How they appear in the program">
                  <Input name="displayName" required placeholder="e.g. Sam Chen" />
                </Field>
                <Field label="Email" hint="Optional — for referrals and receipts">
                  <Input
                    name="email"
                    type="email"
                    placeholder="e.g. sam@example.com"
                  />
                </Field>
                <Button type="submit">Enroll</Button>
              </form>
            </CardContent></Card>
            <Card><CardContent className="space-y-3 p-4">
              <h3 className="font-medium">Create coupon</h3>
              <form action={createCouponAction} className="space-y-3">
                <input type="hidden" name="companyId" value={companyId} />
                <Field label="Code" hint="What the customer enters">
                  <Input name="code" required placeholder="SUMMER10" />
                </Field>
                <Field label="Name" hint="Internal / receipt label">
                  <Input name="name" required placeholder="e.g. Summer 10% off" />
                </Field>
                <Field label="Segment tag" hint="Blank = all members">
                  <Input name="segmentTag" placeholder="vip" />
                </Field>
                <Field label="Value" hint="Discount amount or percent points">
                  <Input name="value" type="number" defaultValue={10} placeholder="10" />
                </Field>
                <Button type="submit">Create offer</Button>
              </form>
            </CardContent></Card>
            <Card><CardContent className="space-y-3 p-4">
              <h3 className="font-medium">Record referral</h3>
              <form action={recordReferralAction} className="space-y-3">
                <input type="hidden" name="companyId" value={companyId} />
                <Field label="Referrer member">
                  <Select name="memberId" defaultValue={members[0]?.id}>
                    {members.length === 0 ? (
                      <option value="">Enroll a member first</option>
                    ) : (
                      members.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))
                    )}
                  </Select>
                </Field>
                <Field label="Referee email" hint="Person being referred">
                  <Input
                    name="refereeEmail"
                    type="email"
                    required
                    placeholder="e.g. friend@example.com"
                  />
                </Field>
                <Button type="submit">Track referral</Button>
              </form>
            </CardContent></Card>
          </div>
          <Card><CardContent className="p-4">
            <h3 className="mb-2 font-medium">Tiers</h3>
            <ul>{tiers.map((t) => <li key={t.id}>{t.name} — {t.thresholdPoints} pts · {t.benefits}</li>)}</ul>
            <h3 className="mb-2 mt-4 font-medium">Members</h3>
            <ul>{members.map((m) => <li key={m.id}>{m.displayName} — {m.pointsBalance} pts · code {m.referralCode}</li>)}</ul>
            <h3 className="mb-2 mt-4 font-medium">Coupons</h3>
            <ul>{coupons.map((c) => <li key={c.id}>{c.code} — {c.name} ({c.segmentTag ?? "all"}) · redeemed {c.redemptionCount}</li>)}</ul>
            <h3 className="mb-2 mt-4 font-medium">Referrals</h3>
            <ul>{referrals.map((r) => <li key={r.id}>{r.refereeEmail} — {r.status}</li>)}</ul>
          </CardContent></Card>
        </>
      )}
    </div>
  );
}
