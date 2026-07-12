import { ADDONS } from "@/lib/addons";
import {
  formatVisualsRemaining,
  type VisualsAllowanceSummary,
} from "@/lib/visuals-allowance";
import {
  disableAddonAction,
  enableAddonAction,
} from "@/app/(app)/billing/actions";
import { Button } from "@/components/ui/button";
import type { AddonId } from "@/lib/types";

const CONTENT_ADDONS: AddonId[] = ["video", "photo"];

/**
 * Quota summary + enable/disable for content-creation add-ons (AI video, photo).
 * Lives on AI Visuals so agency/client manage extras in context of creating content.
 * Billing page keeps the full matrix; signup no longer offers these.
 */
export function VisualsQuotaAddonsPanel({
  companyId,
  allowance,
  addons,
  canManageAddons,
}: {
  companyId: string;
  allowance: VisualsAllowanceSummary;
  addons: Record<AddonId, boolean>;
  canManageAddons: boolean;
}) {
  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p>
          <span className="font-medium text-foreground">AI images:</span>{" "}
          <span className="text-muted-foreground">
            {formatVisualsRemaining(allowance.images)}
          </span>
          {!allowance.images.unlimited && (
            <span className="text-muted-foreground">
              {" "}
              ({allowance.images.used} used · package {allowance.imageQuotaPerMonth}/mo)
            </span>
          )}
        </p>
        <p>
          <span className="font-medium text-foreground">AI short videos:</span>{" "}
          <span className="text-muted-foreground">
            {formatVisualsRemaining(allowance.videos)}
          </span>
          {!allowance.videos.unlimited && (
            <span className="text-muted-foreground">
              {" "}
              ({allowance.videos.used} used · package {allowance.videoQuotaPerMonth}/mo)
            </span>
          )}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Free quotas reset each calendar month ({allowance.periodKey}). Ads media spend is
        always extra. Over free quota, enable the AI video add-on for unlimited image +
        video generation.
        {allowance.packageIncludesVideo
          ? " This package includes AI video (unlimited)."
          : null}
      </p>

      <div className="space-y-2">
        <p className="text-sm font-medium">Content add-ons</p>
        {CONTENT_ADDONS.map((id) => {
          const on = addons[id];
          const def = ADDONS[id];
          return (
            <div
              key={id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium">
                  {def.icon} {def.name}
                </span>
                <span className="ml-2 text-muted-foreground">
                  A${def.priceAudMonthly}/mo · {on ? "On" : "Off"}
                </span>
                {id === "video" && allowance.packageIncludesVideo && !on ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (included in package)
                  </span>
                ) : null}
              </div>
              {canManageAddons ? (
                <form action={on ? disableAddonAction : enableAddonAction}>
                  <input type="hidden" name="companyId" value={companyId} />
                  <input type="hidden" name="addonId" value={id} />
                  <Button type="submit" size="sm" variant={on ? "secondary" : "default"}>
                    {on ? "Disable" : "Enable"}
                  </Button>
                </form>
              ) : (
                <a href="/billing" className="text-primary underline text-xs">
                  Manage on Billing
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
