import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let counter = 0;
// Short, sortable-ish id. Good enough for the in-memory store; the Supabase
// adapter uses uuid/identity columns instead.
export function id(prefix = "id"): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function now(): string {
  return new Date().toISOString();
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Australian dollar formatting (en-AU). */
export function formatMoney(
  amount: number,
  opts?: { fractionDigits?: number },
): string {
  const digits = opts?.fractionDigits ?? 0;
  return amount.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function titleCase(s: string): string {
  return s
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, "AI");
}
