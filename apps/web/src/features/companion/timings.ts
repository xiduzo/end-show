/**
 * Companion kiosk timings.
 *
 * Tuned for an open-day kiosk shared by many short visits. Defaults bias
 * toward returning to a neutral, fair state when a visitor walks away so
 * the next person isn't anchored on the previous one's filters or focus.
 */

/** Focused student card auto-dismiss after no visitor activity. */
export const SHOWCASE_TIMEOUT_MS = 20_000;

/** "Sent to stage" confirmation flash. */
export const SENT_FLASH_MS = 1_400;

/** Filter panel auto-collapse after no panel interaction. */
export const FILTER_CLOSE_MS = 12_000;

/** Active filters auto-clear after no kiosk activity. */
export const FILTER_RESET_MS = 45_000;
