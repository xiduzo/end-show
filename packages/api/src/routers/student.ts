import { sendReviewRequestEmail } from "@end-show/auth/email";
import { db } from "@end-show/db";
import { asset } from "@end-show/db/schema/asset";
import { user } from "@end-show/db/schema/auth";
import { student, studentCompetency } from "@end-show/db/schema/student";
import { env } from "@end-show/env/server";
import { TRPCError } from "@trpc/server";
import { observable } from "@trpc/server/observable";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { getAssetStore } from "../assetStore";
import { protectedProcedure, publicProcedure, router } from "../index";
import { isStudentProfileComplete } from "../profileCompleteness";
import { rankForCompanion } from "../queue/stageTime";
import {
  type StudentUpdate,
  emitStudentUpdate,
  subscribeStudentUpdates,
} from "../studentEvents";

export type StageColor = "slime" | "crayon" | "bubblegum";

export type Track = "IxD" | "DFT";

export type StudentSummary = {
  userId: string;
  displayName: string;
  pronouns: string;
  introduction: string;
  link: string;
  stageColor: StageColor | null;
  track: Track;
  portraitUrl: string | null;
  workMediaUrl: string | null;
  workMediaKind: "work-image" | "work-video" | null;
  competencies: string[];
  /** Sum of on-Stage ms in the rolling Stage Time window. Populated by
   *  listEligible via the Stage Time module; sentinel `0` from single-
   *  Student fetches. ADR-0011. */
  stageTimeMs: number;
  /** True when this Student sits in the top decile by Stage Time and should
   *  be hidden from the Companion list while no filter is active. */
  hideWhenIdle: boolean;
};

export type MyProfile = {
  userId: string;
  displayName: string;
  pronouns: string;
  introduction: string;
  link: string;
  stageColor: StageColor | null;
  track: Track;
  competencies: string[];
  portraitUrl: string | null;
  workMediaUrl: string | null;
  workMediaKind: "work-image" | "work-video" | null;
  isFlagged: boolean;
  flaggedReason: string;
  reviewRequest: "none" | "pending" | "denied";
};

function isComplete(s: Omit<StudentSummary, "portraitUrl" | "workMediaKind">): boolean {
  return isStudentProfileComplete(s, s.competencies.length);
}

const stageColorSchema = z.enum(["slime", "crayon", "bubblegum"]);
export const trackSchema = z.enum(["IxD", "DFT"]);

const STAGE_COLORS: readonly StageColor[] = ["slime", "crayon", "bubblegum"];

export function defaultStageColor(seed: string): StageColor {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return STAGE_COLORS[h % STAGE_COLORS.length]!;
}

export const draftLink = z
  .string()
  .trim()
  .max(300)
  .transform((v) => {
    if (v === "") return "";
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  })
  .refine((v) => v === "" || z.string().url().safeParse(v).success, {
    message: "Invalid URL",
  });

const profileInput = z.object({
  displayName: z.string().trim().max(80),
  pronouns: z.string().trim().max(40),
  introduction: z.string().trim().max(80),
  link: draftLink,
  stageColor: stageColorSchema.nullable(),
  competencies: z.array(z.string().trim().min(1).max(18)).max(5),
});

export const studentRouter = router({
  listEligible: publicProcedure.query(async (): Promise<StudentSummary[]> => {
    const joined = await db
      .select({ s: student })
      .from(student)
      .innerJoin(user, eq(user.id, student.userId))
      .where(and(eq(user.role, "student"), eq(student.isFlagged, false)));
    const rows = joined.map((j) => j.s);
    const comps = await db.select().from(studentCompetency);
    const byStudent = new Map<string, string[]>();
    for (const c of comps) {
      const list = byStudent.get(c.studentUserId) ?? [];
      list.push(c.tag);
      byStudent.set(c.studentUserId, list);
    }
    const assetIds = rows
      .flatMap((r) => [r.portraitAssetId, r.workMediaAssetId])
      .filter((id): id is string => id !== null && id !== undefined);
    const assetRows =
      assetIds.length > 0
        ? await db.select().from(asset).where(inArray(asset.id, assetIds))
        : [];
    const assetById = new Map(assetRows.map((a) => [a.id, a]));

    const all: StudentSummary[] = rows.map((r) => {
      const portrait = r.portraitAssetId ? assetById.get(r.portraitAssetId) : undefined;
      const work = r.workMediaAssetId ? assetById.get(r.workMediaAssetId) : undefined;
      return {
        userId: r.userId,
        displayName: r.displayName,
        pronouns: r.pronouns,
        introduction: r.introduction,
        link: r.link,
        stageColor: (r.stageColor as StageColor | null) ?? null,
        track: (r.track as Track | undefined) ?? "IxD",
        portraitUrl: portrait ? getAssetStore().publicUrl(portrait.r2Key) : null,
        workMediaUrl: work ? getAssetStore().publicUrl(work.r2Key) : null,
        workMediaKind:
          work?.kind === "work-image" || work?.kind === "work-video" ? work.kind : null,
        competencies: byStudent.get(r.userId) ?? [],
        stageTimeMs: 0,
        hideWhenIdle: false,
      };
    });
    const complete = all.filter(isComplete);
    await rankForCompanion(complete);
    return complete;
  }),

  byUserId: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }): Promise<StudentSummary | null> => {
      const rows = await db
        .select({ s: student })
        .from(student)
        .innerJoin(user, eq(user.id, student.userId))
        .where(
          and(
            eq(student.userId, input.userId),
            eq(user.role, "student"),
            eq(student.isFlagged, false),
          ),
        );
      const row = rows[0]?.s;
      if (!row) return null;
      const comps = await db
        .select()
        .from(studentCompetency)
        .where(eq(studentCompetency.studentUserId, input.userId));
      const assetIds = [row.portraitAssetId, row.workMediaAssetId].filter(
        (v): v is string => v !== null && v !== undefined,
      );
      const assetRows =
        assetIds.length > 0
          ? await db.select().from(asset).where(inArray(asset.id, assetIds))
          : [];
      const byId = new Map(assetRows.map((a) => [a.id, a]));
      const portraitRow = row.portraitAssetId
        ? byId.get(row.portraitAssetId)
        : undefined;
      const workRow = row.workMediaAssetId
        ? byId.get(row.workMediaAssetId)
        : undefined;
      return {
        userId: row.userId,
        displayName: row.displayName,
        pronouns: row.pronouns,
        introduction: row.introduction,
        link: row.link,
        stageColor: (row.stageColor as StageColor | null) ?? null,
        track: (row.track as Track | undefined) ?? "IxD",
        competencies: comps.map((c) => c.tag),
        portraitUrl: portraitRow
          ? getAssetStore().publicUrl(portraitRow.r2Key)
          : null,
        workMediaUrl: workRow ? getAssetStore().publicUrl(workRow.r2Key) : null,
        workMediaKind:
          workRow?.kind === "work-image" || workRow?.kind === "work-video"
            ? workRow.kind
            : null,
        stageTimeMs: 0,
        hideWhenIdle: false,
      };
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
      stageColor: (row.stageColor as StageColor | null) ?? null,
      track: (row.track as Track | undefined) ?? "IxD",
      competencies: comps.map((c) => c.tag),
      portraitUrl: portraitRow ? getAssetStore().publicUrl(portraitRow.r2Key) : null,
      workMediaUrl: workRow ? getAssetStore().publicUrl(workRow.r2Key) : null,
      workMediaKind:
        workRow?.kind === "work-image" || workRow?.kind === "work-video"
          ? workRow.kind
          : null,
      isFlagged: Boolean(row.isFlagged),
      flaggedReason: row.flaggedReason,
      reviewRequest: (row.reviewRequest as "none" | "pending" | "denied") ?? "none",
    };
  }),

  requestReview: protectedProcedure
    .input(z.object({ message: z.string().trim().max(500) }))
    .mutation(async ({ ctx, input }): Promise<{ ok: true }> => {
      const userId = ctx.session.user.id;
      const rows = await db.select().from(student).where(eq(student.userId, userId));
      const row = rows[0];
      if (!row || !row.isFlagged) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Your profile is not flagged",
        });
      }
      if (row.reviewRequest === "pending") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have a re-review request pending",
        });
      }
      if (row.reviewRequest === "denied") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your re-review request was already declined",
        });
      }
      await db
        .update(student)
        .set({ reviewRequest: "pending", reviewMessage: input.message, updatedAt: new Date() })
        .where(eq(student.userId, userId));

      // Notify the staff member who flagged them; fall back to root staff for
      // legacy flags with no recorded flagger.
      const me = ctx.session.user as { name: string; email: string };
      let to = env.ROOT_STAFF_EMAIL;
      let staffName = "there";
      if (row.flaggedBy) {
        const staffRows = await db.select().from(user).where(eq(user.id, row.flaggedBy));
        const staff = staffRows[0];
        if (staff) {
          to = staff.email;
          staffName = staff.name;
        }
      }
      try {
        await sendReviewRequestEmail({
          to,
          staffName,
          studentName: me.name,
          studentUserId: userId,
          reason: row.flaggedReason,
          message: input.message,
        });
      } catch (e) {
        console.warn("[student] review request email failed", e);
      }
      emitStudentUpdate(userId);
      return { ok: true };
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
          stageColor: input.stageColor,
        });
      } else {
        await db
          .update(student)
          .set({
            displayName: input.displayName,
            pronouns: input.pronouns,
            introduction: input.introduction,
            link: input.link,
            stageColor: input.stageColor,
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
      emitStudentUpdate(userId);
      return { ok: true };
    }),

  watchUpdates: publicProcedure.subscription(() =>
    observable<StudentUpdate>((emit) => {
      return subscribeStudentUpdates((u) => emit.next(u));
    }),
  ),

  cohortTags: protectedProcedure
    .input(z.object({ excludeUserId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const sessionUserId = ctx.session.user.id;
      const role = (ctx.session.user as { role?: string }).role;
      const excludeId =
        role === "staff" && input?.excludeUserId
          ? input.excludeUserId
          : sessionUserId;
      const rows = await db
        .select()
        .from(studentCompetency)
        .where(ne(studentCompetency.studentUserId, excludeId));
      const counts = new Map<string, number>();
      for (const r of rows) {
        counts.set(r.tag, (counts.get(r.tag) ?? 0) + 1);
      }
      return Array.from(counts.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    }),

  listPeers: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    const rows = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(and(eq(user.role, "student"), ne(user.id, me)));
    return rows;
  }),

});
