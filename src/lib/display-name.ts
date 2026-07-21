/**
 * First name for greetings — strips fixture / role prefixes that would
 * otherwise render as "Welcome, Client" or "Operations · Staging".
 */
export function displayGivenName(fullName: string, fallback = "there"): string {
  let cleaned = fullName.trim();
  cleaned = cleaned
    .replace(/^Client Approver\s*[—–-]\s*/i, "")
    .replace(/^Staging Agency\s+/i, "")
    .replace(/^Staging Content Staff\s+\d+\s*/i, "")
    .trim();
  const token = cleaned.split(/\s+/)[0] ?? "";
  if (!token || /^(client|approver|admin|staff|staging|test)$/i.test(token)) {
    return fallback;
  }
  return token;
}
