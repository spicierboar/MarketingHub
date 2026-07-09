// Public connect-invite loader — guest-facing /connect/[token] page.
// The invite token is the capability; service context scopes reads/writes.

import { getCompany, getConnectInviteByToken, getUser } from "@/lib/db";
import { getServiceSupabase, isSupabaseConfigured } from "@/lib/db/supabase";
import { runInServiceContext } from "@/lib/db/service-context";
import { toDomain } from "@/lib/db/mapper";
import {
  inviteIsUsable,
  markInviteExpiredIfNeeded,
  oauthAvailableForPlatform,
} from "@/lib/connect-invites";
import type { Company, ConnectInvite } from "@/lib/types";

const COMPANY_ALIAS = { created_by: "createdBy" } as const;

export interface PublicConnectInviteView {
  invite: ConnectInvite;
  company: Company;
  tenantName: string;
  oauthAvailable: boolean;
  inviterName?: string;
}

async function resolveInviteToken(token: string): Promise<ConnectInvite | null> {
  const direct = await getConnectInviteByToken(token);
  if (direct) return direct;
  if (!isSupabaseConfigured()) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb.from("connect_invites").select("*").eq("token", token).maybeSingle();
  if (!data) return null;
  return toDomain<ConnectInvite>(data);
}

export async function loadPublicConnectInvite(
  token: string,
): Promise<PublicConnectInviteView | null> {
  const raw = await resolveInviteToken(token);
  if (!raw) return null;

  return runInServiceContext(raw.tenantId, async () => {
    let invite = await markInviteExpiredIfNeeded(raw);
    if (!inviteIsUsable(invite) && invite.status === "pending") {
      invite = (await markInviteExpiredIfNeeded(invite)) ?? invite;
    }

    const company = await getCompany(invite.companyId);
    if (!company || company.tenantId !== invite.tenantId || company.status === "archived") {
      return null;
    }

    const sb = getServiceSupabase();
    const tenantRow = sb
      ? (await sb.from("tenants").select("name").eq("id", invite.tenantId).maybeSingle()).data
      : null;
    const inviter = await getUser(invite.invitedById);

    return {
      invite,
      company,
      tenantName: (tenantRow?.name as string | undefined) ?? "your marketing team",
      oauthAvailable: oauthAvailableForPlatform(invite.platform),
      inviterName: inviter?.name,
    };
  });
}
