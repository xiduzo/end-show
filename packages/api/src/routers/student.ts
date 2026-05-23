import { db } from "@end-show/db";
import { asset } from "@end-show/db/schema/asset";
import { user } from "@end-show/db/schema/auth";
import { student, studentCompetency } from "@end-show/db/schema/student";
import { observable } from "@trpc/server/observable";
import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { getAssetStore } from "../assetStore";
import { protectedProcedure, publicProcedure, router } from "../index";
import {
  STAGE_TIME_WINDOW_MS,
  getAppearanceLog,
} from "../queue/appearanceLog";
import {
  type StudentUpdate,
  emitStudentUpdate,
  subscribeStudentUpdates,
} from "../studentEvents";

export type StageColor = "slime" | "crayon" | "bubblegum";

export type StudentSummary = {
  userId: string;
  displayName: string;
  pronouns: string;
  introduction: string;
  link: string;
  stageColor: StageColor | null;
  portraitUrl: string | null;
  workMediaUrl: string | null;
  workMediaKind: "work-image" | "work-video" | null;
  competencies: string[];
  /** Sum of on-Stage ms in the last STAGE_TIME_WINDOW_MS. Populated by
   *  listEligible; sentinel `0` from single-Student fetches. ADR-0011. */
  stageTimeMs: number;
  /** True when this Student sits in the top decile by Stage Time and should
   *  be hidden from the Companion list while no filter is active. */
  hideWhenIdle: boolean;
};

/** Fraction of the eligible cohort hidden from the Companion list when idle. */
const COMPANION_HIDE_DECILE = 0.1;

export type MyProfile = {
  userId: string;
  displayName: string;
  pronouns: string;
  introduction: string;
  link: string;
  stageColor: StageColor | null;
  competencies: string[];
  portraitUrl: string | null;
  workMediaUrl: string | null;
  workMediaKind: "work-image" | "work-video" | null;
};

function isComplete(s: Omit<StudentSummary, "portraitUrl" | "workMediaUrl" | "workMediaKind">): boolean {
  return Boolean(
    s.displayName &&
      s.pronouns &&
      s.introduction &&
      s.link &&
      s.competencies.length > 0,
  );
}

const stageColorSchema = z.enum(["slime", "crayon", "bubblegum"]);

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
      .where(eq(user.role, "student"));
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

    // Stage Time ranking (ADR-0011): least Stage Time first; hide the top
    // decile from the Companion list while no filter is active.
    const sinceMs = Date.now() - STAGE_TIME_WINDOW_MS;
    const stageTime = await getAppearanceLog().stageTimeIn(
      complete.map((s) => s.userId),
      sinceMs,
    );
    for (const s of complete) {
      s.stageTimeMs = stageTime.get(s.userId) ?? 0;
    }
    complete.sort((a, b) => a.stageTimeMs - b.stageTimeMs);

    const hideCount = Math.floor(complete.length * COMPANION_HIDE_DECILE);
    if (hideCount > 0) {
      const firstHiddenIdx = complete.length - hideCount;
      for (let i = firstHiddenIdx; i < complete.length; i += 1) {
        if (complete[i]!.stageTimeMs > 0) {
          complete[i]!.hideWhenIdle = true;
        }
      }
    }
    return complete;
  }),

  byUserId: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }): Promise<StudentSummary | null> => {
      const rows = await db
        .select({ s: student })
        .from(student)
        .innerJoin(user, eq(user.id, student.userId))
        .where(and(eq(student.userId, input.userId), eq(user.role, "student")));
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
      competencies: comps.map((c) => c.tag),
      portraitUrl: portraitRow ? getAssetStore().publicUrl(portraitRow.r2Key) : null,
      workMediaUrl: workRow ? getAssetStore().publicUrl(workRow.r2Key) : null,
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
