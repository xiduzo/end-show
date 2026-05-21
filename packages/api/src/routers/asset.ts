import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@end-show/db";
import { asset } from "@end-show/db/schema/asset";
import { student } from "@end-show/db/schema/student";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { computeBudget } from "../budget";
import { protectedProcedure, router } from "../index";
import { getBucket, getR2Client, isR2Configured, publicUrlFor } from "../r2";

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

function r2KeyFor(userId: string, kind: string, id: string, mime: string): string {
  const ext = mime.split("/")[1] ?? "bin";
  return `students/${userId}/${kind}/${id}.${ext}`;
}

export const assetRouter = router({
  requestUpload: protectedProcedure
    .input(
      z.object({
        kind: z.enum(["portrait", "work-image", "work-video"]),
        mimeType: z.string().min(1),
        bytes: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isR2Configured()) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Storage not configured on server",
        });
      }
      const allowed = ALLOWED_MIME[input.kind];
      if (!allowed.includes(input.mimeType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `mime ${input.mimeType} not allowed for ${input.kind}`,
        });
      }
      const max = maxBytesFor(input.kind);
      if (input.bytes > max) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: `max ${max} bytes for ${input.kind}, got ${input.bytes}`,
        });
      }

      const userId = ctx.session.user.id;
      // Ensure student row exists (insert blank if missing)
      const existing = await db.select().from(student).where(eq(student.userId, userId));
      if (existing.length === 0) {
        await db.insert(student).values({ userId, isPublished: false });
      }

      // Hard block on budget exceed.
      const budget = await computeBudget(userId);
      if (budget.remainingBytes < input.bytes) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: `Over budget. ${budget.remainingBytes} bytes left, need ${input.bytes}.`,
        });
      }

      const id = crypto.randomUUID();
      const r2Key = r2KeyFor(userId, input.kind, id, input.mimeType);
      const command = new PutObjectCommand({
        Bucket: getBucket(),
        Key: r2Key,
        ContentType: input.mimeType,
        ContentLength: input.bytes,
      });
      const url = await getSignedUrl(getR2Client(), command, { expiresIn: 300 });
      return { assetId: id, r2Key, uploadUrl: url, expiresIn: 300 };
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      // Path scopes the key to the user; double-check
      const prefix = `students/${userId}/${input.kind}/`;
      if (!input.r2Key.startsWith(prefix)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Key not owned by caller" });
      }

      // Capture the prior asset in this slot so we can clean it up after we link
      // the new one. portrait → portraitAssetId; work-* → workMediaAssetId.
      const slot: "portraitAssetId" | "workMediaAssetId" =
        input.kind === "portrait" ? "portraitAssetId" : "workMediaAssetId";
      const studentRows = await db
        .select()
        .from(student)
        .where(eq(student.userId, userId));
      const priorAssetId = studentRows[0]?.[slot] ?? null;

      await db.insert(asset).values({
        id: input.assetId,
        studentUserId: userId,
        kind: input.kind,
        r2Key: input.r2Key,
        bytes: input.bytes,
        mimeType: input.mimeType,
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
      });

      // Link portrait or work into student row (single-asset slots for now)
      if (input.kind === "portrait") {
        await db
          .update(student)
          .set({ portraitAssetId: input.assetId, updatedAt: new Date() })
          .where(eq(student.userId, userId));
      } else {
        await db
          .update(student)
          .set({ workMediaAssetId: input.assetId, updatedAt: new Date() })
          .where(eq(student.userId, userId));
      }

      // Clean up the prior slot occupant if any. Best-effort R2 delete; the DB
      // row is the source of truth for budget so it must succeed.
      if (priorAssetId && priorAssetId !== input.assetId) {
        const priorRows = await db
          .select()
          .from(asset)
          .where(eq(asset.id, priorAssetId));
        const prior = priorRows[0];
        if (prior && isR2Configured()) {
          try {
            await getR2Client().send(
              new DeleteObjectCommand({ Bucket: getBucket(), Key: prior.r2Key }),
            );
          } catch (e) {
            console.warn("[asset] orphan r2 delete failed", e);
          }
        }
        await db.delete(asset).where(eq(asset.id, priorAssetId));
      }

      return { ok: true as const, publicUrl: publicUrlFor(input.r2Key) };
    }),

  getBudget: protectedProcedure.query(async ({ ctx }) => {
    return computeBudget(ctx.session.user.id);
  }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
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
      publicUrl: publicUrlFor(r.r2Key),
      createdAt: r.createdAt,
    }));
  }),

  deleteAsset: protectedProcedure
    .input(z.object({ assetId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const rows = await db
        .select()
        .from(asset)
        .where(and(eq(asset.id, input.assetId), eq(asset.studentUserId, userId)));
      const row = rows[0];
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Asset not found" });
      }
      if (isR2Configured()) {
        try {
          await getR2Client().send(
            new DeleteObjectCommand({ Bucket: getBucket(), Key: row.r2Key }),
          );
        } catch (e) {
          console.warn("[asset] r2 delete failed", e);
        }
      }
      // Unlink from student row if linked
      const sRows = await db.select().from(student).where(eq(student.userId, userId));
      const s = sRows[0];
      if (s?.portraitAssetId === input.assetId) {
        await db
          .update(student)
          .set({ portraitAssetId: null, updatedAt: new Date() })
          .where(eq(student.userId, userId));
      }
      if (s?.workMediaAssetId === input.assetId) {
        await db
          .update(student)
          .set({ workMediaAssetId: null, updatedAt: new Date() })
          .where(eq(student.userId, userId));
      }
      await db.delete(asset).where(eq(asset.id, input.assetId));
      return { ok: true as const };
    }),
});
