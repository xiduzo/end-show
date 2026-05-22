import { env } from "@end-show/env/server";
import { migrate } from "drizzle-orm/libsql/migrator";

import { db } from "./index";

export async function runMigrations() {
  await migrate(db, { migrationsFolder: env.MIGRATIONS_DIR });
}
