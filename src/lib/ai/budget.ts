// AI usage/cost cap enforcement (Phase 10; per-tenant since T1). Called before
// any AI generation. In template mode runs cost $0 so this never bites; with a
// live Claude key it stops spend once the tenant's month-to-date cost hits the
// EFFECTIVE cap — the lower of the admin-set cap and the plan's AI allowance
// (T4). One tenant's spend never consumes another's cap — this is also the T4
// billing meter.

import { aiBudgetExceeded, aiTokenBudgetExceeded, effectiveAiCapUsd, effectiveAiTokenCap } from "@/lib/db";

export async function assertAiBudget(
  tenantId: string,
  estimatedTokens = 0,
): Promise<void> {
  if (await aiBudgetExceeded(tenantId)) {
    const cap = await effectiveAiCapUsd(tenantId);
    throw new Error(
      `AI monthly cost cap reached ($${cap}). Raise the cap in Admin & Security or upgrade the plan on the Billing page.`,
    );
  }
  if (await aiTokenBudgetExceeded(tenantId, estimatedTokens)) {
    const cap = await effectiveAiTokenCap(tenantId);
    throw new Error(
      `AI monthly token cap reached (${cap.toLocaleString()} tokens). Upgrade the plan on the Billing page.`,
    );
  }
}
