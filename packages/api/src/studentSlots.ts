import { db } from "@end-show/db";
import { asset } from "@end-show/db/schema/asset";
import { student } from "@end-show/db/schema/student";
import { and, eq } from "drizzle-orm";

import { type AssetKind, getAssetStore } from "./assetStore";

type SlotColumn = "portraitAssetId" | "workMediaAssetId";

function slotColumnFor(kind: AssetKind): SlotColumn {
  return kind === "portrait" ? "portraitAssetId" : "workMediaAssetId";
}

function keyPrefixFor(userId: string, kind: AssetKind): string {
  return `students/${userId}/${kind}/`;
}

export type AssignInput = {
  userId: string;
  assetId: string;
  kind: AssetKind;
  r2Key: string;
  bytes: number;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
};

export type AssignResult =
  | { ok: true; publicUrl: string }
  | { ok: false; reason: "forbidden-key" };

export type RemoveInput = {
  userId: string;
  assetId: string;
};

export type RemoveResult = { ok: true } | { ok: false; reason: "not-found" };

export async function assignAsset(input: AssignInput): Promise<AssignResult> {
  const prefix = keyPrefixFor(input.userId, input.kind);
  if (!input.r2Key.startsWith(prefix)) {
    return { ok: false, reason: "forbidden-key" };
  }

  const slot = slotColumnFor(input.kind);

  const studentRows = await db
    .select()
    .from(student)
    .where(eq(student.userId, input.userId));
  const priorAssetId = studentRows[0]?.[slot] ?? null;

  await db.insert(asset).values({
    id: input.assetId,
    studentUserId: input.userId,
    kind: input.kind,
    r2Key: input.r2Key,
    bytes: input.bytes,
    mimeType: input.mimeType,
    width: input.width ?? null,
    height: input.height ?? null,
    durationMs: input.durationMs ?? null,
  });

  await db
    .update(student)
    .set({ [slot]: input.assetId, updatedAt: new Date() })
    .where(eq(student.userId, input.userId));

  if (priorAssetId && priorAssetId !== input.assetId) {
    await evictAsset(priorAssetId);
  }

  return { ok: true, publicUrl: getAssetStore().publicUrl(input.r2Key) };
}

export async function removeAsset(input: RemoveInput): Promise<RemoveResult> {
  const rows = await db
    .select()
    .from(asset)
    .where(and(eq(asset.id, input.assetId), eq(asset.studentUserId, input.userId)));
  const row = rows[0];
  if (!row) return { ok: false, reason: "not-found" };

  await getAssetStore().delete(row.r2Key);

  const sRows = await db.select().from(student).where(eq(student.userId, input.userId));
  const s = sRows[0];
  if (s?.portraitAssetId === input.assetId) {
    await db
      .update(student)
      .set({ portraitAssetId: null, updatedAt: new Date() })
      .where(eq(student.userId, input.userId));
  }
  if (s?.workMediaAssetId === input.assetId) {
    await db
      .update(student)
      .set({ workMediaAssetId: null, updatedAt: new Date() })
      .where(eq(student.userId, input.userId));
  }

  await db.delete(asset).where(eq(asset.id, input.assetId));
  return { ok: true };
}

async function evictAsset(assetId: string): Promise<void> {
  const priorRows = await db.select().from(asset).where(eq(asset.id, assetId));
  const prior = priorRows[0];
  if (!prior) return;
  await getAssetStore().delete(prior.r2Key);
  await db.delete(asset).where(eq(asset.id, assetId));
}
