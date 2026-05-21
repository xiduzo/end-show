# Stage Code alphabet, length, and pairing flow

A Stage Code is a **4-character uppercase token from a 26-letter alphabet** with the visually-ambiguous and easy-to-misread characters `0`, `1`, `I`, `L`, `O`, `U` excluded, and a small profanity blocklist applied at generation (regenerate up to 32 times). The Stage Code is generated client-side on the Stage display, persisted in the Stage browser's `localStorage` via Zustand, and shared with Companions by **QR code only** — there is no server-issued or numeric-only code.

## Considered alternatives

- **Numeric PIN (e.g. 4 digits).** Rejected. 10^4 = 10,000 codes is plenty for one show, but the Cap on shared visual ambiguity is gone — `0`/`8`/`6` and `1`/`7` are still hostile in low light or at a glance. We get richer entropy *and* better legibility from a curated 4-letter alphabet.
- **Full Crockford alphabet (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`, 32 chars).** Rejected. We don't need 32^4 codes (~1M) and the visual confusability return of mixing digits and letters isn't worth it for our scale. Letters-only is faster to type on the Kiosk keypad too.
- **Server-issued code with collision check.** Rejected. The Stage is the *origin* of the code (it's what visitors scan), so a round-trip to the server to mint one introduces a failure mode on first boot. With our small per-show population, client-side generation with a profanity reject is sufficient; collisions are accepted (worst case: two Stages would partition the same channel — recoverable by re-tap).
- **Banner-style "scan to pair" QR + manual entry fallback only.** Initial design. Refined: the Stage shows **two QRs side by side** — Visitor (`/companion`) and Kiosk (`/companion/kiosk`) — both pre-loaded with `?code=XXXX`. Manual entry exists only on the Kiosk Companion page as a fallback for QR-cam failure; Mobile visitors are not expected to type codes.

## Consequences

- Profanity blocklist is conservative and English-only (`ASS`, `FUK`, `FUC`, `CUM`, `TIT`, `GAY`, `FAG`, `NIG`, `SUX`, `WTF`). False negatives are tolerated (we won't catch every offensive 4-letter combo in every language); the show is bounded and Staff can regenerate by re-tapping the corner gesture if a bad code slips through. A real i18n profanity filter is out of scope.
- The corner-tap gesture (5 taps in 2s) to regenerate a Stage Code is intentionally discoverable only to Staff who know to look for it. Do not surface it as a button on the idle screen — that turns it into a griefer affordance for any visitor at the Stage.
- Stage Code lives in `localStorage`, so closing the Stage tab keeps the same code on next boot. This is the desired behavior: Staff who refresh by accident don't lose all the QRs they printed. Clearing storage is a deliberate Staff action.
- Future internationalization of the alphabet (e.g. removing letters that collide in other scripts) would invalidate printed QR codes mid-show. Don't do it without a regenerate cycle.
