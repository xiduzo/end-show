import { env } from "@end-show/env/server";
import { migrate } from "drizzle-orm/libsql/migrator";
import { and, eq } from "drizzle-orm";

import { titleCaseTag } from "./competency";
import { db } from "./index";
import { studentCompetency } from "./schema/student";

export async function runMigrations() {
  await migrate(db, { migrationsFolder: env.MIGRATIONS_DIR });
  await normalizeCompetencyTags();
}

/**
 * Idempotently title-case existing competency tags (restoring acronyms that
 * the 0007 SQL migration folded, e.g. "Ux" -> "UX"). Runs on every boot but
 * only writes rows whose canonical form differs, so it is a no-op once clean.
 */
async function normalizeCompetencyTags() {
  const rows = await db
    .select({ studentUserId: studentCompetency.studentUserId, tag: studentCompetency.tag })
    .from(studentCompetency);

  for (const row of rows) {
    const fixed = titleCaseTag(row.tag);
    if (fixed === row.tag) continue;

    const where = and(
      eq(studentCompetency.studentUserId, row.studentUserId),
      eq(studentCompetency.tag, row.tag),
    );
    // If the canonical tag already exists for this student, the row would
    // collide on the (student_user_id, tag) primary key — drop the duplicate.
    const collides = rows.some(
      (o) => o.studentUserId === row.studentUserId && o.tag === fixed,
    );
    if (collides) {
      await db.delete(studentCompetency).where(where);
    } else {
      await db.update(studentCompetency).set({ tag: fixed }).where(where);
    }
  }
}
