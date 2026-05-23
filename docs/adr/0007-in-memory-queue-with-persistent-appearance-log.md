# In-memory queue state with a persistent appearance log

Live Stage state — Kiosk queue, Mobile queue, rotation cursor, current dwell, timers — lives in a `Map<stageCode, ChannelState>` in the server process. The **Appearance** table (who was on which stage from when to when) is the only piece persisted to SQLite. The fairness ranking (see [ADR-0011](0011-fairness-via-stage-time-ranking.md)) reads Stage Time from the Appearance table; the queues do not survive a restart.

## Considered alternatives

- **Persist queues to SQLite on every push/advance.** Rejected. The queue is a coordination primitive between humans tapping a screen and a display rotating every 30 seconds. A restart in the middle of the show is a recovery scenario, not a steady-state one — the right behavior is "everyone tap again" rather than "replay yesterday's queue." Writing per-push to disk for a value that's discarded on restart is overhead with no consumer.
- **Redis / external queue service.** Rejected. Single-instance constraint (see [ADR-0006](0006-trpc-bun-adapter-single-port.md) and the in-process channel listener `Set<>`s) already pins us to one server process. Adding Redis would be a second moving part for no win at this scale (~50 students, ~hundreds of visitors).
- **Persist nothing, derive Stage Time from an in-memory ring buffer.** Rejected because the fairness window (60 min) is longer than realistic uptime guarantees on show day. The ranking must survive a hot-reload or container restart, otherwise a Student that just dominated the Stage would reset to "least shown" the moment the server bounced. (Historical note: this alternative was originally written about the Exposure Cap; the rationale carries unchanged to the Stage Time signal that replaced it — see [ADR-0011](0011-fairness-via-stage-time-ranking.md).)

## Consequences

- A server restart wipes all live queue and rotation state. Pending taps are lost. Stage displays will fall back to rotation cleanly because rotation is recomputed from `student.isPublished`; companions will resync on WS reconnect because `subscribeQueue` emits the current channel snapshot immediately on subscribe.
- The Appearance table is append-only (closed by setting `endedAt`). Treat it as the source of truth for "did this Student appear" — never delete rows during the show. Post-show analytics also lean on this table.
- A single server instance is now a hard requirement, not a default. Scaling out would require either (a) sticky-routing each `stageCode` to one instance, or (b) externalizing the channel state. Both are non-trivial; don't do them speculatively.
- Future "current stage status" pages for Staff must read from the in-memory channel (via tRPC subscription/query), not from the database — the DB only knows about closed-or-current appearances, not the queues behind them.

## Recovery

An Appearance row is opened by `log.start()` and closed by `log.end()`. Three failure modes can leave a row with `endedAt = NULL` and no backing in-memory `ch.current`:

1. **Process restart / deploy** — the in-flight Student's row is never closed.
2. **`log.end()` write fails mid-advance** — `engine.ts` clears `ch.current` before the await resolves, so a thrown DB error orphans the row with no retry path.
3. **Fire-and-forget `log.end()`** in the Stage subscriber's last-listener cleanup (`subscribeStage`) — if the process dies before the promise commits, the row stays open.

An orphan row is destructive because Stage Time aggregation treats `endedAt = NULL` as "ongoing, ends at now": the row accrues Stage Time minute by minute until it hits the rolling-window ceiling (`STAGE_TIME_WINDOW_MS`, currently 60 min), at which point the affected Student is locked out of both Rotation and the Companion list for the remainder of the show.

### Cleanup strategy

The `AppearanceLog` adapter exposes `closeAllOpen(fillMs, maxAgeMs?)`. Closing sets `endedAt = startedAt + fillMs` rather than `endedAt = now` so the Student is credited with one realistic appearance's worth of attention rather than the full elapsed downtime. The fill value used in production is the Stage's Dwell — the same duration a normal appearance runs for.

Two scheduled passes call it:

- **Boot sweep** (`apps/server/src/index.ts`, after migrations): `closeAllOpen(DWELL_MS)` with no age threshold. By definition nothing is in-flight at boot, so every open row is an orphan.
- **Janitor** (60-second interval, started at boot, cancelled on `SIGTERM` / `SIGINT`): `closeAllOpen(DWELL_MS, DWELL_MS × 10)`. The age threshold avoids clipping legitimately in-flight rows — extends do not open new rows, so a single appearance's DB-`startedAt` can lag the wall clock by several Dwells.

### Bias of the fill value

Under-counting (Student looks like they appeared less than they really did) is recoverable — the next legitimate appearance overwrites the count, and the window is rolling. Over-counting is destructive — a single bad row locks a Student out for up to 60 minutes. The one-Dwell fill leans toward under-counting in the extended-appearance case and tolerates a mild over-count when an orphan was created moments after `log.start()`. Worst-case error is bounded at one Dwell either way.

### Out of scope

- **`expectedEndAt` column** for precise janitor targeting — deferred until the time-threshold approach demonstrably misfires. Schema migration not worth it for v1's extend volume.
- **Per-process boot-ID column** for multi-process recovery — irrelevant under the single-instance constraint above.
- **Aggregation-time defensive cap** — overlaps the janitor; a single recovery mechanism is easier to reason about than two layered ones.
