import { isProduction } from "@/lib/env";

export function publicApiLive(): boolean {
  const flag = process.env.PUBLIC_API_LIVE?.trim().toLowerCase();
  if (flag === "true" || flag === "1" || flag === "on") return true;
  if (flag === "false" || flag === "0" || flag === "off") return false;
  return !isProduction();
}