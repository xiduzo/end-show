import { db } from "@end-show/db";
import { budgetLoan } from "@end-show/db/schema/asset";
import { user } from "@end-show/db/schema/auth";
import { student } from "@end-show/db/schema/student";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { z } from "zod";

import {
  computeBudget,
  MAX_LOAN_BYTES,
  TRANSFER_FLOOR_BYTES,
} from "../budget";
import { protectedProcedure, router } from "../index";

type Peer = {
  id: string;
  name: string;
  email: string;
  displayName: string;
};

async function loadPeers(ids: string[]): Promise<Map<string, Peer>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      displayName: student.displayName,
    })
    .from(user)
    .leftJoin(student, eq(student.userId, user.id))
    .where(inArray(user.id, ids));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        email: r.email,
        displayName: r.displayName ?? "",
      },
    ]),
  );
}

export const budgetRouter = router({
  get: protectedProcedure
    .input(z.object({ userId: z.string().min(1).optional() }).optional())
    .query(async ({ ctx, input }) => {
    const callerId = ctx.session.user.id;
    const role = (ctx.session.user as { role?: string }).role;
    const target = input?.userId;
    if (target && target !== callerId && role !== "staff") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only staff can view another student's budget",
      });
    }
    const me = target ?? callerId;
    const budget = await computeBudget(me);

    const loans = await db
      .select()
      .from(budgetLoan)
      .where(
        and(
          or(eq(budgetLoan.fromUserId, me), eq(budgetLoan.toUserId, me)),
          inArray(budgetLoan.status, ["pending", "accepted"]),
        ),
      )
      .orderBy(desc(budgetLoan.createdAt));

    const peerIds = Array.from(
      new Set(loans.flatMap((l) => [l.fromUserId, l.toUserId])),
    );
    const peers = await loadPeers(peerIds);

    const incoming = loans
      .filter((l) => l.fromUserId === me && l.status === "pending")
      .map((l) => ({
        id: l.id,
        bytes: l.bytes,
        reason: l.reason,
        createdAt: l.createdAt,
        borrower: peers.get(l.toUserId) ?? null,
      }));

    const outgoing = loans
      .filter((l) => l.toUserId === me && l.status === "pending")
      .map((l) => ({
        id: l.id,
        bytes: l.bytes,
        reason: l.reason,
        createdAt: l.createdAt,
        lender: peers.get(l.fromUserId) ?? null,
      }));

    const activeLent = loans
      .filter((l) => l.fromUserId === me && l.status === "accepted")
      .map((l) => ({
        id: l.id,
        bytes: l.bytes,
        createdAt: l.createdAt,
        respondedAt: l.respondedAt,
        borrower: peers.get(l.toUserId) ?? null,
      }));

    const activeBorrowed = loans
      .filter((l) => l.toUserId === me && l.status === "accepted")
      .map((l) => ({
        id: l.id,
        bytes: l.bytes,
        createdAt: l.createdAt,
        respondedAt: l.respondedAt,
        lender: peers.get(l.fromUserId) ?? null,
      }));

    return { ...budget, incoming, outgoing, activeLent, activeBorrowed };
  }),

  listCohortSpare: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    const peers = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        displayName: student.displayName,
      })
      .from(user)
      .leftJoin(student, eq(student.userId, user.id))
      .where(and(eq(user.role, "student"), ne(user.id, me)));

    const rows = await Promise.all(
      peers.map(async (p) => {
        const b = await computeBudget(p.id);
        const spareBytes = Math.max(
          0,
          b.effectiveBudgetBytes - b.usedBytes - TRANSFER_FLOOR_BYTES,
        );
        return {
          id: p.id,
          name: p.name,
          email: p.email,
          displayName: p.displayName ?? "",
          effectiveBytes: b.effectiveBudgetBytes,
          usedBytes: b.usedBytes,
          floorBytes: TRANSFER_FLOOR_BYTES,
          spareBytes,
        };
      }),
    );

    return rows.sort((a, b) => b.spareBytes - a.spareBytes);
  }),

  requestLoan: protectedProcedure
    .input(
      z.object({
        fromUserId: z.string().min(1),
        bytes: z
          .number()
          .int()
          .positive()
          .max(MAX_LOAN_BYTES, `Max ${MAX_LOAN_BYTES} bytes per loan`),
        reason: z.string().trim().max(140).default(""),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      if (input.fromUserId === me) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot borrow from yourself",
        });
      }
      const lender = await db
        .select()
        .from(user)
        .where(eq(user.id, input.fromUserId));
      const l = lender[0];
      if (!l || l.role !== "student") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lender not found",
        });
      }
      const lenderBudget = await computeBudget(input.fromUserId);
      const lenderAfter =
        lenderBudget.effectiveBudgetBytes -
        lenderBudget.usedBytes -
        input.bytes;
      if (lenderAfter < TRANSFER_FLOOR_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Lender would drop below ${TRANSFER_FLOOR_BYTES} bytes floor`,
        });
      }

      const id = crypto.randomUUID();
      await db.insert(budgetLoan).values({
        id,
        fromUserId: input.fromUserId,
        toUserId: me,
        bytes: input.bytes,
        status: "pending",
        reason: input.reason,
      });
      return { id };
    }),

  respond: protectedProcedure
    .input(
      z.object({
        loanId: z.string().min(1),
        accept: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      const rows = await db
        .select()
        .from(budgetLoan)
        .where(eq(budgetLoan.id, input.loanId));
      const loan = rows[0];
      if (!loan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      }
      if (loan.fromUserId !== me) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the lender can respond",
        });
      }
      if (loan.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Already ${loan.status}`,
        });
      }
      if (input.accept) {
        const lenderBudget = await computeBudget(me);
        const lenderAfter = lenderBudget.effectiveBudgetBytes - loan.bytes;
        if (lenderAfter < TRANSFER_FLOOR_BYTES) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Would drop you below ${TRANSFER_FLOOR_BYTES} bytes floor`,
          });
        }
      }
      await db
        .update(budgetLoan)
        .set({
          status: input.accept ? "accepted" : "declined",
          respondedAt: new Date(),
        })
        .where(eq(budgetLoan.id, input.loanId));
      return { ok: true as const };
    }),

  cancel: protectedProcedure
    .input(z.object({ loanId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      const rows = await db
        .select()
        .from(budgetLoan)
        .where(eq(budgetLoan.id, input.loanId));
      const loan = rows[0];
      if (!loan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      }
      if (loan.toUserId !== me) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the borrower can cancel",
        });
      }
      if (loan.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Already ${loan.status}`,
        });
      }
      await db
        .update(budgetLoan)
        .set({ status: "cancelled", respondedAt: new Date() })
        .where(eq(budgetLoan.id, input.loanId));
      return { ok: true as const };
    }),

  returnLoan: protectedProcedure
    .input(z.object({ loanId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const me = ctx.session.user.id;
      const rows = await db
        .select()
        .from(budgetLoan)
        .where(eq(budgetLoan.id, input.loanId));
      const loan = rows[0];
      if (!loan) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      }
      if (loan.toUserId !== me) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the borrower can return",
        });
      }
      if (loan.status !== "accepted") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot return — loan is ${loan.status}`,
        });
      }
      const borrowerBudget = await computeBudget(me);
      const headroom =
        borrowerBudget.effectiveBudgetBytes - borrowerBudget.usedBytes;
      if (headroom < loan.bytes) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not enough headroom to return this loan",
        });
      }
      await db
        .update(budgetLoan)
        .set({ status: "returned", returnedAt: new Date() })
        .where(eq(budgetLoan.id, input.loanId));
      return { ok: true as const };
    }),

  history: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    const rows = await db
      .select()
      .from(budgetLoan)
      .where(or(eq(budgetLoan.fromUserId, me), eq(budgetLoan.toUserId, me)))
      .orderBy(desc(budgetLoan.createdAt));
    const peerIds = Array.from(
      new Set(rows.flatMap((r) => [r.fromUserId, r.toUserId])),
    );
    const peers = await loadPeers(peerIds);
    return rows.map((r) => ({
      id: r.id,
      bytes: r.bytes,
      status: r.status,
      reason: r.reason,
      direction: r.fromUserId === me ? ("out" as const) : ("in" as const),
      counterparty:
        peers.get(r.fromUserId === me ? r.toUserId : r.fromUserId) ?? null,
      createdAt: r.createdAt,
      respondedAt: r.respondedAt,
    }));
  }),
});
