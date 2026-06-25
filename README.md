# end-show

**end-show** is the live software behind a graduation show. A big screen — the
**Stage** — rotates through graduating students' profiles, while visitors use a
phone or kiosk — the **Companion** — to tap a student and pull them onto the
Stage. Students sign in to fill out their own profile and upload a portrait and
work media.

It's a single, always-on web app (no scheduled start/stop). Multiple Stages and
many Companions can run at the same time, all kept in sync in real time.

> **Just want to run it?** → **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** is a
> plain-language, step-by-step guide (no developer experience required).
>
> **Want the full domain rules** (queue, rotation, stage time, storage budgets)?
> → **[CONTEXT.md](CONTEXT.md)**.

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

- **web** (`apps/web`) — React + TanStack Router PWA. Stage, Companion, and the
  staff/student admin. Built to static files and served on port `80`.
- **server** (`apps/server`) — Hono + tRPC on Bun, port `3000`. Realtime over
  WebSocket; runs database migrations and seeds the first staff account on boot.
- **Cloudflare R2** — asset storage (portraits, work media), uploaded straight
  from the browser via presigned PUTs. *Optional.*
- **Resend** — emails the 6-digit one-time login codes. *Optional* (codes print
  to the server log when absent).

## Tech stack

TypeScript · [Bun](https://bun.sh) · [Turborepo](https://turbo.build) ·
[React](https://react.dev) + [TanStack Router](https://tanstack.com/router) ·
[TailwindCSS](https://tailwindcss.com) + shared [shadcn/ui](https://ui.shadcn.com)
in `packages/ui` · [Hono](https://hono.dev) · [tRPC](https://trpc.io) ·
[Drizzle ORM](https://orm.drizzle.team) · libsql/[Turso](https://turso.tech) ·
[Better-Auth](https://better-auth.com) (OTP-only) · PWA.

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

To run the whole thing in Docker instead, or to deploy it for a real show, follow
**[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

## Project structure

```
end-show/
├── apps/
│   ├── web/         # Frontend PWA — Stage, Companion, admin (React + TanStack Router)
│   ├── server/      # Backend API (Hono, tRPC, WebSocket) — apps/server/.env.example
│   └── printer/     # Thermal receipt-printer companion (Python, BLE) — optional
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic (queue engine, asset store)
│   ├── auth/        # Better-Auth (OTP) configuration
│   ├── db/          # Drizzle schema, migrations, libsql client
│   ├── env/         # Validated environment-variable schemas
│   └── config/      # Shared TS / tooling config
docs/                # DEPLOYMENT.md (run/deploy guide), adr/ (decisions), design-tokens.md
docker-compose.example.yml   # one-command stack — copy to docker-compose.yml
Dockerfile.server · Dockerfile.web
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

React apps share shadcn/ui primitives through `packages/ui`.

- Design tokens & global styles: `packages/ui/src/styles/globals.css`
- Shared primitives: `packages/ui/src/components/*`, imported as
  `import { Button } from "@end-show/ui/components/button";`
- Add more shared primitives from the repo root:
  `npx shadcn@latest add dialog popover sheet table -c packages/ui`
- For app-only blocks, run the shadcn CLI from `apps/web` instead.

## Deploying

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** — accounts you need, every
environment variable explained, Cloudflare R2 + CORS, email, building and wiring
the two containers, domains/HTTPS, and troubleshooting.
