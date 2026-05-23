# CONTEXT

Glossary of domain terms for the End Show application — the digital graduation show for the [Master Digital Design](https://www.masterdigitaldesign.com/) programme.

## Terms

### Student
A graduating student showcased in the End Show. A Student is a **structured profile**, not a free-form artifact uploaded by the student.

Profile fields (required unless noted):
- **Portrait** — a photo of the Student.
- **Name** — display name.
- **Pronouns** — e.g. "she/her", "they/them".
- **Introduction** — short bio text.
- **Competencies** — tags describing what the Student does (e.g. "UX Designer", "Developer"). At least one is required; multiple allowed.
- **Link** — a single URL the Student chooses to share. Rendered on Stage as a QR code so visitors can scan it with their phone.
- **Work Media** *(optional)* — a short graphic, video, or slideshow representing the Student's work.

A profile is **complete** when every required field above is non-empty.

A Student **is** an authenticated user of the system (see *Roles* below). Each Student owns exactly one Student profile and can edit it. Staff can view and edit any Student profile.

### Stage
The big-screen rendering of one Student at a time. The Stage is the public-facing display at the show venue.

### Companion
The interface used by people at the show to browse Students and push one onto a Stage's Queue. There are two kinds:

- **Kiosk Companion** — a venue-supplied tablet placed at the show, physically near a Stage and paired to it by Stage Code. Trusted device, single-purpose, no auth required.
- **Mobile Companion** — a visitor's own phone, loaded via a public URL (typically scanned from a QR code on the Stage). Anonymous, no auth, possibly many concurrent.

Where the term "Companion" appears without qualifier, the rule applies to both.

### Stage Code
An **optional** short identifier that explicitly pairs a Stage with one or more Companions. Stage Codes exist only when an operator chooses to pair a specific Kiosk Companion to a specific Stage; the server never assigns them.

- **Default (unconfigured) state**: when neither a Stage nor a Companion has a Stage Code set, they share a single **default channel**. Any unconfigured Stage receives the Queue produced by any unconfigured Companion, and vice versa. This is the expected setup for the common case (one Stage, one Mobile-Companion audience, no Kiosks).
- **Paired state**: a Stage operator triggers Stage Code generation; the Stage produces and persists a code client-side (zustand + localStorage). That code is then keyed into a Kiosk Companion (manually or by QR). All Queue traffic on that code is isolated from the default channel and from other coded Stages.
- **Mobile Companion**: by default unconfigured (joins the default channel). May auto-pair to a specific Stage Code if the visitor scans a QR that encodes one.

**Format**: 4-character uppercase alphanumeric (e.g. `XKZP`). Generated client-side with rejection of profane / confusing combinations. Short enough to read aloud, large enough to be unique across the handful of Stages a single show would have.

**Regeneration**: not exposed in normal UI. A hidden setup gesture on the Stage (e.g. tap a corner 5×) opens a confirm dialog that issues a fresh code; intended for paired-setup mistakes before doors open, not for use during the show.

Pairing is the only coordination contract between a Companion and a Stage. The server has no Stage registry — it routes Queue entries by whatever code (or absence-of-code) is attached.

### Queue
The ordered list of Students waiting to appear on a Stage. Queues are **scoped by Stage Code**.

Queues partition by Stage Code (or by absence of one — the default channel is its own partition). A Queue is logically three sources, consumed by Stage advance in this order:

1. **Kiosk Queue** — entries pushed by the paired Kiosk Companion. Consumed first.
2. **Mobile Queue** — entries pushed by Mobile Companions. Consumed only when the Kiosk Queue is empty.
3. **Rotation** — fallback. Selects an eligible Student when both tiers are empty. Selection is governed by **Stage Time** ranking (below).

A Companion tap on a Student may also **preempt** the Student currently on Stage; the preempted Student returns to the top of the Queue with resume priority and plays again after the newcomer's Dwell. See [ADR-0011](docs/adr/0011-fairness-via-stage-time-ranking.md).

The Queue is the single coordination point between Companions and Stage(s) — there is no direct Companion-to-Stage channel.

### Stage Time
The sum of a Student's appearance durations on Stage, across **all Stages**, in the last rolling 60 minutes. Computed from the [Appearance Log](#appearance-log).

Stage Time is the single fairness signal in the system. It is **not** a cap — it never blocks a Companion tap and never causes Stage advance to skip a Student. It is consumed by two soft rankings:

1. **Rotation pick** — the rotation pool is sorted by ascending Stage Time, the **top decile** of Stage-Time-leaders is dropped, and a random pick is made within the remainder.
2. **Companion student list** — sorted by ascending Stage Time. When no search query or filter is active in the Companion UI, the top decile (≈10% most-shown Students) is hidden so casual browsing surfaces variety. The moment the visitor types a search or applies a filter, the hide flips off and every eligible Student is shown — intent overrides fairness.

The 60-minute window matches the show's pacing: a Student's burst of attention naturally ages out within an hour, and the ranking has no discrete "now eligible again" boundary.

#### Fairness policy knobs

The Stage Time fairness signal is tuned by three constants. They are conceptually one policy and live together in the Stage Time module (`packages/api/src/queue/stageTime.ts`):

- **`STAGE_TIME_WINDOW_MS`** — rolling window for Stage Time aggregation. Default: 60 minutes.
- **`ROTATION_DROP_DECILE`** — fraction of the Stage-Time-leading Students excluded from the Rotation pick; the remainder is the pool a random pick is drawn from. Default: 0.10. Larger = stricter fairness (more leaders excluded); 0 = uniform random over all eligible Students.
- **`COMPANION_HIDE_DECILE`** — fraction of the Stage-Time-leading Students hidden from the Companion list while idle (no search or filter active). Default: 0.10. The "intent overrides fairness" flip — applied by the Companion UI when the visitor types a search or selects a competency — is a separate, caller-side concern.

Changes to these constants are tuning, not architecture. They do not require an ADR.

### Rotation
The automatic refill of the Queue when both Kiosk and Mobile tiers are empty. Ensures the Stage never goes blank.

Selection strategy: sort the eligible Student pool by ascending **Stage Time**, drop the top decile of Stage-Time-leaders, and pick randomly within the remainder. Never-appeared Students rank as zero Stage Time and therefore sit at the head of the pool; the decile drop only trims the most-shown tail, so variety is preserved without locking onto a small most-overdue band.

### Dwell
The fixed time a Student is shown on Stage before the Stage advances. The same Dwell applies whether the next Student came from a Companion tap or from Rotation — there is one Stage clock, not two. Initial value: 30 seconds. Treated as a single system-wide setting, not per-Student.

### Appearance Log
The durable record of every time a Student has appeared on a Stage. Each entry captures `studentUserId`, `stageCode`, `source` (kiosk / mobile / rotation), `startedAt`, and `endedAt` (null while currently on Stage).

The Appearance Log is the **only persistent piece** of the otherwise in-memory Queue subsystem (see [ADR-0007](docs/adr/0007-in-memory-queue-with-persistent-appearance-log.md)). Three consumers:

1. **Stage Time ranking** — reads recent entries to compute per-Student Stage Time in the rolling 60-minute window, used by both the Rotation pick and the Companion student list (see [ADR-0011](docs/adr/0011-fairness-via-stage-time-ranking.md)).
2. **Stage advance** — writes a new entry when a Student takes the Stage, and ends it when the Stage advances past them (including when a Companion preempt closes the current entry early).
3. **Post-show analytics** — durable record of who appeared, when, where, and via which source.

The Appearance Log is the seam at which the Queue subsystem meets durable storage; nothing else in the Queue subsystem touches the database.

## Student lifecycle

1. **Pre-created** — Staff seeds a Student account by email address. Profile exists but is empty.
2. **WIP** — Student logs in (OTP) and fills profile fields. Account is unpublished; not visible on Stage, not selectable in Companion.
3. **Published** — Student toggles `isPublished = true`. If the profile is also *complete* (every required field filled), the Student is eligible to appear on Stage and to be picked from Companion. Subsequent edits while published are immediately live — there is no separate draft snapshot. A Student can unpublish at any time to take themselves off the show.

Eligibility for Stage / Companion = `isPublished AND profileComplete`. Staff can force-publish on behalf of a Student if needed.

## Roles

Two authenticated roles, backed by `better-auth`:

- **Staff** — programme staff. Can view and edit every Student profile. Can access show-runtime controls (TBD).
- **Student** — a graduating student. Owns exactly one Student profile and can edit only their own.

**Authentication is OTP-only (email one-time password).** No passwords are stored or accepted. Rationale: this is a one-shot live event; forgotten-password support the morning of the show is the failure mode we are designing out.

### Anonymous use

Watching the Stage and using either Companion (Kiosk or Mobile) requires **no login**. Authentication exists only to gate profile editing (Student) and admin / show-runtime controls (Staff). Mobile Companion clients are identified for rate-limiting purposes by a **signed httpOnly cookie** issued on first load — not by user identity.

## Queue rules

- **Insert**: Companion tap appends the Student to the tail of the Queue scoped to that Companion's Stage Code (FIFO within tier).
- **Preempt**: a Companion tap on a Student *not* currently on Stage **preempts** whoever is on Stage. The current Student's Appearance is closed, they re-enter the Queue at top with resume priority, and the newly-tapped Student takes the Stage immediately. The preempted Student plays again after the newcomer's Dwell — preempt is therefore *additive* to total show time for whoever Companions push.
- **Extend**: a Companion tap on the Student *already* on Stage extends that Student's Dwell (resets the Dwell timer); no preempt, no re-queue.
- **Dedupe in-flight**: a Student already present in the Queue cannot be added again. Once that Student has been consumed (shown on Stage and advanced past), they become eligible to be queued again.
- **Empty Queue**: when the Queue is empty at Stage-advance time, Rotation chooses the next Student.
- **No fairness gating**: fairness lives in *rankings* (Rotation pick, Companion list), never in *gates*. No tap is rejected for fairness reasons; no queued Student is silently skipped. See [Stage Time](#stage-time).

## Deployment

Hosted application on the public internet — not a venue-local LAN deploy. The show runs at the university with reliable connectivity. Server is cloud-hosted; Stage and Companion are browser clients.

## Lifecycle

The system is **always-on**. There is no Show domain entity, no scheduled start/end, no staff "reset" action in v1. The Stage Time ranking's 60-minute rolling window ages out old appearances naturally.

### Stage empty state
When zero Students are eligible (i.e. no Student has both `isPublished = true` and a complete profile), the Stage shows a dedicated **empty state** view (branded idle screen). Expected to be rare — only between system bring-up and the first Student publishing.

### No-audience pause
A Stage channel without any connected Stage subscribers is **paused**: its dwell timer is cancelled and the in-flight Appearance is closed. The Queue itself is preserved. When a Stage reconnects (or first connects), it re-advances from the head of the Queue. Rationale: [Stage Time](#stage-time) is the audience-attention signal; advancing without an audience would inflate it for Students nobody saw. Companion taps that arrive during a paused interval enqueue normally and are drained on the next Stage connect.

## Realtime transport

All Stage / Companion ↔ server reactivity runs over a single **WebSocket** connection per client, via tRPC subscriptions. This covers queue updates, current-Student-on-Stage broadcasts, Companion tap acknowledgements, and live position feedback. Plain tRPC HTTP is reserved for one-shot mutations and queries that don't need a live channel (admin CRUD, profile edits, asset metadata).

## Multiplicity

- **Multiple Companions** are expected to be live simultaneously (visitors browsing on their own devices).
- **Multiple Stages** may run simultaneously (more than one big screen at the venue).

## Storage

Assets (Portrait, Work Media) are stored in **Cloudflare R2**. Uploads use browser-side presigned PUTs — the Hono server never proxies file bytes.

### Storage Pool
The shared total capacity made available to Students.

- **Physical R2 quota**: 10 GB (free tier).
- **Displayed Pool size**: 8 GB. The 2 GB difference is a reserved safety buffer never exposed to Staff or Students; it absorbs miscalculation, image-resize overhead, and the Receipt Printer deferred work.
- The admin interface shows a single Storage Pool bar at the bottom: total bytes used vs. the 8 GB Displayed Pool.

### Student Budget
Each Student is allocated a portion of the Storage Pool that caps how many bytes their assets may occupy.

- **Default Budget**: Displayed Pool ÷ number of Student accounts. For 50 Students at 8 GB this is ~163 MB each.
- **Budget Transfer**: a Student may give away part of their own Budget to another specific Student. Transfers are peer-to-peer (Student → Student), initiated from the giver's profile UI. Staff are not required to mediate transfers.
- A Student's effective Budget is `defaultBudget + transfersReceived − transfersGiven`.

### Budget enforcement

Let `usage` be the sum of a Student's stored asset bytes and `budget` be the effective Budget.

- `usage ≤ budget` — normal. No warning.
- `budget < usage ≤ budget × 1.20` — **soft warning**. Message tone escalates the further over the Student goes (gentle near `budget`, sterner near `budget × 1.20`). Upload still succeeds.
- `usage > budget × 1.20` — **hard block**. Server rejects further uploads. Student must delete an asset or receive a transfer.

### Transfer floor

A Budget Transfer may not reduce the giver's effective Budget below **20 MB**. This is an absolute floor independent of current usage; a Student with high usage who transfers down to the floor will immediately enter the over-budget warning zone, but the transfer itself is permitted.

### Asset slot eviction

A Student has exactly one **Portrait slot** and one **Work Media slot**. Saving a new asset to a slot atomically replaces the prior occupant: the new asset is linked to the student row, then the prior asset's bytes are reclaimed from the Storage Pool and the underlying file is best-effort deleted from R2. The Student is never "between assets" — the slot always points at the canonical asset for that field. R2 delete failures are logged but do not roll back the slot swap; the asset row is the source of truth for Budget accounting.

## Deferred / out of scope (v1)

### Receipt Printer
A third digital product: a thermal receipt printer that prints a paper "Student card" for a visitor — Student's portrait, name, intro, competencies, and QR code. Out of scope for v1 but documented here so the data model can accommodate it without rework. Likely a third app (`apps/printer`) that subscribes to the same Student source and a "print this Student" trigger.
