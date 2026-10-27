import { AuthError } from "./auth";

/**
 * A ?period= value goes into storage paths, so only "YYYY-MM" is accepted
 * (drill-down links pass it straight from a shared URL). Absent → null, so the
 * caller falls back to the current month; anything else → 400.
 */
export function checkedPeriod(value: string | null): string | null {
  if (!value) return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new AuthError("Invalid period (use YYYY-MM)", 400);
  return value;
}
