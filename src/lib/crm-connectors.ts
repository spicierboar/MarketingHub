export function crmLive(): boolean { return process.env.CRM_LIVE === "true"; }
export function crmApiKey(): string | undefined { return process.env.CRM_API_KEY?.trim() || undefined; }
