import { db } from "@end-show/db";
import { asset, budgetLoan } from "@end-show/db/schema/asset";
import { user } from "@end-show/db/schema/auth";
import { student, studentCompetency } from "@end-show/db/schema/student";
import { env } from "@end-show/env/server";
import { TRPCError } from "@trpc/server";
import { eq, inArray, sum } from "drizzle-orm";
import { z } from "zod";

import {
  POOL_DISPLAYED_BYTES,
  POOL_PHYSICAL_BYTES,
} from "../budget";
import { getAssetStore } from "../assetStore";
import { router, staffProcedure } from "../index";
import type { StageColor } from "./student";

const draftLink = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || z.string().url().safeParse(v).success, {
    message: "Invalid URL",
  });

const stageColorSchema = z.enum(["slime", "crayon", "bubblegum"]);

const profileInput = z.object({
  displayName: z.string().trim().max(80),
  pronouns: z.string().trim().max(40),
  introduction: z.string().trim().max(80),
  link: draftLink,
  competencies: z.array(z.string().trim().min(1).max(40)).max(5),
  stageColor: stageColorSchema.nullable(),
});

export const adminRouter = router({
  poolSummary: staffProcedure.query(async () => {
    const totalRow = await db.select({ total: sum(asset.bytes) }).from(asset);
    const totalUsedBytes = Number(totalRow[0]?.total ?? 0);

    const students = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.role, "student"));

    const perStudent: Array<{
      userId: string;
      name: string;
      email: string;
      usedBytes: number;
    }> = [];

    for (const s of students) {
      const usedRow = await db
        .select({ total: sum(asset.bytes) })
        .from(asset)
        .where(eq(asset.studentUserId, s.id));
      const used = Number(usedRow[0]?.total ?? 0);
      perStudent.push({
        userId: s.id,
        name: s.name,
        email: s.email,
        usedBytes: used,
      });
    }

    perStudent.sort((a, b) => b.usedBytes - a.usedBytes);

    return {
      poolDisplayedBytes: POOL_DISPLAYED_BYTES,
      poolPhysicalBytes: POOL_PHYSICAL_BYTES,
      totalUsedBytes,
      perStudent,
    };
  }),

  listStudents: staffProcedure.query(async () => {
    const users = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(eq(user.role, "student"));
    const studentRows = await db.select().from(student);
    const byId = new Map(studentRows.map((s) => [s.userId, s]));
    const compRows = await db.select().from(studentCompetency);
    const compsByUser = new Map<string, string[]>();
    for (const c of compRows) {
      const arr = compsByUser.get(c.studentUserId) ?? [];
      arr.push(c.tag);
      compsByUser.set(c.studentUserId, arr);
    }
    const assetRows = await db
      .select({
        studentUserId: asset.studentUserId,
        bytes: asset.bytes,
        kind: asset.kind,
      })
      .from(asset);
    const usedByUser = new Map<string, number>();
    const kindsByUser = new Map<string, Set<string>>();
    for (const a of assetRows) {
      usedByUser.set(
        a.studentUserId,
        (usedByUser.get(a.studentUserId) ?? 0) + a.bytes,
      );
      const set = kindsByUser.get(a.studentUserId) ?? new Set<string>();
      set.add(a.kind);
      kindsByUser.set(a.studentUserId, set);
    }
    const loanRows = await db
      .select()
      .from(budgetLoan)
      .where(eq(budgetLoan.status, "accepted"));
    const inByUser = new Map<string, number>();
    const outByUser = new Map<string, number>();
    for (const t of loanRows) {
      inByUser.set(t.toUserId, (inByUser.get(t.toUserId) ?? 0) + t.bytes);
      outByUser.set(
        t.fromUserId,
        (outByUser.get(t.fromUserId) ?? 0) + t.bytes,
      );
    }
    const defaultBytes = env.BUDGET_DEFAULT_BYTES;

    return users
      .map((u) => {
        const s = byId.get(u.id);
        const used = usedByUser.get(u.id) ?? 0;
        const budget =
          defaultBytes +
          (inByUser.get(u.id) ?? 0) -
          (outByUser.get(u.id) ?? 0);
        const kinds = kindsByUser.get(u.id);
        const workMediaKind: "work-image" | "work-video" | null =
          kinds?.has("work-video")
            ? "work-video"
            : kinds?.has("work-image")
              ? "work-image"
              : null;
        const updatedAt = s?.updatedAt ?? u.createdAt;
        const comps = compsByUser.get(u.id) ?? [];
        const isComplete = Boolean(
          s &&
            s.displayName &&
            s.pronouns &&
            s.introduction &&
            s.link &&
            comps.length > 0,
        );
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          hasProfile: Boolean(s),
          isComplete,
          displayName: s?.displayName ?? "",
          pronouns: s?.pronouns ?? "",
          link: s?.link ?? "",
          competencies: comps,
          workMediaKind,
          hasMedia: Boolean(kinds && kinds.size > 0),
          usedBytes: used,
          budgetBytes: budget,
          overBudget: used > budget,
          updatedAt: updatedAt instanceof Date ? updatedAt.getTime() : Date.now(),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }),

  getStudent: staffProcedure
    .input(z.object({ userId: z.string().min(1) }))
    .query(async ({ input }) => {
      const userRows = await db.select().from(user).where(eq(user.id, input.userId));
      const u = userRows[0];
      if (!u || u.role !== "student") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      }
      const studentRows = await db
        .select()
        .from(student)
        .where(eq(student.userId, input.userId));
      const s = studentRows[0];
      const comps = await db
        .select()
        .from(studentCompetency)
        .where(eq(studentCompetency.studentUserId, input.userId));
      const assetIds = [s?.portraitAssetId, s?.workMediaAssetId].filter(
        (v): v is string => v !== null && v !== undefined,
      );
      const assets =
        assetIds.length > 0
          ? await db.select().from(asset).where(inArray(asset.id, assetIds))
          : [];
      const byAssetId = new Map(assets.map((a) => [a.id, a]));
      const portrait = s?.portraitAssetId ? byAssetId.get(s.portraitAssetId) : undefined;
      const work = s?.workMediaAssetId ? byAssetId.get(s.workMediaAssetId) : undefined;
      return {
        userId: u.id,
        name: u.name,
        email: u.email,
        displayName: s?.displayName ?? "",
        pronouns: s?.pronouns ?? "",
        introduction: s?.introduction ?? "",
        link: s?.link ?? "",
        competencies: comps.map((c) => c.tag),
        stageColor: (s?.stageColor as StageColor | null) ?? null,
        portraitUrl: portrait ? getAssetStore().publicUrl(portrait.r2Key) : null,
        workMediaUrl: work ? getAssetStore().publicUrl(work.r2Key) : null,
        workMediaKind:
          work?.kind === "work-image" || work?.kind === "work-video"
            ? work.kind
            : null,
      };
    }),

  upsertStudent: staffProcedure
    .input(z.object({ userId: z.string().min(1) }).and(profileInput))
    .mutation(async ({ input }) => {
      const { userId, ...rest } = input;
      const userRows = await db.select().from(user).where(eq(user.id, userId));
      const u = userRows[0];
      if (!u || u.role !== "student") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      }
      const existing = await db.select().from(student).where(eq(student.userId, userId));
      if (existing.length === 0) {
        await db.insert(student).values({
          userId,
          displayName: rest.displayName,
          pronouns: rest.pronouns,
          introduction: rest.introduction,
          link: rest.link,
          stageColor: rest.stageColor,
        });
      } else {
        await db
          .update(student)
          .set({
            displayName: rest.displayName,
            pronouns: rest.pronouns,
            introduction: rest.introduction,
            link: rest.link,
            stageColor: rest.stageColor,
            updatedAt: new Date(),
          })
          .where(eq(student.userId, userId));
      }
      await db
        .delete(studentCompetency)
        .where(eq(studentCompetency.studentUserId, userId));
      if (rest.competencies.length > 0) {
        await db
          .insert(studentCompetency)
          .values(rest.competencies.map((tag) => ({ studentUserId: userId, tag })));
      }
      return { ok: true as const };
    }),

});
