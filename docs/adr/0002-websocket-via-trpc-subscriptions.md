# WebSocket via tRPC subscriptions for the live channel

All live coordination between Stage(s), Companions, and the server runs over a **single WebSocket per client using tRPC subscriptions**. Plain tRPC HTTP is reserved for one-shot queries and mutations that don't need a live channel (admin CRUD, profile edits).

## Considered alternatives

- **SSE (server-sent events).** Was the initial recommendation when the Stage was a pure consumer. Rejected once the design grew to need *bidirectional* reactivity: Kiosk Companion wants tap acknowledgements, Mobile Companion wants live queue-position feedback, Stage wants live queue badges. SSE would have forced a split brain (SSE for reads + HTTP for writes), doubling the reactivity surface.
- **Polling.** Rejected: laggy feel on a venue display, wastes battery on visitor phones, and the priority/exposure-cap logic becomes uglier when state is fetched on a clock rather than pushed.

## Consequences

- The hosting target must support WebSocket upgrades and sticky sessions if running multiple server instances. Reverse-proxy / CDN configuration is constrained accordingly.
- Reconnect logic and heartbeats are an operational concern. tRPC's subscription client handles most of it; the server must implement subscription procedures with proper cleanup.
- "Just add an SSE endpoint" or "just poll this" suggestions in future PRs should be redirected to the existing subscription model unless there is a genuine reason to fork the transport.
