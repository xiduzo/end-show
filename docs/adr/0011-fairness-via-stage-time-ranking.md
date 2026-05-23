# Fairness via Stage Time ranking, no Exposure Cap

**Status:** Accepted. Supersedes [ADR-0003](0003-tiered-queue-and-exposure-cap.md).

The per-Student Exposure Cap is removed. A Companion tap may **preempt** the Student currently on Stage; the preempted Student re-enters the Queue at top with resume priority, then plays again after the newcomer's Dwell. A preempt therefore *adds* to whoever Companions are pushing — the room's curatorial signal grows show time rather than being throttled by it.

Fairness now lives in two soft-signal rankings, both fed by **Stage Time** — the sum of a Student's appearance durations across **all Stages** in the last rolling 60 minutes:

1. **Rotation pick** — the rotation pool is sorted by ascending Stage Time, then a random selection is made within the top-N most-overdue window. Replaces the previous "least-recently-seen" score.
2. **Companion student list** — sorted by ascending Stage Time. When no search or filter is active, the **top decile** by Stage Time is hidden from the list. The moment the visitor types a search query or applies any filter, the hide flips off and every eligible Student is shown — intent overrides fairness.

## Why this shape

- The hard Cap proved unnecessary in practice (and was never enforced in code). Blocking a Companion tap with a "this Student is capped" message punishes the gesture the Stage exists to amplify. A soft ranking lets the room self-balance without ever rejecting a human signal.
- One source of truth (Stage Time over rolling 60 min) feeding both Rotation pick and Companion list keeps fairness coherent — a Student that just played 90s on a paired Stage sinks in *both* rankings simultaneously. The signal degrades gracefully; there is no discrete "now eligible again" boundary.
- Stage Time aggregates **across all Stages** so a Student bouncing between paired Stages is ranked once, not once per Stage. The fairness ledger is global to the show, even when channels are partitioned.
- Hiding only the top decile, and only when filters are inactive, matches visitor intent. Aimless browsing should surface variety; a visitor searching for a specific friend or competency should never see them missing.
- Counting *Stage Time* not *appearance count* is honest about what visitors experienced: a Student preempted after 4s and a Student who completed a full 30s Dwell should not rank the same.
- Preempt-as-additive is the show's social contract made explicit. A Companion tap is a stronger signal than the Dwell timer, so it wins. The displaced Student keeps their tail via resume priority, so no Appearance is silently dropped.

## Considered alternatives

- **Keep the Cap as a hard limit.** Rejected. The block-and-message UX wastes the Companion gesture, and the Cap was never enforced in shipped code — its absence has been the actual product behavior. Codifying that absence is the smaller change.
- **Rank by appearance count instead of total Stage Time.** Rejected: a preempted-after-4s appearance and a full-Dwell appearance would rank identically. Time matches lived experience.
- **Hide popular Students unconditionally in the Companion list.** Rejected: a visitor searching for a specific classmate should never see them missing. Filter-active = intent = surface everyone.
- **Per-Stage fairness (Stage Time scoped to one `stageCode`).** Rejected: a Student bouncing between paired Stages should be one ledger entry, not many.
- **Drop the preempted Student rather than re-queue them.** Rejected: cuts an in-flight Appearance to nothing. Resume priority preserves the social contract that *every* Companion-pushed Student gets their tail.

## Consequences

- The two-checkpoint Cap discipline from ADR-0003 is gone. `pushToQueue` does not reject pushes for fairness reasons; Stage advance never silently skips a Student. Fairness is purely a *ranking* concern, never a *gating* concern.
- `AppearanceLog.recentForStudent` becomes the read used by both the Rotation pick (the engine's `nextRotationCandidate` switches its score from `lastStartedAtFor` to summed Stage Time over the 60-min window) and the Companion-list ranking. The Appearance Log seam from ADR-0007 stands; it gains a new reader on the Companion path.
- The Companion needs the Stage Time ranking from the server. A new query or a piggyback on the existing queue subscription will deliver it; transport choice is left to implementation.
- "Top decile" is a tuning knob, not a domain constant. At ~50 Students this hides ~5 names when no filter is active. Re-tune after the first real-show traffic; record any change here as a one-line amendment.
- ADR-0008's "Exposure Cap applies equally regardless of tier" rationale is replaced by "fairness ranking applies equally regardless of tier" — the bound on tier abuse still exists, it is just soft.
- `CONTEXT.md`'s "Promotion only, no interruption" Queue rule is dropped: preempt is the canonical Companion path. CONTEXT is updated alongside this ADR.
