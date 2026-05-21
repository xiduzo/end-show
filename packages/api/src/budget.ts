import { db } from "@end-show/db";
import { asset, budgetTransfer } from "@end-show/db/schema/asset";
import { env } from "@end-show/env/server";
import { eq, sum } from "drizzle-orm";

export const POOL_DISPLAYED_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB shown to users
export const POOL_PHYSICAL_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB R2 quota
export const TRANSFER_FLOOR_BYTES = 20 * 1024 * 1024; // 20 MB floor for sender after transfer

export type BudgetSnapshot = {
  defaultBytes: number;
  transferredInBytes: number;
  transferredOutBytes: number;
  effectiveBudgetBytes: number;
  usedBytes: number;
  remainingBytes: number;
};

async function sumColumn(rows: Array<{ total: string | null }>): Promise<number> {
  return Number(rows[0]?.total ?? 0);
}

export async function computeBudget(userId: string): Promise<BudgetSnapshot> {
  const defaultBytes = env.BUDGET_DEFAULT_BYTES;

  const inRows = await db
    .select({ total: sum(budgetTransfer.bytes) })
    .from(budgetTransfer)
    .where(eq(budgetTransfer.toUserId, userId));
  const outRows = await db
    .select({ total: sum(budgetTransfer.bytes) })
    .from(budgetTransfer)
    .where(eq(budgetTransfer.fromUserId, userId));
  const usedRows = await db
    .select({ total: sum(asset.bytes) })
    .from(asset)
    .where(eq(asset.studentUserId, userId));

  const transferredInBytes = await sumColumn(inRows);
  const transferredOutBytes = await sumColumn(outRows);
  const usedBytes = await sumColumn(usedRows);

  const effectiveBudgetBytes =
    defaultBytes + transferredInBytes - transferredOutBytes;
  const remainingBytes = effectiveBudgetBytes - usedBytes;

  return {
    defaultBytes,
    transferredInBytes,
    transferredOutBytes,
    effectiveBudgetBytes,
    usedBytes,
    remainingBytes,
  };
}
