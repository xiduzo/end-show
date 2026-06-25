# Running end-show — a step-by-step guide

A step-by-step guide to running **end-show** from scratch. Be realistic about the
scope: this is a genuine deployment — a terminal, Docker, a config file to edit,
and (for a public show) a domain with HTTPS — so set aside some time and follow
the steps in order. You don't have to be a developer, but you should be
comfortable running commands in a terminal and editing a config file. Every
command is copy-pasteable and unfamiliar terms are explained where they come up.

> New here? Read the [README](../README.md) for what end-show *is*. Want the deep
> domain rules (queue, rotation, budgets)? See [CONTEXT.md](../CONTEXT.md).

**Contents:** [What you're running](#1-what-youre-running) ·
[Checklist](#2-checklist) · [The wiring](#3-the-wiring) ·
[A — Code](#step-a--get-the-code) · [B — Database](#step-b--database) ·
[C — R2 uploads](#step-c--optional-cloudflare-r2-for-uploads) ·
[D — Resend email](#step-d--optional-resend-for-login-emails) ·
[E — Settings](#step-e--fill-in-the-settings) ·
[F — Run](#step-f--build-and-run) · [G — Domains + HTTPS](#step-g--domains--https) ·
[H — First login](#step-h--first-login) · [Printer](#optional--printer) ·
[Settings reference](#settings-reference) · [Troubleshooting](#troubleshooting) ·
[Local without Docker](#running-locally-without-docker)

---

## 1. What you're running

Two programs plus a database, all packaged as **Docker containers** (a tool that
runs an app in a sealed box so it behaves the same anywhere — install it once
from <https://docs.docker.com/get-docker/>):

- **web** — the screens: the big **Stage**, the **Companion** phones/kiosks tap,
  and the staff/student admin.
- **server** — the brain: stores data, handles logins, keeps every Stage and
  Companion in sync in real time.

Storage (R2), email (Resend), and the [printer](#optional--printer) are optional
add-ons you can switch on later.

## 2. Checklist

- [ ] A machine with [Docker](https://docs.docker.com/get-docker/) (includes
      `docker compose`).
- [ ] The end-show code (this repository).
- [ ] *(For a public show)* a **domain name** you can point at the server.
- [ ] *(Optional)* a **Cloudflare** account — only if students upload photos/video.
- [ ] *(Optional)* a **Resend** account — only to email login codes instead of
      logging them.

The first two get you a working system; the rest are add-ons.

## 3. The wiring

```
            people's browsers / phones
                       │
        ┌──────────────┴──────────────┐
   ┌────▼─────┐  HTTPS / WSS    ┌──────▼───┐
   │   WEB    │ ───────────────▶│  SERVER  │──▶ RESEND (email, optional)
   │ (Stage,  │◀─────────────── │  Hono,   │──▶ DATABASE (libsql / SQLite)
   │Companion)│                 │  tRPC    │
   └────┬─────┘                 └──────────┘
        │ uploads: browser → R2 (optional), never via the server
        ▼
   ┌──────────┐
   │ R2 store │
   └──────────┘
```

The single most important idea: **the pieces must know each other's public
addresses.** Three settings do almost all the wiring — get them right and the
rest is detail:

| Setting | Lives on | Must point at |
|---|---|---|
| `VITE_SERVER_URL` | web (build time) | the **server's** public URL |
| `BETTER_AUTH_URL` | server | the **server's** own public URL |
| `CORS_ORIGIN`     | server | the **web app's** public URL |

> All three must be exact — matching `http`/`https`, **no trailing slash**.
> Mismatches here are the most common deployment failure.

---

## Step A — Get the code

```bash
git clone <your-repo-url> end-show
cd end-show
```

Everything below runs from inside this folder.

## Step B — Database

end-show stores data in **libsql** (a modern SQLite). Pick one option:

1. **Bundled (recommended to start)** — the included
   [`docker-compose.example.yml`](../docker-compose.example.yml) already runs a
   database service with a persistent volume. Nothing to do; skip to
   [Step E](#step-e--fill-in-the-settings).
2. **Turso (hosted)** — make a free DB at <https://turso.tech>, then set
   `DATABASE_URL=libsql://your-db.turso.io` and `LIBSQL_AUTH_TOKEN=<token>`, and
   delete the `db:` service from your compose file.
3. **A plain file** — set `DATABASE_URL=file:/data/local.db` and mount a volume
   at `/data`. Simplest, but awkward to scale past one container.

> You never create tables by hand — the server runs all migrations on every boot.

## Step C — (Optional) Cloudflare R2 for uploads

Skip if students won't upload images/video yet; the upload buttons just won't
work, and you can add this later. **R2** is Cloudflare's file storage (like an S3
bucket); end-show uploads files **straight from the browser to R2**, so the
server never handles the bytes.

1. In Cloudflare → **R2**, create a bucket (e.g. `end-show-assets`).
2. Create an **R2 API token** with read/write to it; note the **Access Key ID**
   and **Secret Access Key**.
3. Note your **Account ID** (R2 overview page).
4. Give the bucket a **public URL** (the R2 "public development URL" or a custom
   domain like `assets.your-domain.example`).
5. These become `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL` in [Step E](#step-e--fill-in-the-settings).

**Allow your site to upload (CORS).** Because the browser uploads directly, the
bucket must accept uploads from your site's address. Run the helper inside the
server container (it already has your R2 keys):

```bash
docker compose run --rm \
  -e R2_CORS_ORIGINS="https://your-domain.example" \
  server bun packages/api/scripts/set-r2-cors.ts
```

`R2_CORS_ORIGINS` is your web app's public URL(s), comma-separated. Skip this and
uploads fail with a CORS error. *(Outside Docker, the script needs the full
server config present — run it from `apps/server` with the env loaded.)*

## Step D — (Optional) Resend for login emails

Logins use a **6-digit code**, no passwords. Without Resend the code is printed
to the **server logs** (`docker compose logs server`) — fine for testing,
useless for real users. To email it:

1. Make an account at <https://resend.com> and create an **API key**.
2. *(Recommended)* verify your sending domain so mail isn't flagged as spam.
3. Set `RESEND_API_KEY=<key>` and `RESEND_FROM` (e.g.
   `Graduation Show <noreply@your-domain.example>`).

## Step E — Fill in the settings

The server reads settings from environment variables.

**With Docker Compose (recommended):**

```bash
cp docker-compose.example.yml docker-compose.yml
```

Edit the values marked `CHANGE-ME`:

- `DATABASE_URL` and the DB password (only if using the bundled `db`).
- `BETTER_AUTH_SECRET` — generate one: `openssl rand -base64 32`.
- `BETTER_AUTH_URL` — your server's public URL (e.g. `https://api.your-domain.example`).
- `CORS_ORIGIN` — your web app's public URL.
- `ROOT_STAFF_EMAIL` / `ROOT_STAFF_NAME` — **your** email and name (the first
  staff login).
- `VITE_SERVER_URL` (under the `web` service `build.args`) — same as
  `BETTER_AUTH_URL`.
- Uncomment the R2 / Resend blocks if you set those up.

**Running containers by hand instead:**
`cp apps/server/.env.example apps/server/.env` and edit that. Either way, the
[settings reference](#settings-reference) explains every value.

## Step F — Build and run

**Docker Compose (easy):**

```bash
docker compose up -d --build
docker compose ps           # all services "running"
docker compose logs server  # look for "Server listening..." + seed messages
```

By default web maps to port **8080** and server to **3000**. Open
<http://localhost:8080>. For a public deploy, continue to
[Step G](#step-g--domains--https).

**Manual `docker build` / `docker run`:**

```bash
docker build -f Dockerfile.server -t end-show-server .
docker build -f Dockerfile.web \
  --build-arg VITE_SERVER_URL=https://api.your-domain.example \
  -t end-show-web .
docker run -d --name end-show-server -p 3000:3000 --env-file apps/server/.env end-show-server
docker run -d --name end-show-web -p 8080:80 end-show-web
```

> The server URL is baked into the web bundle at **build** time. Change the
> server's address → **rebuild** the web image.

## Step G — Domains + HTTPS

For a real show you want two HTTPS addresses — `https://your-domain.example` (web)
and `https://api.your-domain.example` (server). The cleanest way is a **reverse
proxy** that handles TLS automatically; [Caddy](https://caddyserver.com) is the
most beginner-friendly:

```caddyfile
your-domain.example      { reverse_proxy web:80 }
api.your-domain.example  { reverse_proxy server:3000 }
```

Caddy fetches and renews certificates and forwards WebSockets (needed for live
Stage/Companion sync). Point both DNS records at your server's IP.

> Hosted platforms (Railway, Render, Fly.io, Dokploy…) give each container a
> domain and TLS — just set the three URL settings to the domains they assign.

**Public-deploy checklist:**

- [ ] `NODE_ENV=production` (so demo students are **not** seeded).
- [ ] The three URL settings use real `https://` domains, no trailing slash.
- [ ] Web image **rebuilt** after setting the real `VITE_SERVER_URL`.
- [ ] R2 CORS updated to your real web domain (if using uploads).

## Step H — First login

1. Open the web app and go to the staff/admin login.
2. Enter your `ROOT_STAFF_EMAIL`.
3. Get the 6-digit code — from the inbox (Resend) or the logs
   (`docker compose logs server`, line like `[auth][otp] ... otp=123456`).
4. Enter it. You're in as staff and can seed students, manage profiles, and open
   the Stage. Students log in the same way once added.

## Optional — Printer

To print student cards on a thermal printer, run the **printer service**
(`apps/printer`) on the same machine as the Stage display. It's a small Python
HTTP service that talks to the printer over Bluetooth or USB; the Stage forwards
print jobs to it on `localhost`. It is **not** part of the Docker stack — see its
own guide: **[apps/printer/README.md](../apps/printer/README.md)**.

---

## Settings reference

Server variables unless noted. Template:
[`apps/server/.env.example`](../apps/server/.env.example).

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | ✅ | DB location: `file:./local.db`, `libsql://...turso.io`, or `http://user:pass@host:8080`. |
| `LIBSQL_AUTH_TOKEN` | – | Token for Turso/hosted libsql. Blank otherwise. |
| `MIGRATIONS_DIR` | – | Where migrations live. Set automatically inside Docker. |
| `BETTER_AUTH_SECRET` | ✅ | Random 32+ char secret signing login sessions. |
| `BETTER_AUTH_URL` | ✅ | The server's own public URL (no trailing slash). |
| `CORS_ORIGIN` | ✅ | Comma-separated web origins allowed to call the server. |
| `NODE_ENV` | – | `development` (seeds demo students) or `production`. Default `development`. |
| `R2_ACCOUNT_ID` · `R2_BUCKET` · `R2_ACCESS_KEY_ID` · `R2_SECRET_ACCESS_KEY` · `R2_PUBLIC_URL` | – | Cloudflare R2 uploads (all five together). |
| `BUDGET_DEFAULT_BYTES` | – | Starting storage budget per student. Default 30 MB. |
| `BUDGET_TRANSFER_FLOOR_BYTES` | – | Minimum a student keeps after gifting budget. Default 5 MB. |
| `RESEND_API_KEY` | – | Resend key for emailing codes. Blank = codes go to logs. |
| `RESEND_FROM` | – | The "From" address for those emails. |
| `ROOT_STAFF_EMAIL` / `ROOT_STAFF_NAME` | – | First staff account, seeded on boot. Set to *your* details. |
| **`VITE_SERVER_URL`** | ✅ | **(web, build time)** The server's public URL, baked into the web bundle. |

## Troubleshooting

**Web loads but nothing happens / network errors.** `VITE_SERVER_URL` is wrong or
the web image wasn't rebuilt: `docker compose up -d --build web`.

**CORS error talking to the server.** `CORS_ORIGIN` must list the web app's exact
public URL (scheme + host, no trailing slash); multiple are comma-separated.

**Login codes never arrive.** With `RESEND_API_KEY` unset, codes are only in the
logs. If Resend *is* set, verify your sending domain so mail isn't spam-filtered.

**Logged out / "unauthorized" in production.** Serve **both** web and server over
**HTTPS** and make `BETTER_AUTH_URL` match the server's real URL. Hosting both on
one parent domain (`your-domain.example` + `api.your-domain.example`) avoids
cross-site cookie issues.

**Uploads fail with CORS / 403.** The bucket isn't accepting uploads from your web
domain — re-run the CORS script in [Step C](#step-c--optional-cloudflare-r2-for-uploads).

**~50 students I didn't create appeared.** That's the development seed. Set
`NODE_ENV=production` and use a fresh database.

**The Stage freezes when no one is watching.** Intentional — a Stage with no
viewers pauses to keep timing fair, and resumes on reconnect. See
[CONTEXT.md](../CONTEXT.md#no-audience-pause).

## Running locally without Docker

For development you only need [Bun](https://bun.sh) — see the
[README quick start](../README.md#quick-start-local-development):

```bash
bun install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env
bun run db:push
bun run dev                          # web :5173, server :3000
```

~50 demo students are seeded and login codes print to the server terminal.
