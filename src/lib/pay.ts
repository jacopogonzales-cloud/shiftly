// Pay rules. Pure functions, integer cents in and out.

export type PayRules = { overtimeAfterMinutes: number; overtimeMultiplier: number };

export const DEFAULT_PAY_RULES: PayRules = { overtimeAfterMinutes: 480, overtimeMultiplier: 1.25 };

/** Pay for one shift: minutes past the overtime threshold are paid at the multiplier. Rounded to the cent. */
export function shiftPayCents(minutes: number, hourlyRateCents: number, rules: PayRules = DEFAULT_PAY_RULES): number {
  const regular = Math.min(minutes, rules.overtimeAfterMinutes);
  const overtime = Math.max(0, minutes - rules.overtimeAfterMinutes);
  return Math.round(((regular + overtime * rules.overtimeMultiplier) * hourlyRateCents) / 60);
}
