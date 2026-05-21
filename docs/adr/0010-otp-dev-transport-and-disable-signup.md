# OTP development transport (console.log) and disableSignUp posture

In development, the `sendVerificationOTP` hook in `better-auth`'s `emailOTP` plugin writes the code to **`console.log` on server stdout**, not to a real email provider. The `disableSignUp` option is **`false`** in development so that hitting a fresh email address auto-creates a user row with `role: "student"`.

## Considered alternatives

- **Mailpit / Mailhog / a local SMTP catcher.** Rejected for the dev loop. Adding a service-port dependency for a single developer iterating on the auth flow is more friction than reading one line in the terminal. We'd lean toward this if multiple devs were testing OTP flows simultaneously, but we're not.
- **A `?dev_otp=` URL escape hatch.** Rejected — bypasses the verification table entirely, which means the dev flow exercises a *different* code path from prod. Sticking to a real OTP through a logged channel keeps dev and prod symmetric.
- **`disableSignUp: true` from the start with a Staff-managed allowlist.** This is the *target* posture for show day, but pre-deploy we want every contributor to be able to sign in with their own email without a Staff round-trip. We tighten this in the deploy step.

## Consequences

- A production deploy MUST swap the `sendVerificationOTP` body to a real provider (Resend, Postmark, SES, etc.) before show day. Forgetting this means OTPs go to stdout in production logs — a real auth-bypass given log readability. This is a release-checklist item, not a TODO.
- A production deploy SHOULD flip `disableSignUp: true` and pre-seed Staff + Student rows from the cohort roster. Without this, anyone with an email address can mint a Student account and queue themselves into the rotation. This is the showtime abuse vector.
- Email is now a critical-path dependency for *both* Staff intervention (per [ADR-0001](0001-otp-only-authentication.md)) and Student onboarding. A staging dry-run with the real provider before show day is non-negotiable.
- The dev `console.log` line includes the OTP in plaintext. Do not enable `--inspect` or remote log forwarding on dev without filtering — anyone watching the log can sign in as anyone they know an email for. (In dev. Whatever.)
