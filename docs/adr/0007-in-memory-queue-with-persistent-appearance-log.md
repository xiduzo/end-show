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
