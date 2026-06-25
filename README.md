# end-show

**end-show** is the live software behind a graduation show. A big screen — the
**Stage** — rotates through graduating students' profiles, while visitors use a
phone or kiosk — the **Companion** — to tap a student and pull them onto the
Stage. Students sign in to fill out their own profile and upload a portrait and
work media. An optional thermal **Printer** prints a student's card on demand.

It's a single, always-on web app (no scheduled start/stop). Multiple Stages and
many Companions can run at the same time, all kept in sync in real time.

> - **Just want to run it?** → **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** —
>   copy-paste, no developer experience needed.
> - **How the show actually runs** (Stage Codes, tracks, the selection
>   algorithm, preempts)? → **[docs/STAGE.md](docs/STAGE.md)**.
> - **The full domain rules** (queue, rotation, budgets)? →
>   **[CONTEXT.md](CONTEXT.md)**.

## How it fits together

```
        browsers / phones
               │
   ┌───────────┴────────────┐
   │  WEB                    │   live + API (HTTPS / WebSocket)   ┌──────────┐
   │  Stage · Companion ·    │ ◀────────────────────────────────▶│  SERVER  │
   │  admin (React PWA)      │                                    │ Hono·tRPC│
   └───────────┬────────────┘                                    └────┬──┬──┘
               │ uploads go browser → R2 (server never proxies bytes) │  │
               ▼                                                       │  ▼
        ┌────────────┐                                ┌──────────┐     │ ┌────────┐
        │ Cloudflare │                                │ libsql / │ ◀───┘ │ Resend │
        │ R2 storage │                                │  SQLite  │       │ email  │
        └────────────┘                                └──────────┘       └────────┘
```

- **web** (`apps/web`) — React + TanStack Router PWA: Stage, Companion, and the
  staff/student admin. Built to static files, served on port `80`.
- **server** (`apps/server`) — Hono + tRPC on Bun, port `3000`. Realtime over
  WebSocket; runs migrations and seeds the first staff account on boot.
- **printer** (`apps/printer`) — *optional* Python HTTP service on the machine
  the thermal printer is plugged into (the Stage host). Prints a profile card —
  portrait + QR. → **[apps/printer/README.md](apps/printer/README.md)**.
- **Cloudflare R2** — asset storage (portraits, work media), uploaded straight
  from the browser via presigned PUTs. *Optional.*
- **Resend** — emails the 6-digit login codes. *Optional* (codes print to the
  server log when absent).

## Stage & Companion

The **Stage** is the big screen; the **Companion** (`/companion`) is the
controller visitors use to push a student onto it. One server runs several
independent Stages at once.

- **Stage Code** — an optional 4-character code (e.g. `K7QM`) in the URL
  (`/?code=K7QM`). Everything sharing a code shares one synchronized show. No
  code = the default Stage. The Stage shows the code plus a QR to pair a phone in
  one scan.
- **Tracks** — limit a Stage to one or more programme tracks via
  `&tracks=IxD,DFT`. No filter = all tracks.
- **Tiers** — a Companion is **Kiosk** on wide screens (≥ 768px) or **Mobile** on
  phones; Kiosk outranks Mobile in the queue.

Who appears is decided by a fairness algorithm over a rolling 60-minute **Stage
Time** (least-seen students favoured); a Companion tap can **preempt** the
rotation and pull a student to the centre immediately, additively.

→ Full mechanics — selection, queue priorities, dwell, preempt/extend — are in
**[docs/STAGE.md](docs/STAGE.md)**.

## Tech stack

TypeScript · [Bun](https://bun.sh) · [Turborepo](https://turbo.build) ·
[React](https://react.dev) + [TanStack Router](https://tanstack.com/router) ·
[TailwindCSS](https://tailwindcss.com) + shared [shadcn/ui](https://ui.shadcn.com)
in `packages/ui` · [Hono](https://hono.dev) · [tRPC](https://trpc.io) ·
[Drizzle ORM](https://orm.drizzle.team) · libsql/[Turso](https://turso.tech) ·
[Better-Auth](https://better-auth.com) (OTP-only) · PWA. The printer service is
Python ([uv](https://docs.astral.sh/uv/)).

## Quick start (local development)

Needs [Bun](https://bun.sh).

```bash
bun install
cp apps/server/.env.example apps/server/.env   # defaults are fine for local
cp apps/web/.env.example apps/web/.env          # points the web app at :3000
bun run db:push                                # create the database tables
bun run dev                                     # web → :5173, server → :3000
```

Open <http://localhost:5173>. In development the app seeds ~50 demo students and
prints login codes to the server terminal. Log in as staff with the
`ROOT_STAFF_EMAIL` from `apps/server/.env`.

To run in Docker or deploy for a real show, follow
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Project structure

```
end-show/
├── apps/
│   ├── web/         # Frontend PWA — Stage, Companion, admin (React + TanStack Router)
│   ├── server/      # Backend API (Hono, tRPC, WebSocket)
│   └── printer/     # Thermal receipt-printer service (Python, Bluetooth/USB) — optional
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # Business logic (queue engine, asset store, printer relay)
│   ├── auth/        # Better-Auth (OTP) configuration
│   ├── db/          # Drizzle schema, migrations, libsql client
│   ├── env/         # Validated environment-variable schemas
│   └── config/      # Shared TS / tooling config
docs/                # DEPLOYMENT.md, STAGE.md, adr/, design-tokens.md
docker-compose.example.yml · Dockerfile.server · Dockerfile.web
CONTEXT.md           # the domain model and show rules
```

## Scripts

| Command | Does |
|---|---|
| `bun run dev` | Start web + server in development |
| `bun run dev:web` / `bun run dev:server` | Start just one side |
| `bun run build` | Build all apps |
| `bun run check-types` | Type-check across the monorepo |
| `bun run db:push` | Push schema changes to the database |
| `bun run db:generate` | Generate migration files from the schema |
| `bun run db:migrate` | Run migrations |
| `bun run db:studio` | Open the visual database browser |
| `bun run db:local` | Start a local libsql server |

## Shared UI

React apps share shadcn/ui primitives through `packages/ui`, imported as
`@end-show/ui/components/button`. Design tokens live in
`packages/ui/src/styles/globals.css`. Add primitives from the repo root with
`npx shadcn@latest add <name> -c packages/ui` (or from `apps/web` for app-only
blocks).

## Deploying

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — accounts, every environment
variable, Cloudflare R2 + CORS, email, the two containers, domains/HTTPS, and
troubleshooting.
