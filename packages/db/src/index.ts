import { env } from "@end-show/env/server";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "./schema";

export function createDb() {
  const client = createClient({
    url: env.DATABASE_URL,
    authToken: env.LIBSQL_AUTH_TOKEN,
  });

  return drizzle({ client, schema });
}

export const db = createDb();
