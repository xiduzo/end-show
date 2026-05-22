import { getAppearanceLog } from "./appearanceLog";

const WINDOW_MS = 60 * 60 * 1000;
const CAP_MS = 3 * 60 * 1000;

export type CapStatus =
  | { overCap: false; usedMs: number }
  | { overCap: true; usedMs: number; retryAfterMs: number };

export async function checkExposureCap(
  studentUserId: string,
  now: number = Date.now(),
): Promise<CapStatus> {
  const since = now - WINDOW_MS;
  const rows = await getAppearanceLog().recentForStudent(studentUserId, since);

  let usedMs = 0;
  let oldestStart = Number.POSITIVE_INFINITY;
  for (const r of rows) {
    const endMs = r.endedAtMs ?? now;
    const clippedStart = Math.max(r.startedAtMs, since);
    if (endMs > clippedStart) usedMs += endMs - clippedStart;
    if (r.startedAtMs < oldestStart) oldestStart = r.startedAtMs;
  }

  if (usedMs <= CAP_MS) return { overCap: false, usedMs };

  const retryAfterMs = Math.max(0, oldestStart + WINDOW_MS - now);
  return { overCap: true, usedMs, retryAfterMs };
}
