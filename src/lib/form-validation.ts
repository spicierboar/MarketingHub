/**
 * Shared client + server form validators for high-traffic portal / onboarding forms.
 * Pure functions — safe to import from "use client" components and server actions.
 */

/** Strip to digit characters only. */
export function digitsOnly(raw: string | undefined | null): string {
  return String(raw ?? "").replace(/\D/g, "");
}

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/** True when the value looks like a usable email address. */
export function isValidEmail(raw: string | undefined | null): boolean {
  const t = String(raw ?? "").trim();
  if (!t || t.length > 254) return false;
  return EMAIL_RE.test(t);
}

/** Error message or null when valid. Empty is invalid (required). */
export function validateRequiredEmail(raw: string | undefined | null): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return "Email is required.";
  if (!isValidEmail(t)) return "Enter a valid email address.";
  return null;
}

/**
 * Optional AU-friendly phone: empty OK; otherwise 8–15 digits
 * (allows 04… mobiles, +61…, and short landlines with spaces/dashes).
 */
export function validateOptionalPhone(raw: string | undefined | null): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const digits = digitsOnly(t);
  if (digits.length < 8 || digits.length > 15) {
    return "Enter a valid phone number (8–15 digits).";
  }
  return null;
}

/**
 * Website URL: empty allowed when optional. Accepts example.com or https://…
 * (mirrors normaliseHttpUrl accept rules).
 */
export function validateOptionalWebsite(raw: string | undefined | null): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const withProto = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "Enter a valid website URL (e.g. example.com).";
    }
    if (!u.hostname.includes(".")) {
      return "Enter a valid website URL (e.g. example.com).";
    }
    return null;
  } catch {
    return "Enter a valid website URL (e.g. example.com).";
  }
}

/** ABN modulus-89 checksum (ATO algorithm). `digits` must be 11 numeric chars. */
export function abnChecksumOk(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const nums = digits.split("").map((c) => Number(c));
  nums[0] = nums[0]! - 1;
  const sum = nums.reduce((acc, n, i) => acc + n * weights[i]!, 0);
  return sum % 89 === 0;
}

/**
 * Required ABN for onboarding: 11 digits + checksum.
 * Spaces optional in input.
 */
export function validateRequiredAbn(raw: string | undefined | null): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return "ABN is required.";
  const digits = digitsOnly(t);
  if (digits.length !== 11) {
    return "ABN must be 11 digits (spaces optional), e.g. 51 824 753 556.";
  }
  if (!abnChecksumOk(digits)) {
    return "ABN checksum is invalid — double-check the number.";
  }
  return null;
}

/** Luhn check for card numbers (accepts Stripe test PANs like 4242…4242). */
export function luhnOk(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function validateCardName(raw: string | undefined | null): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return "Name on card is required.";
  if (t.length < 2) return "Enter the name as it appears on the card.";
  if (t.length > 80) return "Name on card is too long.";
  return null;
}

export function validateCardNumber(raw: string | undefined | null): string | null {
  const digits = digitsOnly(raw);
  if (!digits) return "Card number is required.";
  if (digits.length < 13 || digits.length > 19) {
    return "Card number must be 13–19 digits.";
  }
  if (!luhnOk(digits)) {
    return "Card number looks invalid — check the digits.";
  }
  return null;
}

/** Parse MM/YY, MMYY, or MM / YY → { month 1–12, year 4-digit } or null. */
export function parseCardExpiry(
  raw: string | undefined | null,
): { month: number; year: number } | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const digits = digitsOnly(t);
  let month: number;
  let year2: number;
  if (digits.length === 4) {
    month = Number(digits.slice(0, 2));
    year2 = Number(digits.slice(2, 4));
  } else {
    const m = t.match(/^(\d{1,2})\s*[/\-.\s]\s*(\d{2}|\d{4})$/);
    if (!m) return null;
    month = Number(m[1]);
    const yRaw = m[2]!;
    year2 = yRaw.length === 4 ? Number(yRaw.slice(2)) : Number(yRaw);
  }
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  if (!Number.isFinite(year2) || year2 < 0 || year2 > 99) return null;
  return { month, year: 2000 + year2 };
}

export function validateCardExpiry(
  raw: string | undefined | null,
  now = new Date(),
): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return "Expiry is required.";
  const parsed = parseCardExpiry(t);
  if (!parsed) return "Use MM/YY (e.g. 02/28).";
  const expEnd = new Date(parsed.year, parsed.month, 0, 23, 59, 59, 999);
  if (expEnd < now) return "Card is expired.";
  return null;
}

export function validateCardCvc(raw: string | undefined | null): string | null {
  const digits = digitsOnly(raw);
  if (!digits) return "CVC is required.";
  if (digits.length < 3 || digits.length > 4) {
    return "CVC must be 3–4 digits.";
  }
  return null;
}

export type DemoCardFieldErrors = {
  cardName?: string;
  cardNumber?: string;
  cardExpiry?: string;
  cardCvc?: string;
};

export function validateDemoCardFields(
  fields: {
    cardName?: string | null;
    cardNumber?: string | null;
    cardExpiry?: string | null;
    cardCvc?: string | null;
  },
  now = new Date(),
): { ok: true } | { ok: false; errors: DemoCardFieldErrors } {
  const errors: DemoCardFieldErrors = {};
  const nameErr = validateCardName(fields.cardName);
  if (nameErr) errors.cardName = nameErr;
  const numErr = validateCardNumber(fields.cardNumber);
  if (numErr) errors.cardNumber = numErr;
  const expErr = validateCardExpiry(fields.cardExpiry, now);
  if (expErr) errors.cardExpiry = expErr;
  const cvcErr = validateCardCvc(fields.cardCvc);
  if (cvcErr) errors.cardCvc = cvcErr;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true };
}

export type OnboardingDetailsFieldErrors = {
  website?: string;
  abn?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  industry?: string;
  natureOfBusiness?: string;
};

export function validateOnboardingDetailsFields(fields: {
  website?: string | null;
  abn?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  industry?: string | null;
  natureOfBusiness?: string | null;
}): { ok: true } | { ok: false; errors: OnboardingDetailsFieldErrors } {
  const errors: OnboardingDetailsFieldErrors = {};
  const websiteErr = validateOptionalWebsite(fields.website);
  if (websiteErr) errors.website = websiteErr;
  const abnErr = validateRequiredAbn(fields.abn);
  if (abnErr) errors.abn = abnErr;
  const name = String(fields.contactName ?? "").trim();
  if (!name) errors.contactName = "Contact name is required.";
  else if (name.length < 2) errors.contactName = "Enter a full contact name.";
  const emailErr = validateRequiredEmail(fields.contactEmail);
  if (emailErr) errors.contactEmail = emailErr;
  const phoneErr = validateOptionalPhone(fields.contactPhone);
  if (phoneErr) errors.contactPhone = phoneErr;
  if (!String(fields.industry ?? "").trim()) {
    errors.industry = "Choose an industry.";
  }
  if (!String(fields.natureOfBusiness ?? "").trim()) {
    errors.natureOfBusiness = "Choose a nature of business.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true };
}
