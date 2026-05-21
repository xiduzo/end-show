import { db } from "@end-show/db";
import { appearance } from "@end-show/db/schema/appearance";
import { and, eq, gte, isNull, or } from "drizzle-orm";

export const WINDOW_MS = 60 * 60 * 1000;
export const CAP_MS = 3 * 60 * 1000;

export type CapStatus =
  | { overCap: false; usedMs: number }
  | { overCap: true; usedMs: number; retryAfterMs: number };

export async function getCapStatus(
  studentUserId: string,
  now: number = Date.now(),
): Promise<CapStatus> {
  const since = now - WINDOW_MS;
  const rows = await db
    .select()
    .from(appearance)
    .where(
      and(
        eq(appearance.studentUserId, studentUserId),
        or(isNull(appearance.endedAt), gte(appearance.endedAt, new Date(since))),
      ),
    );

  let usedMs = 0;
  let oldestStart = Number.POSITIVE_INFINITY;
  for (const r of rows) {
    const startMs = r.startedAt.getTime();
    const endMs = (r.endedAt ?? new Date(now)).getTime();
    const clippedStart = Math.max(startMs, since);
    if (endMs > clippedStart) usedMs += endMs - clippedStart;
    if (startMs < oldestStart) oldestStart = startMs;
  }

  if (usedMs <= CAP_MS) return { overCap: false, usedMs };

  const retryAfterMs = Math.max(0, oldestStart + WINDOW_MS - now);
  return { overCap: true, usedMs, retryAfterMs };
}
