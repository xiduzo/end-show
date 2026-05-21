import { db } from "@end-show/db";
import { asset } from "@end-show/db/schema/asset";
import { user } from "@end-show/db/schema/auth";
import { student, studentCompetency } from "@end-show/db/schema/student";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { protectedProcedure, publicProcedure, router } from "../index";
import { publicUrlFor } from "../r2";

export type StudentSummary = {
  userId: string;
  displayName: string;
  pronouns: string;
  introduction: string;
  link: string;
  portraitUrl: string | null;
  competencies: string[];
};

export type MyProfile = {
  userId: string;
  displayName: string;
  pronouns: string;
  introduction: string;
  link: string;
  isPublished: boolean;
  competencies: string[];
  portraitUrl: string | null;
  workMediaUrl: string | null;
  workMediaKind: "work-image" | "work-video" | null;
};

function isComplete(s: Omit<StudentSummary, "portraitUrl">): boolean {
  return Boolean(
    s.displayName &&
      s.pronouns &&
      s.introduction &&
      s.link &&
      s.competencies.length > 0,
  );
}

const profileInput = z.object({
  displayName: z.string().trim().min(1).max(80),
  pronouns: z.string().trim().min(1).max(40),
  introduction: z.string().trim().min(1).max(500),
  link: z.string().trim().url().max(300),
  competencies: z
    .array(z.string().trim().min(1).max(40))
    .min(1)
    .max(8),
});

export const studentRouter = router({
  listEligible: publicProcedure.query(async (): Promise<StudentSummary[]> => {
    const rows = await db.select().from(student).where(eq(student.isPublished, true));
    const comps = await db.select().from(studentCompetency);
    const byStudent = new Map<string, string[]>();
    for (const c of comps) {
      const list = byStudent.get(c.studentUserId) ?? [];
      list.push(c.tag);
      byStudent.set(c.studentUserId, list);
    }
    const portraitIds = rows
      .map((r) => r.portraitAssetId)
      .filter((id): id is string => id !== null && id !== undefined);
    const portraitRows =
      portraitIds.length > 0
        ? await db.select().from(asset).where(inArray(asset.id, portraitIds))
        : [];
    const portraitByAssetId = new Map(portraitRows.map((a) => [a.id, a.r2Key]));

    const all: StudentSummary[] = rows.map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      pronouns: r.pronouns,
      introduction: r.introduction,
      link: r.link,
      portraitUrl: r.portraitAssetId
        ? (portraitByAssetId.get(r.portraitAssetId)
            ? publicUrlFor(portraitByAssetId.get(r.portraitAssetId)!)
            : null)
        : null,
      competencies: byStudent.get(r.userId) ?? [],
    }));
    return all.filter(isComplete);
  }),

  getMyProfile: protectedProcedure.query(async ({ ctx }): Promise<MyProfile | null> => {
    const userId = ctx.session.user.id;
    const rows = await db.select().from(student).where(eq(student.userId, userId));
    const row = rows[0];
    if (!row) return null;
    const comps = await db
      .select()
      .from(studentCompetency)
      .where(eq(studentCompetency.studentUserId, userId));

    const assetIds = [row.portraitAssetId, row.workMediaAssetId].filter(
      (v): v is string => v !== null && v !== undefined,
    );
    const assetRows =
      assetIds.length > 0
        ? await db.select().from(asset).where(inArray(asset.id, assetIds))
        : [];
    const byId = new Map(assetRows.map((a) => [a.id, a]));
    const portraitRow = row.portraitAssetId ? byId.get(row.portraitAssetId) : undefined;
    const workRow = row.workMediaAssetId ? byId.get(row.workMediaAssetId) : undefined;

    return {
      userId: row.userId,
      displayName: row.displayName,
      pronouns: row.pronouns,
      introduction: row.introduction,
      link: row.link,
      isPublished: row.isPublished,
      competencies: comps.map((c) => c.tag),
      portraitUrl: portraitRow ? publicUrlFor(portraitRow.r2Key) : null,
      workMediaUrl: workRow ? publicUrlFor(workRow.r2Key) : null,
      workMediaKind:
        workRow?.kind === "work-image" || workRow?.kind === "work-video"
          ? workRow.kind
          : null,
    };
  }),

  upsertProfile: protectedProcedure
    .input(profileInput)
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const userId = ctx.session.user.id;
      const existing = await db.select().from(student).where(eq(student.userId, userId));
      if (existing.length === 0) {
        await db.insert(student).values({
          userId,
          displayName: input.displayName,
          pronouns: input.pronouns,
          introduction: input.introduction,
          link: input.link,
          isPublished: false,
        });
      } else {
        await db
          .update(student)
          .set({
            displayName: input.displayName,
            pronouns: input.pronouns,
            introduction: input.introduction,
            link: input.link,
            updatedAt: new Date(),
          })
          .where(eq(student.userId, userId));
      }
      await db
        .delete(studentCompetency)
        .where(eq(studentCompetency.studentUserId, userId));
      if (input.competencies.length > 0) {
        await db
          .insert(studentCompetency)
          .values(input.competencies.map((tag) => ({ studentUserId: userId, tag })));
      }
      return { ok: true };
    }),

  listPeers: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    const rows = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(and(eq(user.role, "student"), ne(user.id, me)));
    return rows;
  }),

  setPublished: protectedProcedure
    .input(z.object({ isPublished: z.boolean() }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const userId = ctx.session.user.id;
      const rows = await db.select().from(student).where(eq(student.userId, userId));
      if (rows.length === 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Save profile before publishing",
        });
      }
      await db
        .update(student)
        .set({ isPublished: input.isPublished, updatedAt: new Date() })
        .where(eq(student.userId, userId));
      return { ok: true };
    }),
});
