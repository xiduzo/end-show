import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

const MIG_DIR = join(import.meta.dir, "../packages/db/src/migrations");
const DB_PATH = join(import.meta.dir, "../local.db");

const journal = JSON.parse(
  readFileSync(join(MIG_DIR, "meta/_journal.json"), "utf8"),
) as { entries: { tag: string; when: number }[] };

const db = new Database(DB_PATH);

db.exec(`CREATE TABLE IF NOT EXISTS __drizzle_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash text NOT NULL,
  created_at numeric
)`);

const insert = db.prepare(
  "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
);

for (const entry of journal.entries) {
  const sql = readFileSync(join(MIG_DIR, `${entry.tag}.sql`), "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");
  insert.run(hash, entry.when);
  console.log(`marked applied: ${entry.tag} (${hash.slice(0, 12)}…)`);
}

console.log("done");
