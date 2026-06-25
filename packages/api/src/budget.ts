import { env } from "@end-show/env/server";

import { getStudentDataStore } from "./studentDataStore";

export const POOL_DISPLAYED_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB shown to users
export const POOL_PHYSICAL_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB R2 quota
export const TRANSFER_FLOOR_BYTES = env.BUDGET_TRANSFER_FLOOR_BYTES;
export const MAX_LOAN_BYTES = 30 * 1024 * 1024; // 30 MB max per loan request
export const MAX_ACTIVE_BORROWS = 3;

export type BudgetSnapshot = {
  defaultBytes: number;
  transferredInBytes: number;
  transferredOutBytes: number;
  effectiveBudgetBytes: number;
  usedBytes: number;
  remainingBytes: number;
};

export async function computeBudget(userId: string): Promise<BudgetSnapshot> {
  const defaultBytes = env.BUDGET_DEFAULT_BYTES;
  const store = getStudentDataStore();

  const [transferredInBytes, transferredOutBytes, usedBytes] =
    await Promise.all([
      store.acceptedTransfersInBytes(userId),
      store.acceptedTransfersOutBytes(userId),
      store.usedBytes(userId),
    ]);

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
