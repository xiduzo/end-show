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

export const budgetLoan = sqliteTable(
  "budget_loan",
  {
    id: text("id").primaryKey(),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bytes: integer("bytes").notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "declined", "cancelled", "returned"],
    })
      .notNull()
      .default("pending"),
    reason: text("reason").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    respondedAt: integer("responded_at", { mode: "timestamp_ms" }),
    returnedAt: integer("returned_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("budget_loan_from_idx").on(table.fromUserId),
    index("budget_loan_to_idx").on(table.toUserId),
    index("budget_loan_status_idx").on(table.status),
  ],
);

export const assetRelations = relations(asset, ({ one }) => ({
  student: one(student, { fields: [asset.studentUserId], references: [student.userId] }),
}));

export const budgetLoanRelations = relations(budgetLoan, ({ one }) => ({
  from: one(user, { fields: [budgetLoan.fromUserId], references: [user.id], relationName: "loansGiven" }),
  to: one(user, { fields: [budgetLoan.toUserId], references: [user.id], relationName: "loansReceived" }),
}));
