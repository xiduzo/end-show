# Tiered Queue with priority sources and Exposure Cap

**Status:** Superseded by [ADR-0011](0011-fairness-via-stage-time-ranking.md). The Exposure Cap is removed; Companion preempt of the current Student is now allowed and additive; fairness moves to soft Stage-Time-based rankings on Rotation pick and the Companion student list. The three-tier Queue (Kiosk → Mobile → Rotation) from this ADR stands. Retained for historical context.

The Stage advances by consuming from a **three-tier source hierarchy**: Kiosk Companion Queue first, Mobile Companion Queue second, Rotation third. A single per-Student **Exposure Cap** (3 minutes per rolling 60 minutes, equivalent to 6 appearances) applies across all three sources to prevent any one Student from dominating the show.

## Why this shape

- The Kiosk Companion is a trusted venue device paired to a Stage; its tap is a deliberate curatorial act and should not wait behind anonymous visitor taps. Giving Kiosk priority preserves "throw to screen" as a direct gesture.
- The Mobile Companion is anonymous and easy to spam — it earns a tier of its own, *behind* Kiosk but *ahead* of Rotation.
- Rotation exists so the Stage never goes blank; it is intentionally the lowest priority so any human signal trumps autoplay.
- The Exposure Cap is the **single source-agnostic invariant** that prevents either Companion tier from monopolising the Stage. It applies equally to Rotation so a quiet evening doesn't loop the same Student.

## Considered alternatives

- **Single flat Queue with priority-as-a-field.** Rejected for clarity: tier-as-shape makes the invariant ("Kiosk always before Mobile") obvious in the schema instead of a sort-order rule that's easy to break in a future refactor.
- **Cooldowns instead of a rolling cap.** Rejected: a per-Student cooldown blocks a Student even if traffic is low; the rolling cap automatically loosens when there's room.

## Consequences

- Enforcement happens at two checkpoints (enqueue and Stage advance). Both must stay in sync — a Student capped *between* enqueue and advance must be silently skipped, not crash the advance step.
- Adding a fourth source later (e.g. Receipt Printer triggering a "now showing" callback) must declare its tier position explicitly; the priority order is not encoded in a config table but in domain logic.
