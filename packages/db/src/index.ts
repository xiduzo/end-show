import { env } from "@end-show/env/server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

function extractBasicAuth(rawUrl: string): { url: string; auth?: string } {
  const parsed = new URL(rawUrl);
  if (!parsed.username) return { url: rawUrl };
  const user = decodeURIComponent(parsed.username);
  const pass = decodeURIComponent(parsed.password);
  parsed.username = "";
  parsed.password = "";
  return {
    url: parsed.toString(),
    auth: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
  };
}

export function createDb() {
  const { url, auth } = extractBasicAuth(env.DATABASE_URL);
  const client = createClient({
    url,
    authToken: env.LIBSQL_AUTH_TOKEN,
    fetch: auth
      ? (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
          const headers = new Headers(init?.headers);
          headers.set("Authorization", auth);
          return fetch(input, { ...init, headers });
        }
      : undefined,
  });

  // libsql's local (file:) client defaults foreign_keys OFF, so ON DELETE
  // cascade never fires and parent deletes orphan child rows. Enable it once;
  // the pragma is queued first on the connection and persists for its lifetime.
  // (Remote sqld/Turso enforces foreign keys server-side by default.)
  void client.execute("PRAGMA foreign_keys = ON");

  return drizzle({ client, schema });
}

export const db = createDb();
