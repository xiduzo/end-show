# Companion tier is determined by URL route, not by device detection

A Companion client is either **Kiosk** or **Mobile** based on which route it loaded — `/companion/kiosk` is Kiosk, `/companion` is Mobile — and the React component passes `tier: "kiosk" | "mobile"` to the server. The server trusts this client-supplied tier value when ranking the tiered queue.

## Considered alternatives

- **User-agent sniffing.** Rejected. UA strings are unreliable (tablets straddle the line, kiosk-mode browsers can look like anything, dev tools rewrite them). Staff plugging in a venue iPad and visiting the wrong URL would silently get the wrong priority — a debug-hostile failure mode.
- **Server-side device classification (viewport / touch / pointer).** Rejected for similar reasons plus latency: tier needs to be known by the time we render the list, not after a feature-detect round-trip.
- **A "tier" picker UI.** Rejected as visitor-hostile. Visitors should not be asked "are you Kiosk?" — they don't know what that word means.

## Consequences

- Tier is **untrusted input** in the sense that a curious visitor can hit `/companion/kiosk?code=ABCD` from their phone and gain Kiosk-tier priority. We accept this. The mitigation is operational, not technical: the Kiosk route is shared by passing a `?code=XXXX` parameter from the Stage QR (private to the venue), and gaining 4 chars of stage-code knowledge is not worth defending against with code.
- The Exposure Cap applies equally regardless of tier, so a malicious tier-bump still hits the same per-Student dwell ceiling. Tier abuse is bounded.
- Adding a new tier in future (e.g. "VIP" badge holders) means a new route, not a config field — keep that uniform.
- Anonymous Mobile cookie (see [ADR-0005](0005-anonymous-companion-cookie-no-banner.md)) is what we'd use to rate-limit a single bad actor cycling tiers; that is the right defense if abuse becomes real, not server-side tier validation.
