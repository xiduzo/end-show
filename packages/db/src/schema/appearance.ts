import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { student } from "./student";

export const appearance = sqliteTable(
  "appearance",
  {
    id: text("id").primaryKey(),
    studentUserId: text("student_user_id")
      .notNull()
      .references(() => student.userId, { onDelete: "cascade" }),
    stageCode: text("stage_code"),
    source: text("source", { enum: ["kiosk", "mobile", "rotation"] }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("appearance_student_ended_idx").on(table.studentUserId, table.endedAt),
    index("appearance_stage_code_idx").on(table.stageCode),
  ],
);

export const companionClient = sqliteTable(
  "companion_client",
  {
    id: text("id").primaryKey(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
);

export const appearanceRelations = relations(appearance, ({ one }) => ({
  student: one(student, { fields: [appearance.studentUserId], references: [student.userId] }),
}));
