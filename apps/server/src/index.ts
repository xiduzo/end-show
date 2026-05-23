import { createContext } from "@end-show/api/context";
import { getAppearanceLog } from "@end-show/api/queue/appearanceLog";
import { DWELL_MS } from "@end-show/api/queue/engine";
import { appRouter } from "@end-show/api/routers/index";
import { auth } from "@end-show/auth";
import { runMigrations } from "@end-show/db/migrate";
import { env } from "@end-show/env/server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import {
  type CreateBunContextOptions,
  createBunHttpHandler,
  createBunWSHandler,
} from "trpc-bun-adapter";

import { seedRootStaff } from "./seed";

const app = new Hono();

app.use(logger());

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/", (c) => c.text("OK"));

const port = Number(process.env.PORT ?? 3000);

await runMigrations();
await seedRootStaff();

// ADR-0007 §Recovery — close Appearance rows orphaned by a previous process
// (in-memory Queue state is rebuilt fresh; an open row would otherwise
// inflate Stage Time forever). Best-guess fill = one Dwell.
{
  const closed = await getAppearanceLog().closeAllOpen(DWELL_MS);
  if (closed > 0) {
    console.log(`Closed ${closed} orphan appearance row(s) at boot.`);
  }
}

// ADR-0007 §Recovery — janitor catches in-show leaks: failed `log.end()`
// writes (engine.ts) and the fire-and-forget `log.end()` in subscribeStage's
// last-listener cleanup. Threshold is generous so legitimately-extended
// in-flight appearances are never clipped.
const JANITOR_INTERVAL_MS = 60_000;
const JANITOR_MAX_AGE_MS = DWELL_MS * 10;
const janitor = setInterval(() => {
  void getAppearanceLog()
    .closeAllOpen(DWELL_MS, JANITOR_MAX_AGE_MS)
    .then((n) => {
      if (n > 0) console.log(`Janitor closed ${n} orphan appearance row(s).`);
    })
    .catch((err: unknown) => {
      console.error("Janitor closeAllOpen failed:", err);
    });
}, JANITOR_INTERVAL_MS);

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    clearInterval(janitor);
  });
}

const trpcCreateContext = async (opts: CreateBunContextOptions) => {
  return createContext({ headers: opts.req.headers });
};

const httpHandler = createBunHttpHandler({
  router: appRouter,
  endpoint: "/trpc",
  createContext: trpcCreateContext,
  onError({ error, path }: { error: unknown; path?: string }) {
    console.error(`tRPC error on ${path ?? "?"}:`, error);
  },
  emitWsUpgrades: true,
});

const websocket = createBunWSHandler({
  router: appRouter,
  createContext: trpcCreateContext,
});

const ALLOWED_ORIGINS = env.CORS_ORIGIN.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow ?? "",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function withCors(res: Response, origin: string | null): Response {
  const headers = corsHeaders(origin);
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

Bun.serve({
  port,
  async fetch(req, server) {
    const origin = req.headers.get("origin");

    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, x-trpc-source",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    const trpcResp = httpHandler(req, server);
    if (trpcResp) {
      const resolved = await trpcResp;
      // 101 upgrades have no body to mutate
      if (resolved.status === 101) return resolved;
      return withCors(resolved, origin);
    }

    const honoResp = await app.fetch(req, server);
    return withCors(honoResp, origin);
  },
  websocket,
});

console.log(
  `Server listening on http://localhost:${port} (tRPC at /trpc, WS at /trpc)`,
);
