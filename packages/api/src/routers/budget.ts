import { db } from "@end-show/db";
import { budgetTransfer } from "@end-show/db/schema/asset";
import { user } from "@end-show/db/schema/auth";
import { TRPCError } from "@trpc/server";
import { desc, eq, or } from "drizzle-orm";
import { z } from "zod";

import { computeBudget, TRANSFER_FLOOR_BYTES } from "../budget";
import { protectedProcedure, router } from "../index";

export const budgetRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    return computeBudget(ctx.session.user.id);
  }),

  transfer: protectedProcedure
    .input(
      z.object({
        toUserId: z.string().min(1),
        bytes: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const fromUserId = ctx.session.user.id;
      if (input.toUserId === fromUserId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot transfer to yourself",
        });
      }

      const recipient = await db.select().from(user).where(eq(user.id, input.toUserId));
      const r = recipient[0];
      if (!r) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Recipient not found" });
      }
      if (r.role !== "student") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Recipient is not a student",
        });
      }

      const senderBudget = await computeBudget(fromUserId);
      if (senderBudget.remainingBytes < input.bytes) {
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: `Only ${senderBudget.remainingBytes} bytes available to transfer`,
        });
      }
      const senderEffectiveAfter = senderBudget.effectiveBudgetBytes - input.bytes;
      if (senderEffectiveAfter < TRANSFER_FLOOR_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot drop your budget below ${TRANSFER_FLOOR_BYTES} bytes (20 MB floor)`,
        });
      }

      await db.insert(budgetTransfer).values({
        id: crypto.randomUUID(),
        fromUserId,
        toUserId: input.toUserId,
        bytes: input.bytes,
      });

      return { ok: true as const };
    }),

  myTransfers: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    const rows = await db
      .select()
      .from(budgetTransfer)
      .where(or(eq(budgetTransfer.fromUserId, me), eq(budgetTransfer.toUserId, me)))
      .orderBy(desc(budgetTransfer.createdAt));
    const peerIds = Array.from(
      new Set(rows.flatMap((r) => [r.fromUserId, r.toUserId])).values(),
    );
    const peers =
      peerIds.length > 0
        ? await db
            .select({ id: user.id, name: user.name, email: user.email })
            .from(user)
            .where(or(...peerIds.map((id) => eq(user.id, id))))
        : [];
    const peerById = new Map(peers.map((p) => [p.id, p]));
    return rows.map((r) => ({
      id: r.id,
      bytes: r.bytes,
      direction: r.fromUserId === me ? ("out" as const) : ("in" as const),
      counterparty: peerById.get(r.fromUserId === me ? r.toUserId : r.fromUserId) ?? null,
      createdAt: r.createdAt,
    }));
  }),
});
