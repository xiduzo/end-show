# Anonymous Mobile Companion identified by signed httpOnly cookie, no consent banner

Mobile Companion clients are anonymous (no login) and identified for rate-limiting purposes by a **signed httpOnly cookie** issued by the server on first page load. We do **not** show a cookie consent banner because the cookie is strictly necessary (anti-abuse on a public, anonymous endpoint) under the ePrivacy Directive / GDPR carve-out for cookies essential to a service explicitly requested by the user.

## Why this shape

- **Per-IP rate limiting was rejected** because the show runs on university WiFi: hundreds of visitors NAT to one egress IP. Per-IP limits would either be useless (so loose they'd never trigger) or catastrophic (locking out the entire venue after one spam burst).
- **Signed httpOnly cookie over localStorage UUID.** Both mechanisms trigger the same ePrivacy rules — the test is *purpose*, not *mechanism*. The cookie is preferred because (a) it composes with the existing `better-auth` cookie infrastructure, (b) it is not readable from JS (lower XSS surface), and (c) the signing key is server-held, so a determined griefer must round-trip a page reload to mint a new identity rather than `localStorage.clear()`.
- **No banner.** The cookie has a single purpose: rate-limit identity for anonymous abuse-prevention on a service the visitor has affirmatively requested by loading the Companion URL. No analytics, no marketing, no cross-site tracking. This is the textbook "strictly necessary" case.

## Defense in depth

Per-IP is not abandoned entirely — a coarse **global per-IP request ceiling** (e.g. 120 reqs/min across all endpoints) remains as a safety net against scripted abuse. It is loose enough not to affect real visitors on shared WiFi.

## Consequences

- Final legal responsibility sits with the university's DPO. This ADR is intended as a one-page primer for that review; do not remove this file even after the show is over — it justifies a live decision someone else will eventually re-question.
- If a future feature adds tracking, analytics, or any non-essential cookie, the banner-free justification no longer holds. That feature must either drop the cookie or add a real consent flow — it is not a small change.
- The cookie's signing secret is a deployment secret. Rotating it invalidates all live Mobile Companion identities, briefly resetting rate-limit counters; intentional but should not be done mid-show.
