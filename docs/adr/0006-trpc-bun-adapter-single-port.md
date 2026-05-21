# tRPC + WebSockets via trpc-bun-adapter on a single Bun port

The server runs HTTP and WebSocket traffic on the **same Bun port** by composing `createBunHttpHandler` and `createBunWSHandler` from `trpc-bun-adapter` (v1.3.0). CORS is applied at the outer `Bun.serve` `fetch` layer, not via Hono middleware.

## Considered alternatives

- **Separate `ws` server on a second port.** Rejected because deploying two ports complicates the reverse-proxy contract, the `.env` surface, and the auth cookie domain story. With one port, a single TLS cert + single hostname + single CORS rule covers both transports.
- **Hono `upgradeWebSocket` adapter.** Rejected because Hono's WS adapter doesn't compose cleanly with `tRPC`'s `applyWSSHandler` — we'd be re-implementing what `trpc-bun-adapter` already does on Bun.
- **`createBunServeHandler` (the adapter's convenience export).** Initially used, then rejected once we needed CORS on `/trpc/*` responses. That handler short-circuits before any Hono middleware runs, so the `cors()` plugin on the Hono app never executes. Decomposing it lets us inject CORS headers at the outer fetch layer and keeps the WS upgrade path unaffected.

## Consequences

- CORS headers are injected in the outer `Bun.serve` fetch function for every non-`OPTIONS` response (preflight is handled with an explicit 204). Skipping this would silently drop `/trpc/*` responses on the floor in the browser even though the server returned 200.
- WebSocket upgrades return status 101 from the HTTP handler; the outer wrapper must short-circuit (do not call `withCors` on a 101 — that breaks the upgrade).
- The Hono `app` is *not* `export default`ed. Bun's auto-server detection conflicts with an explicit `Bun.serve(...)` call and the dev server then EADDRINUSEs on hot reload. The fact that this isn't obvious is the reason this ADR exists.
- The adapter version is pinned because the context-creator signature and the `emitWsUpgrades` flag are both fairly new — minor bumps have broken the call shape before. Upgrade deliberately, not automatically.
