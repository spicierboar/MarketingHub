// Client-facing status copy for managed delivery runs.
// Keys are stored on ManagedDeliveryRun.statusMessageKey.

const STATUS_COPY: Record<string, string> = {
  strategy_preparing: "Your strategy is being prepared",
  strategy_ready: "Your strategy is ready for review",
  calendar_updated: "Your social media calendar has been updated",
  content_ready: "Your content is ready for review",
  approval_required: "Your approval is required",
  delivery_active: "Your marketing is live and being managed",
  campaign_optimised: "Your campaign has been optimised",
  payment_attention: "Your payment method requires attention",
  report_ready: "Your monthly report is ready",
  delivery_blocked: "We need a little more information to continue",
  delivery_failed: "We hit a problem preparing your marketing — our team will follow up",
};

export function clientStatusMessage(key: string): string {
  return STATUS_COPY[key] ?? "Your marketing is being prepared";
}
