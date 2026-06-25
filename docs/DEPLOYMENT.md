# Running end-show — a step-by-step guide

This guide walks you through running the **end-show** platform from scratch, in
plain language. You do **not** need to be a developer to follow it — every
command can be copy-pasted. If a step mentions something you don't recognise,
there is a short explanation right next to it.

> Want the bird's-eye view of what end-show *is* first? See the
> [README](../README.md). Want the deep domain rules (queue, rotation, budgets)?
> See [CONTEXT.md](../CONTEXT.md).

---

## Contents

1. [What you are about to run](#1-what-you-are-about-to-run)
2. [What you'll need](#2-what-youll-need)
3. [The 4 building blocks](#3-the-4-building-blocks)
4. [Step A — Get the code](#step-a--get-the-code)
5. [Step B — Set up the database](#step-b--set-up-the-database)
6. [Step C — (Optional) Cloudflare R2 for uploads](#step-c--optional-cloudflare-r2-for-uploads)
7. [Step D — (Optional) Resend for login emails](#step-d--optional-resend-for-login-emails)
8. [Step E — Fill in the settings](#step-e--fill-in-the-settings)
9. [Step F — Build and run the two containers](#step-f--build-and-run-the-two-containers)
10. [Step G — Put it on the internet (domains + HTTPS)](#step-g--put-it-on-the-internet-domains--https)
11. [Step H — Log in for the first time](#step-h--log-in-for-the-first-time)
12. [Settings reference (every variable)](#settings-reference-every-variable)
13. [Troubleshooting](#troubleshooting)
14. [Running locally without Docker](#running-locally-without-docker)

---

## 1. What you are about to run

end-show is **two programs** plus a database:

- **The web app** — the screens people look at: the big **Stage** screen, the
  **Companion** (the phone/kiosk visitors tap), and the staff/student admin.
- **The server** — the brain. It stores data, handles logins, and keeps every
  Stage and Companion in sync in real time.

Both are packaged as **Docker containers**, so you don't install Bun, Node, or
any libraries by hand — Docker builds everything inside a sealed box.

> **What is Docker?** A tool that runs an app inside a self-contained "container"
> so it behaves the same on any machine. You install Docker once; it does the
> rest. Get it from <https://docs.docker.com/get-docker/>.

---

## 2. What you'll need

A checklist before you start:

- [ ] **A computer or server** with [Docker](https://docs.docker.com/get-docker/)
      installed (includes `docker compose`).
- [ ] **The end-show code** (this repository).
- [ ] **A database** — the simplest option is built into the example below, so
      you don't need an account anywhere to start.
- [ ] *(For a real public show)* **A domain name** and the ability to point it at
      your server, e.g. `your-domain.example`.
- [ ] *(Optional)* A **Cloudflare** account — only if students will upload photos
      or video. [Step C](#step-c--optional-cloudflare-r2-for-uploads).
- [ ] *(Optional)* A **Resend** account — only if you want login codes emailed
      instead of printed to a log. [Step D](#step-d--optional-resend-for-login-emails).

You can get a working system with just the first three. Storage and email are
add-ons you can switch on later.

---

## 3. The 4 building blocks

```
                  people's browsers / phones
                            │
        ┌───────────────────┴────────────────────┐
        │                                          │
   ┌────▼─────┐    real-time + API (HTTPS/WSS) ┌───▼──────┐
   │   WEB    │ ───────────────────────────────▶│  SERVER  │
   │ (Stage,  │◀─────────────────────────────── │  (Hono,  │
   │Companion,│                                  │  tRPC)   │
   │  admin)  │                                  └──┬────┬──┘
   └────┬─────┘                                     │    │
        │  uploads go straight to storage           │    │ login codes
        │  (browser → R2, never via server)         │    ▼
        ▼                                            │  ┌────────┐
   ┌──────────┐                                      │  │ RESEND │ (email, optional)
   │  R2      │ ◀────────────────────────────────────┘  └────────┘
   │ storage  │                                      │
   │(optional)│                                 ┌────▼─────┐
   └──────────┘                                 │ DATABASE │ (libsql / SQLite)
                                                └──────────┘
```

The single most important idea when deploying: **the pieces must know each
other's public addresses.** Three settings do almost all the wiring:

| Setting | Lives on | Must point at |
|---|---|---|
| `VITE_SERVER_URL` | web (build time) | the **server's** public URL |
| `BETTER_AUTH_URL` | server | the **server's** own public URL |
| `CORS_ORIGIN`     | server | the **web app's** public URL |

Get those three right and the rest is detail.

---

## Step A — Get the code

Download or clone this repository onto the machine that will run it, and open a
terminal in that folder.

```bash
git clone <your-repo-url> end-show
cd end-show
```

> Everything below is run from inside this `end-show` folder.

---

## Step B — Set up the database

end-show stores its data in **libsql** (a modern SQLite). You have three options;
pick the one that matches you.

### Option 1 — Bundled database (recommended to start)

The included [`docker-compose.example.yml`](../docker-compose.example.yml) already
contains a database service. **You don't have to do anything here** — it runs
alongside the server and stores its data in a Docker volume that survives
restarts. Jump to [Step E](#step-e--fill-in-the-settings).

### Option 2 — Turso (hosted, zero servers to manage)

1. Make a free database at <https://turso.tech>.
2. Copy its URL (looks like `libsql://your-db.turso.io`) and an auth token.
3. Later, in the server settings, set:
   - `DATABASE_URL=libsql://your-db.turso.io`
   - `LIBSQL_AUTH_TOKEN=<the token>`
4. Delete the `db:` service from your compose file.

### Option 3 — A plain file (single container, simplest possible)

Set `DATABASE_URL=file:/data/local.db` and mount a volume at `/data` so the file
survives restarts. Good for a quick trial; less convenient if you scale to more
than one server container.

> **You never create tables by hand.** The server runs all database migrations
> automatically every time it boots, so the schema is always up to date.

---

## Step C — (Optional) Cloudflare R2 for uploads

Skip this if students won't upload images/video yet — the app runs fine without
it; the upload buttons just won't work. You can add it later.

**What is R2?** Cloudflare's file storage (like an S3 bucket). end-show uploads
files **directly from the browser to R2** — the server never handles the file
bytes — so it stays fast and cheap.

1. In the Cloudflare dashboard, go to **R2** and **create a bucket** (e.g.
   `end-show-assets`).
2. Create an **R2 API token** with read/write to that bucket. Note the
   **Access Key ID** and **Secret Access Key**.
3. Find your **Account ID** (shown on the R2 overview page).
4. Give the bucket a **public URL** — either enable the R2 "public development
   URL" or connect a custom domain (e.g. `assets.your-domain.example`).
5. You'll put these into the server settings in [Step E](#step-e--fill-in-the-settings):
   `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_PUBLIC_URL`.

### Allow your website to upload (CORS)

Because the browser uploads straight to R2, the bucket must be told to **accept
uploads from your website's address**. This is called CORS. There's a helper
script that sets it for you — and the easiest way to run it is inside the server
container, which already has your R2 keys configured:

```bash
docker compose run --rm \
  -e R2_CORS_ORIGINS="https://your-domain.example" \
  server bun packages/api/scripts/set-r2-cors.ts
```

`R2_CORS_ORIGINS` is your web app's public URL(s), comma-separated. Everything
else (the `R2_*` keys) is read from the server's settings you filled in earlier.

> **Running it outside Docker?** The script loads the *full* server
> configuration, so it needs all the server settings present — not just the
> `R2_*` ones. Make sure `apps/server/.env` is filled in and run it from there
> (`cd apps/server && bun ../../packages/api/scripts/set-r2-cors.ts`, with
> `R2_CORS_ORIGINS` exported), or just use the Docker command above.

If you skip this step, uploads fail in the browser with a CORS error.

---

## Step D — (Optional) Resend for login emails

end-show logs people in with a **6-digit code** (no passwords). That code has to
reach the user somehow.

- **Without Resend:** the code is printed to the **server logs**. Fine for
  testing on your own machine (`docker compose logs server`), useless for real
  users.
- **With Resend:** the code is emailed.

To enable email:

1. Make an account at <https://resend.com> and create an **API key**.
2. *(Recommended)* Verify your sending domain so mail doesn't land in spam.
3. Set in the server settings: `RESEND_API_KEY=<key>` and `RESEND_FROM` to a
   verified sender, e.g. `Graduation Show <noreply@your-domain.example>`.

---

## Step E — Fill in the settings

The server reads its settings from environment variables. Two ways to provide
them:

### If you use Docker Compose (recommended)

```bash
cp docker-compose.example.yml docker-compose.yml
```

Open `docker-compose.yml` and edit the values marked `CHANGE-ME`:

- `DATABASE_URL` and the database password (only if using the bundled `db`).
- `BETTER_AUTH_SECRET` — generate a random one: `openssl rand -base64 32`.
- `BETTER_AUTH_URL` — your server's public URL (e.g. `https://api.your-domain.example`).
- `CORS_ORIGIN` — your web app's public URL (e.g. `https://your-domain.example`).
- `ROOT_STAFF_EMAIL` / `ROOT_STAFF_NAME` — **your** email and name; this becomes
  the first staff login.
- `VITE_SERVER_URL` (under the `web` service `build.args`) — same as
  `BETTER_AUTH_URL`.
- Uncomment the R2 and Resend blocks if you set those up.

### If you run containers by hand

Copy the example env file and edit it instead:

```bash
cp apps/server/.env.example apps/server/.env   # then edit it
```

Either way, the [settings reference](#settings-reference-every-variable) explains
every value.

> **The most common mistake:** trailing slashes or `http` vs `https` mismatches
> between `VITE_SERVER_URL`, `BETTER_AUTH_URL`, and `CORS_ORIGIN`. They must be
> exact, with **no trailing slash**.

---

## Step F — Build and run the two containers

### The easy way — Docker Compose

```bash
docker compose up -d --build
```

That builds both images, starts the database, server, and web, and wires them
together. Check it's alive:

```bash
docker compose ps           # all services "running"
docker compose logs server  # look for "Server listening..." and seed messages
```

By default this maps the **web** app to port **8080** and the **server** to port
**3000** on your machine. Open <http://localhost:8080> to see it. For a real
public deployment, continue to [Step G](#step-g--put-it-on-the-internet-domains--https).

### The manual way — plain `docker build` / `docker run`

If you'd rather not use Compose:

```bash
# 1) Build the server image
docker build -f Dockerfile.server -t end-show-server .

# 2) Build the web image — the server URL is baked in HERE, at build time
docker build -f Dockerfile.web \
  --build-arg VITE_SERVER_URL=https://api.your-domain.example \
  -t end-show-web .

# 3) Run the server (reads settings from your edited env file)
docker run -d --name end-show-server -p 3000:3000 \
  --env-file apps/server/.env \
  end-show-server

# 4) Run the web app
docker run -d --name end-show-web -p 8080:80 end-show-web
```

> **Why is the server URL needed at *build* time for the web app?** The web app is
> compiled into static files, and the server address is written into those files
> during the build. If you change the server's address, you must **rebuild** the
> web image.

---

## Step G — Put it on the internet (domains + HTTPS)

For a real show you want two addresses, both secured with HTTPS:

- `https://your-domain.example` → the **web** app
- `https://api.your-domain.example` → the **server**

The cleanest way is a **reverse proxy** in front of the two containers that
handles HTTPS automatically. [Caddy](https://caddyserver.com) is the most
beginner-friendly. A minimal `Caddyfile`:

```caddyfile
your-domain.example {
    reverse_proxy web:80
}

api.your-domain.example {
    reverse_proxy server:3000
}
```

Caddy fetches and renews TLS certificates for you, and it forwards WebSocket
connections automatically (end-show needs those for the live Stage/Companion
sync). Point both DNS records at your server's IP and you're done.

> Hosted platforms (Railway, Render, Fly.io, Dokploy, etc.) give each container a
> domain and TLS for you — in that case just set the three URL settings to the
> domains they assign and skip the proxy.

**Checklist for a public deploy:**

- [ ] `NODE_ENV=production` (so demo students are **not** seeded).
- [ ] `VITE_SERVER_URL`, `BETTER_AUTH_URL`, `CORS_ORIGIN` all use your real
      `https://` domains, no trailing slash.
- [ ] Web image **rebuilt** after setting the real `VITE_SERVER_URL`.
- [ ] R2 CORS updated to your real web domain (if using uploads).

---

## Step H — Log in for the first time

1. Open the web app (`https://your-domain.example`).
2. Go to the staff/admin login and enter the `ROOT_STAFF_EMAIL` you configured.
3. Retrieve the 6-digit code:
   - **With Resend:** check that inbox.
   - **Without Resend:** read it from the logs — `docker compose logs server`
     and look for a line like `[auth][otp] ... otp=123456`.
4. Enter the code. You're in as staff and can seed students, manage profiles, and
   open the Stage.

> Students log in the same way with their own email once you've added them.

---

## Settings reference (every variable)

These belong to the **server** unless noted. Template:
[`apps/server/.env.example`](../apps/server/.env.example).

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | ✅ | Database location. `file:./local.db`, `libsql://...turso.io`, or `http://user:pass@host:8080`. |
| `LIBSQL_AUTH_TOKEN` | – | Token for Turso/hosted libsql. Leave blank otherwise. |
| `MIGRATIONS_DIR` | – | Where migration files live. Set automatically inside Docker. |
| `BETTER_AUTH_SECRET` | ✅ | Random 32+ char secret that signs login sessions. |
| `BETTER_AUTH_URL` | ✅ | The server's own public URL (no trailing slash). |
| `CORS_ORIGIN` | ✅ | Comma-separated list of web origins allowed to call the server. |
| `NODE_ENV` | – | `development` (seeds demo students) or `production`. Default `development`. |
| `R2_ACCOUNT_ID` | – | Cloudflare account ID (uploads). |
| `R2_BUCKET` | – | R2 bucket name. |
| `R2_ACCESS_KEY_ID` | – | R2 API access key. |
| `R2_SECRET_ACCESS_KEY` | – | R2 API secret. |
| `R2_PUBLIC_URL` | – | Public base URL that serves uploaded files back. |
| `BUDGET_DEFAULT_BYTES` | – | Starting storage budget per student. Default 30 MB. |
| `BUDGET_TRANSFER_FLOOR_BYTES` | – | Minimum budget a student keeps after gifting some away. Default 5 MB. |
| `RESEND_API_KEY` | – | Resend key for emailing login codes. Blank = codes go to logs. |
| `RESEND_FROM` | – | The "From" address for those emails. |
| `ROOT_STAFF_EMAIL` | – | First staff account, seeded on boot. Set this to *your* email. |
| `ROOT_STAFF_NAME` | – | Display name for that first staff account. |
| **`VITE_SERVER_URL`** | ✅ | **(web, build time)** The server's public URL, baked into the web bundle. |

---

## Troubleshooting

**The web app loads but nothing happens / network errors in the browser console.**
`VITE_SERVER_URL` is wrong or the web image wasn't rebuilt after you changed it.
Rebuild: `docker compose up -d --build web`.

**Browser console shows a CORS error talking to the server.**
`CORS_ORIGIN` on the server must list the web app's exact public URL (scheme +
host, no trailing slash). Multiple origins are comma-separated.

**Login codes never arrive.**
If `RESEND_API_KEY` is unset, codes are only in the logs
(`docker compose logs server`). To email them, set up [Resend](#step-d--optional-resend-for-login-emails).
If Resend *is* set, verify your sending domain so mail isn't filtered as spam.

**Login seems to work but I get logged out / "unauthorized" in production.**
Make sure **both** the web app and server are served over **HTTPS**, and that
`BETTER_AUTH_URL` matches the server's real public URL. Hosting the two on the
same parent domain (`your-domain.example` + `api.your-domain.example`) avoids
cross-site cookie issues.

**Uploads fail with a CORS / 403 error.**
The R2 bucket hasn't been told to accept uploads from your web domain. Re-run the
CORS script in [Step C](#step-c--optional-cloudflare-r2-for-uploads) with the
correct `R2_CORS_ORIGINS`.

**~50 students I didn't create appeared.**
That's the development seed data. Set `NODE_ENV=production` and use a fresh
database for the real show.

**The Stage screen freezes when no one is watching.**
That's intentional — a Stage with no connected viewers pauses to keep the timing
fair. It resumes when a Stage screen reconnects. See
[CONTEXT.md](../CONTEXT.md#no-audience-pause).

---

## Running locally without Docker

For development on your own machine you don't need Docker at all. You need
[Bun](https://bun.sh) installed, then:

```bash
bun install                          # install dependencies
cp apps/server/.env.example apps/server/.env   # default values work for local
cp apps/web/.env.example apps/web/.env          # points the web app at the local server
bun run db:push                      # create the database tables
bun run dev                          # web on :5173, server on :3000
```

Open <http://localhost:5173>. In development, ~50 demo students are seeded
automatically and login codes print to the terminal running the server. Log in
with the default `ROOT_STAFF_EMAIL` (or change it in `apps/server/.env` first).

Handy scripts (see the [README](../README.md#scripts) for the full list):

| Command | Does |
|---|---|
| `bun run dev` | Run web + server together with hot reload |
| `bun run dev:web` / `bun run dev:server` | Run just one side |
| `bun run db:push` | Create/update database tables |
| `bun run db:studio` | Open a visual database browser |
| `bun run check-types` | Type-check everything |
