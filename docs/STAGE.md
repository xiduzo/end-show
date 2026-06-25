# Inside a Stage

How a Stage decides who to show, how Companions push a student to the centre, and
how it all stays in sync. This is the deep version of the
[Stage & Companion section in the README](../README.md#stage--companion); the
plain-English show rules live in [CONTEXT.md](../CONTEXT.md), and design
decisions referenced as `ADR-00xx` live in [`docs/adr/`](adr/).

---

## At a glance

end-show has two surfaces, both served from the same web app:

| Surface | Route | What it is |
|---|---|---|
| **Stage** | `/` | The big screen. Shows **one** student at a time and rotates. |
| **Companion** | `/companion` | The controller. Browse students and send one to the Stage. **Mobile** on phones, **Kiosk** on wide screens (≥ 768px) — Kiosk has higher queue priority. |

Installing the PWA to a phone home screen auto-redirects `/` → `/companion`: an
installed phone becomes a Companion, a browser tab stays a Stage. The Stage is a
*display* (shows who's on); the Companion is a *controller* (pushes who should
be on). Everything below is the engine between them.

---

## 1. Channels — one show per Stage Code

The core object is a **channel**: one independent show with its own **queue**,
**current student**, and **dwell clock**, keyed by **Stage Code**.

- Every Stage screen and Companion using the **same** code drives and watches the
  **same** channel — they're synchronized.
- **Different** codes are **independent** shows running side by side (several big
  screens, each its own thing).
- No code (`stageCode = null`) is the shared **default channel**.

Channels live **in memory** in the server process and are created on demand the
first time someone subscribes or pushes (ADR-0007). They aren't database rows —
only the [Appearance log](#6-realtime-persistence-recovery) is persisted.

## 2. The Stage Code

A **4-character code** from a deliberately reduced alphabet —
`ABCDEFGHJKMNPQRSTVWXYZ23456789` (no `0/O`, `1/I/L`, `U`) — screened against a
small profanity blocklist (ADR-0009). Example: `K7QM`. The reduced alphabet means
a code read off a screen is never ambiguous to type.

It lives entirely in the URL param `?code=K7QM` — there is no server-side stage
registry; the code in the URL *is* the configuration. To configure a Stage: open
`/`, tap anywhere to open the **pairing modal** (shows the code in giant digits,
lets you **Generate** or type one, renders a **QR** to `/companion?code=K7QM`),
and visitors scan or type it to pair. Codes are validated client-side
(`isValidStageCode`); anything malformed falls back to the default channel.

## 3. Track selection (the track filter)

Every student has a **track** — their programme specialisation, a single
free-form string (`student.track`, default `"IxD"`; examples `IxD`, `DFT`, `DDD`).
A Stage can be **limited to one or more tracks**:

```
/?code=K7QM&tracks=IxD,DFT
```

- Comma-separated, and **only meaningful on a coded Stage** (ignored on the
  default channel). Set from the pairing modal as toggle chips.
- It's a **hard filter applied in two places**: rotation only ever picks
  in-set students, and a Companion push for an out-of-set student is **rejected**
  with `off-track` before it touches the queue.
- **Companions inherit, they don't set.** Only the Stage display writes a
  channel's track filter (it passes `tracks` on subscribe); Companions subscribe
  with the **code only**, so a paired phone can never overwrite it. `null` = all
  tracks (and clears any stale filter).

## 4. Who gets shown — the selection algorithm

Two forces decide who's on: the **Queue** (explicit intent from Companions and
resumes) and **Rotation** (an automatic, fairness-driven fill). **The Queue
always wins; Rotation fills the gaps.**

**Eligibility.** A student can appear only if **published _and_ profile-complete**
— today, every required field filled plus at least one competency tag
(`isStudentProfileComplete`); the `isPublished` flag is reserved for a future
column. Only `role = student` rows count (ADR-0011).

**Stage Time — the fairness signal.** The one number everything fair is built on:
the total time a student spent on **any** Stage in the last **rolling 60 minutes**
(`STAGE_TIME_WINDOW_MS`), summed from their [Appearance log](#6-realtime-persistence-recovery)
rows that overlap the window. Because the window rolls, a student shown a lot an
hour ago "cools off" and becomes a candidate again. It only accrues while someone
is watching (see [no-audience pause](#6-realtime-persistence-recovery)).

**Rotation pick** (`pickForRotation`), when the Queue can't fill the Stage:

1. Take all **eligible** students, minus anyone on stage or queued, and apply the
   **track filter**.
2. **Sort ascending by Stage Time** — least-seen first.
3. **Drop the top 10%** (`ROTATION_DROP_DECILE = 0.1`) — the current leaders are
   briefly benched. *(With < 10 eligible this rounds to zero, so everyone stays.)*
4. **Pick at random** from the remaining ~90%.

The least-exposed are favoured, but the random pick keeps it from being a rigid
worklist. Nobody is ever permanently skipped — it's a *ranking*, never a *gate*;
as a benched student's Stage Time decays, they flow back in.

**Companion list.** The Companion grid is ranked by the **same** signal (ascending
Stage Time). The top 10% are **hidden while idle** (`hideWhenIdle`) so the
most-shown don't dominate the wall — but the instant a visitor searches or
filters, intent overrides fairness and everyone is shown again.

### The Queue and its priorities

Each channel has one priority queue (a TanStack Pacer `Queuer`); highest priority
dequeues first:

| Source | Priority | From |
|---|---:|---|
| `resume` | **400** (+bump) | a student bumped off by a preempt, put back to finish their turn |
| `kiosk` | **300** | a send from a **Kiosk** Companion (venue device) |
| `mobile` | **200** | a send from a **Mobile** Companion (visitor phone) |
| `rotation` | **100** | the automatic fairness fill |

- **Top-up:** after any change the engine refills to `MIN_QUEUE = 3` with Rotation
  picks, so there's always an "up next".
- **Dedup:** a student already queued can't be added twice — re-adding moves their
  entry rather than duplicating it.
- **Tier detection:** a Companion reports **Kiosk** (`min-width: 768px`) or
  **Mobile** by viewport width (`detectTier`, re-evaluated on resize). The client
  sends the tier and the server trusts it; abuse is bounded softly by the fairness
  ranking, not a hard check (ADR-0008 weighed a route-based split and rejected it).

### Dwell and the advance loop

**Dwell** is how long one student holds the Stage: `DWELL_MS`, default **30s**
(env override). A thin progress bar animates the remaining time. Each turn runs
`advance()`:

```
advance():
  1. close the current student's Appearance (write its end time)
  2. top up the queue to MIN_QUEUE with Rotation picks
  3. dequeue the highest-priority item ── nobody? → idle screen, stop
  4. open a new Appearance row and put them on the Stage
  5. emit the new state to every subscriber
  6. arm a DWELL_MS timer ── on fire, advance() again
```

## 5. Companion push → the centre

A Companion tap calls `queue.push` with `{ stageCode, studentUserId, tier }`.
After the [track filter](#3-track-selection-the-track-filter) check, exactly one
of three things happens:

1. **Extend** — the tapped student is *already* on stage. Their dwell timer
   resets so they stay longer; nothing is reordered. Returns `extended: true`.
2. **Preempt ("push to the centre")** — someone *else* is on. They come off
   **immediately** and the tapped student goes on **now**. The displaced student,
   *if they arrived via Rotation*, is requeued at **`resume`** priority to finish
   their turn — so a preempt is **additive**, not destructive. A previous
   preempter who is themselves preempted is dropped, not requeued, and only one
   pending preempter is held at a time. Returns `preempted: true`.
3. **Enqueue** — the Stage is empty. The student is queued, and if a Stage is
   watching, `advance()` puts them on. Returns `preempted: false`.

Off-track sends never reach this — they return `{ ok: false, reason: "off-track" }`.

Because preempting is additive, pushing *increases* a student's exposure — which
the [Stage Time ranking](#4-who-gets-shown--the-selection-algorithm) quietly
corrects over the next hour. Fairness lives in the rankings, never in the taps:
**no tap is ever rejected for fairness reasons.**

## 6. Realtime, persistence, recovery

- **Realtime (ADR-0002):** every Stage and Companion holds one WebSocket (tRPC
  subscriptions). `stage.current` streams the current student + dwell;
  `queue.watch` streams the up-next list; a push is the `queue.push` mutation.
  All clients see each change at once.
- **In-memory queue, persistent log (ADR-0007):** the live queue and current
  pointer are in memory (fast, disposable). The **only** persisted thing is the
  **Appearance log** — one row per "student X was on Stage from t0 to t1" — used
  solely to compute Stage Time. After a restart the queue rebuilds from Rotation.
- **Crash recovery:** open Appearance rows orphaned by a dead process are closed
  at boot, and a periodic janitor closes any that leak, so a crash can't inflate a
  student's Stage Time forever.
- **No-audience pause:** a channel with **zero** connected Stage screens pauses —
  dwell timer cancelled, in-flight Appearance closed, queue preserved. When a
  Stage reconnects it re-advances from the head. Stage Time should only accrue
  while someone is actually watching.

## 7. Printing (the Stage as printer bridge)

The optional thermal printer ([apps/printer](../apps/printer/README.md)) is a
local HTTP service on the **same machine as the Stage display**. Companions (e.g.
an iPad) can't reach a LAN printer directly, so the **Stage bridges**: it polls
the local service for availability, reports that to the server, and forwards
relayed print jobs to `http://localhost:8765` (override with `VITE_PRINTER_URL`).
A print job carries a student's profile — name, track, competencies, link as a
QR, and a dithered portrait. See `apps/web/src/features/stage/use-printer-bridge.ts`
and the relay in `packages/api/src/printer/`.

---

## Reference

### tRPC surface

| Call | Kind | Caller | Purpose |
|---|---|---|---|
| `stage.current` | subscription | Stage + Companion | current student, dwell, track filter. The **Stage** also *sets* the channel's tracks here; Companions omit them. |
| `stage.config` | query | both | the dwell length |
| `queue.watch` | subscription | both | the up-next queue (and `next`) |
| `queue.push` | mutation | Companion | tap a student → extend / preempt / enqueue |

### Configuration knobs

| Where | Knob | Default | Effect |
|---|---|---|---|
| Stage URL | `?code=XXXX` | none → default channel | which channel this screen drives |
| Stage URL | `?tracks=A,B` | none → all tracks | hard track filter for rotation **and** sends |
| Companion viewport | `≥768px` → Kiosk / `<768px` → Mobile | by width | queue tier (300 vs 200) |
| Server env | `DWELL_MS` | `30000` | ms each student holds the Stage |
| Code | `MIN_QUEUE` | `3` | minimum queued ("up next" depth) |
| Code | priorities | `400 / 300 / 200 / 100` | resume / kiosk / mobile / rotation |
| Code | `ROTATION_DROP_DECILE` | `0.1` | top fraction of leaders benched from rotation |
| Code | `STAGE_TIME_WINDOW_MS` | `3600000` | the rolling fairness window (60 min) |

### Source map

| Concern | File |
|---|---|
| Queue engine, priorities, dwell, preempt/extend | `packages/api/src/queue/engine.ts` |
| Stage Time, rotation pick, companion ranking | `packages/api/src/queue/stageTime.ts` |
| Persistent appearance log | `packages/api/src/queue/appearanceLog.ts` |
| tRPC stage / queue routers | `packages/api/src/routers/stage.ts`, `routers/queue.ts` |
| Stage Code + track URL state | `apps/web/src/features/stage/stage-code-store.ts` |
| Stage display, pairing modal, dwell bar | `apps/web/src/routes/index.tsx` |
| Companion view + tier detection | `apps/web/src/routes/companion.tsx`, `features/companion/companion-view.tsx` |
| Printer bridge + relay | `apps/web/src/features/stage/use-printer-bridge.ts`, `packages/api/src/printer/` |

### Related ADRs

[0002 — WebSocket via tRPC](adr/0002-websocket-via-trpc-subscriptions.md) ·
[0003 — Tiered queue & exposure cap](adr/0003-tiered-queue-and-exposure-cap.md) ·
[0007 — In-memory queue, persistent appearance log](adr/0007-in-memory-queue-with-persistent-appearance-log.md) ·
[0008 — Tier by route, not device](adr/0008-tier-by-route-not-by-device.md) ·
[0009 — Stage code alphabet & pairing](adr/0009-stage-code-alphabet-and-pairing.md) ·
[0011 — Fairness via Stage Time ranking](adr/0011-fairness-via-stage-time-ranking.md)
