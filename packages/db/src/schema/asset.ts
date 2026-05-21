import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { student } from "./student";

export const asset = sqliteTable(
  "asset",
  {
    id: text("id").primaryKey(),
    studentUserId: text("student_user_id")
      .notNull()
      .references(() => student.userId, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["portrait", "work-image", "work-video"] }).notNull(),
    r2Key: text("r2_key").notNull().unique(),
    bytes: integer("bytes").notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [index("asset_student_idx").on(table.studentUserId)],
);

export const budgetTransfer = sqliteTable(
  "budget_transfer",
  {
    id: text("id").primaryKey(),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bytes: integer("bytes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("budget_transfer_from_idx").on(table.fromUserId),
    index("budget_transfer_to_idx").on(table.toUserId),
  ],
);

export const assetRelations = relations(asset, ({ one }) => ({
  student: one(student, { fields: [asset.studentUserId], references: [student.userId] }),
}));

export const budgetTransferRelations = relations(budgetTransfer, ({ one }) => ({
  from: one(user, { fields: [budgetTransfer.fromUserId], references: [user.id], relationName: "transfersGiven" }),
  to: one(user, { fields: [budgetTransfer.toUserId], references: [user.id], relationName: "transfersReceived" }),
}));
