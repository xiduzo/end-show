import { existsSync, readdirSync } from "node:fs";
import { env } from "@end-show/env/server";
import { migrate } from "drizzle-orm/libsql/migrator";

import { db } from "./index";

export async function runMigrations() {
  const folder = env.MIGRATIONS_DIR;
  console.log(`[migrate] cwd=${process.cwd()} folder=${folder}`);
  console.log(`[migrate] exists=${existsSync(folder)}`);
  if (existsSync(folder)) {
    console.log(`[migrate] contents=${readdirSync(folder).join(",")}`);
  }
  await migrate(db, { migrationsFolder: folder });
}
