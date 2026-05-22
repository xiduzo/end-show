import { relations, sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

export const student = sqliteTable("student", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull().default(""),
  pronouns: text("pronouns").notNull().default(""),
  introduction: text("introduction").notNull().default(""),
  link: text("link").notNull().default(""),
  stageColor: text("stage_color"),
  portraitAssetId: text("portrait_asset_id"),
  workMediaAssetId: text("work_media_asset_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const studentCompetency = sqliteTable(
  "student_competency",
  {
    studentUserId: text("student_user_id")
      .notNull()
      .references(() => student.userId, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.studentUserId, table.tag] }),
    index("student_competency_student_idx").on(table.studentUserId),
  ],
);

export const studentRelations = relations(student, ({ one, many }) => ({
  user: one(user, { fields: [student.userId], references: [user.id] }),
  competencies: many(studentCompetency),
}));

export const studentCompetencyRelations = relations(studentCompetency, ({ one }) => ({
  student: one(student, {
    fields: [studentCompetency.studentUserId],
    references: [student.userId],
  }),
}));
