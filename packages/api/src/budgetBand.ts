/**
 * Budget enforcement band — the single home for the three-zone storage policy
 * from CONTEXT.md §"Budget enforcement". Pure: no db, no env, so the server
 * upload gate and the client warning UI consume the exact same decision (import
 * via `@end-show/api/budgetBand`).
 *
 *   usage ≤ budget            → "ok"   (no warning)
 *   budget < usage ≤ budget×1.20 → "soft" (upload still succeeds; tone escalates)
 *   usage > budget×1.20       → "hard" (blocked)
 *
 * The 1.20× knob lives here and nowhere else.
 */

/** Hard block past `effectiveBudget × SOFT_BAND_MULTIPLIER` (CONTEXT.md). */
export const SOFT_BAND_MULTIPLIER = 1.2;

export type BudgetBand = "ok" | "soft" | "hard";

export type BudgetBandResult = {
  band: BudgetBand;
  /** `usage ÷ budget`. `Infinity` when budget is 0 and anything is used. */
  ratio: number;
  /** Bytes still uploadable before the hard block (`budget×1.20 − usage`), ≥0. */
  hardRemainingBytes: number;
};

export function budgetBand(
  usedBytes: number,
  effectiveBudgetBytes: number,
): BudgetBandResult {
  const hardCeilingBytes = effectiveBudgetBytes * SOFT_BAND_MULTIPLIER;
  const ratio =
    effectiveBudgetBytes <= 0
      ? usedBytes > 0
        ? Infinity
        : 0
      : usedBytes / effectiveBudgetBytes;

  let band: BudgetBand;
  if (usedBytes <= effectiveBudgetBytes) band = "ok";
  else if (usedBytes <= hardCeilingBytes) band = "soft";
  else band = "hard";

  return {
    band,
    ratio,
    hardRemainingBytes: Math.max(0, hardCeilingBytes - usedBytes),
  };
}

/**
 * The escalating soft-warning copy: gentle just over budget, sterner near the
 * hard ceiling. Returns null outside the soft band. One wording, shared by the
 * upload gate's response and the profile budget UI.
 */
export function budgetSoftWarning(result: BudgetBandResult): string | null {
  if (result.band !== "soft") return null;
  const over = result.ratio - 1; // 0 .. 0.20 within the soft band
  if (over < 0.07) {
    return "You're just over your storage budget — consider removing something soon.";
  }
  if (over < 0.14) {
    return "You're over your storage budget. Please free up space when you can.";
  }
  return "You're nearly at the hard storage limit. Free up space now to avoid being blocked.";
}
