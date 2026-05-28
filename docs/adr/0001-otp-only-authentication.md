# OTP-only authentication

Graduation Show is a one-shot live event where forgotten-password support on show day is an unacceptable failure mode. We use `better-auth` with **email OTP only** — no password credentials are issued, stored, or accepted — so neither Students nor Staff can lock themselves out in a way that requires a recovery flow we won't be staffing.

## Consequences

- `better-auth`'s password and password-reset surfaces are intentionally disabled / unused. A contributor seeing the unused code paths should not "wire them back up" — that is reversing this decision.
- The Student onboarding flow assumes the Staff-seeded email address is reachable. If a Student's email bounces, Staff must edit the email on the seeded account before the Student can sign in. There is no password fallback.
- Adds an email-delivery dependency to the critical path of show-day login. The email provider is a single point of failure for Staff intervention and must be operational.
