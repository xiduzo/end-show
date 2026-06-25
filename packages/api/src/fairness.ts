/**
 * Companion-list visibility — the ADR-0011 "intent overrides fairness" rule,
 * authored once.
 *
 * The server (queue/stageTime.ts → rankForCompanion) flags which Students sit in
 * the top Stage-Time decile (`hideWhenIdle`). This module owns the *other* half
 * the rule used to be split across the seam into: *when* that flag is honored.
 * A flagged Student is hidden only while the visitor is idle (no search, no
 * filter); the moment they search or filter, intent wins and every eligible
 * Student is shown.
 *
 * Pure — no server imports — so the Companion client imports the exact same rule
 * (`@end-show/api/fairness`) instead of re-deriving the flip inline.
 */

export type BrowseIntent = {
  /** A non-empty search query is active. */
  searching: boolean;
  /** One or more filters (e.g. competency chips) are active. */
  filtering: boolean;
};

/** The visitor has expressed intent — fairness hiding is suspended. */
export function intentActive(intent: BrowseIntent): boolean {
  return intent.searching || intent.filtering;
}

/** True when this Student should be hidden from the idle Companion list. */
export function isHiddenWhileIdle(
  student: { hideWhenIdle: boolean },
  intent: BrowseIntent,
): boolean {
  return student.hideWhenIdle && !intentActive(intent);
}

/** Filter a ranked Companion list to what the visitor should see right now. */
export function visibleStudents<T extends { hideWhenIdle: boolean }>(
  students: T[],
  intent: BrowseIntent,
): T[] {
  if (intentActive(intent)) return students;
  return students.filter((s) => !s.hideWhenIdle);
}
