import { db } from "@end-show/db";
import { asset } from "@end-show/db/schema/asset";
import { student } from "@end-show/db/schema/student";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { user } from "@end-show/db/schema/auth";

import { getAssetStore } from "../assetStore";
import { computeBudget } from "../budget";
import { protectedProcedure, router } from "../index";
import { assignAsset, removeAsset } from "../studentSlots";

type CtxUser = { id: string; role?: string | null };

function isStaff(ctx: { session: { user: CtxUser } }): boolean {
  return ctx.session.user.role === "staff";
}

async function resolveTargetUserId(
  ctx: { session: { user: CtxUser } },
  targetUserId: string | undefined,
): Promise<string> {
  if (!targetUserId || targetUserId === ctx.session.user.id) {
    return ctx.session.user.id;
  }
  if (!isStaff(ctx)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only staff can act on another student",
    });
  }
  const rows = await db.select().from(user).where(eq(user.id, targetUserId));
  const u = rows[0];
  if (!u || u.role !== "student") {
    throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
  }
  return targetUserId;
}

const MAX_PORTRAIT_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_WORK_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_WORK_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB

const ALLOWED_MIME: Record<"portrait" | "work-image" | "work-video", string[]> = {
  portrait: ["image/jpeg", "image/png", "image/webp"],
  "work-image": ["image/jpeg", "image/png", "image/webp", "image/gif"],
  "work-video": ["video/mp4", "video/webm", "video/quicktime"],
};

function maxBytesFor(kind: "portrait" | "work-image" | "work-video"): number {
  if (kind === "portrait") return MAX_PORTRAIT_BYTES;
  if (kind === "work-image") return MAX_WORK_IMAGE_BYTES;
  return MAX_WORK_VIDEO_BYTES;
}

function formatMB(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  const rounded = mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10;
  return `${rounded} MB`;
}

function kindLabel(kind: "portrait" | "work-image" | "work-video"): string {
  if (kind === "portrait") return "portrait";
  if (kind === "work-image") return "work image";
  return "work video";
}

export const assetRouter = router({
  requestUpload: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["portrait", "work-image", "work-video"]),
        mimeType: z.string().min(1),
        bytes: z.number().int().positive(),
        targetUserId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const store = getAssetStore();
      if (!store.isConfigured()) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Storage not configured on server",
        });
      }
      const allowed = ALLOWED_MIME[input.kind];
      if (!allowed.includes(input.mimeType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${input.mimeType} isn't supported for your ${kindLabel(input.kind)}. Try a different file type.`,
        });
      }
      const max = maxBytesFor(input.kind);
      if (input.bytes > max) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: `Your ${kindLabel(input.kind)} is ${formatMB(input.bytes)} — max is ${formatMB(max)}.`,
        });
      }

      const userId = await resolveTargetUserId(ctx, input.targetUserId);
      // Ensure student row exists (insert blank if missing)
      const existing = await db.select().from(student).where(eq(student.userId, userId));
      if (existing.length === 0) {
        await db.insert(student).values({ userId });
      }

      // This upload will replace whatever currently fills the same slot,
      // so credit those bytes back when checking the budget.
      const priorAssetId =
        input.kind === "portrait"
          ? existing[0]?.portraitAssetId ?? null
          : existing[0]?.workMediaAssetId ?? null;
      let replacedBytes = 0;
      if (priorAssetId) {
        const priorRows = await db
          .select({ bytes: asset.bytes })
          .from(asset)
          .where(eq(asset.id, priorAssetId));
        replacedBytes = priorRows[0]?.bytes ?? 0;
      }

      // Hard block on budget exceed — staff bypass for emergencies.
      if (!isStaff(ctx)) {
        const budget = await computeBudget(userId);
        const effectiveRemaining = budget.remainingBytes + replacedBytes;
        if (effectiveRemaining < input.bytes) {
          throw new TRPCError({
            code: "PAYLOAD_TOO_LARGE",
            message: `Not enough storage. You have ${formatMB(effectiveRemaining)} free, this upload needs ${formatMB(input.bytes)}.`,
          });
        }
      }

      const assetId = crypto.randomUUID();
      const r2Key = store.keyFor({ userId, kind: input.kind, assetId, mimeType: input.mimeType });
      const { uploadUrl, expiresIn } = await store.presignPut({
        key: r2Key,
        mimeType: input.mimeType,
        bytes: input.bytes,
      });
      return { assetId, r2Key, uploadUrl, expiresIn };
    }),

  finalizeUpload: protectedProcedure
    .input(
      z.object({
        assetId: z.string().uuid(),
        kind: z.enum(["portrait", "work-image", "work-video"]),
        r2Key: z.string().min(1),
        bytes: z.number().int().positive(),
        mimeType: z.string().min(1),
        width: z.number().int().positive().nullish(),
        height: z.number().int().positive().nullish(),
        durationMs: z.number().int().positive().nullish(),
        targetUserId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = await resolveTargetUserId(ctx, input.targetUserId);
      const result = await assignAsset({
        userId,
        assetId: input.assetId,
        kind: input.kind,
        r2Key: input.r2Key,
        bytes: input.bytes,
        mimeType: input.mimeType,
        width: input.width,
        height: input.height,
        durationMs: input.durationMs,
      });
      if (!result.ok) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Key not owned by caller" });
      }
      return { ok: true as const, publicUrl: result.publicUrl };
    }),

  getBudget: protectedProcedure.query(async ({ ctx }) => {
    return computeBudget(ctx.session.user.id);
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const store = getAssetStore();
    const rows = await db.select().from(asset).where(eq(asset.studentUserId, userId));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      r2Key: r.r2Key,
      bytes: r.bytes,
      mimeType: r.mimeType,
      width: r.width,
      height: r.height,
      durationMs: r.durationMs,
      publicUrl: store.publicUrl(r.r2Key),
      createdAt: r.createdAt,
    }));
  }),

  deleteAsset: protectedProcedure
    .input(z.object({ assetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await removeAsset({
        userId: ctx.session.user.id,
        assetId: input.assetId,
      });
      if (!result.ok) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });
      }
      return { ok: true as const };
    }),
});
