import { db } from "@end-show/db";
import { asset } from "@end-show/db/schema/asset";
import { user } from "@end-show/db/schema/auth";
import { student, studentCompetency } from "@end-show/db/schema/student";
import { TRPCError } from "@trpc/server";
import { eq, inArray, sum } from "drizzle-orm";
import { z } from "zod";

import {
  POOL_DISPLAYED_BYTES,
  POOL_PHYSICAL_BYTES,
} from "../budget";
import { router, staffProcedure } from "../index";
import { publicUrlFor } from "../r2";

const profileInput = z.object({
  displayName: z.string().trim().min(1).max(80),
  pronouns: z.string().trim().min(1).max(40),
  introduction: z.string().trim().min(1).max(500),
  link: z.string().trim().url().max(300),
  competencies: z.array(z.string().trim().min(1).max(40)).min(1).max(8),
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
      isPublished: boolean;
    }> = [];

    for (const s of students) {
      const usedRow = await db
        .select({ total: sum(asset.bytes) })
        .from(asset)
        .where(eq(asset.studentUserId, s.id));
      const used = Number(usedRow[0]?.total ?? 0);
      const studentRow = await db
        .select()
        .from(student)
        .where(eq(student.userId, s.id));
      perStudent.push({
        userId: s.id,
        name: s.name,
        email: s.email,
        usedBytes: used,
        isPublished: studentRow[0]?.isPublished ?? false,
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
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.role, "student"));
    const studentRows = await db.select().from(student);
    const byId = new Map(studentRows.map((s) => [s.userId, s]));
    return users
      .map((u) => {
        const s = byId.get(u.id);
        return {
          userId: u.id,
          name: u.name,
          email: u.email,
          hasProfile: Boolean(s),
          isPublished: s?.isPublished ?? false,
          displayName: s?.displayName ?? "",
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
        isPublished: s?.isPublished ?? false,
        competencies: comps.map((c) => c.tag),
        portraitUrl: portrait ? publicUrlFor(portrait.r2Key) : null,
        workMediaUrl: work ? publicUrlFor(work.r2Key) : null,
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
          isPublished: false,
        });
      } else {
        await db
          .update(student)
          .set({
            displayName: rest.displayName,
            pronouns: rest.pronouns,
            introduction: rest.introduction,
            link: rest.link,
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

  setStudentPublished: staffProcedure
    .input(z.object({ userId: z.string().min(1), isPublished: z.boolean() }))
    .mutation(async ({ input }) => {
      const rows = await db.select().from(student).where(eq(student.userId, input.userId));
      if (rows.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Profile not created yet",
        });
      }
      await db
        .update(student)
        .set({ isPublished: input.isPublished, updatedAt: new Date() })
        .where(eq(student.userId, input.userId));
      return { ok: true as const };
    }),
});
