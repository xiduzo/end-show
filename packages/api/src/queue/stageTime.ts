import { db } from "@end-show/db";
import { user } from "@end-show/db/schema/auth";
import { student, studentCompetency } from "@end-show/db/schema/student";
import { eq, inArray } from "drizzle-orm";

import { type AppearanceRecord, getAppearanceLog } from "./appearanceLog";

/**
 * Stage Time — sum of a Student's on-Stage durations in the last rolling
 * window, across all Stages. Drives two soft rankings (ADR-0011):
 *   1. Rotation pick      — sort eligible pool ascending, drop top decile,
 *                           random within the remainder.
 *   2. Companion list     — sort ascending, hide top decile while idle.
 * Never gates: never blocks a tap, never skips a queued Student.
 */

/** Rolling window for the Stage Time fairness signal (ADR-0011). */
export const STAGE_TIME_WINDOW_MS = 60 * 60 * 1000;

/** Top fraction of Stage-Time-leading Students excluded from the Rotation
 *  pick. Picking from the remainder (random) keeps variety while still
 *  pushing the most-overdue Students into rotation. With <10 eligible
 *  Students this drops to zero and every eligible Student is in play. */
const ROTATION_DROP_DECILE = 0.1;

/** Top fraction of Stage-Time-leading Students hidden from the Companion
 *  list while no search/filter is active. The "intent overrides fairness"
 *  flip is applied by the caller. */
const COMPANION_HIDE_DECILE = 0.1;

/**
 * Eligibility for Stage / Companion (CONTEXT.md): `isPublished AND
 * profileComplete`. The `isPublished` flag is reserved for a future schema
 * column; today eligibility is proxied by profile completeness — every
 * required text field non-empty and at least one competency tag. This
 * predicate must stay aligned with `isComplete` in `routers/student.ts`.
 */
async function eligibleStudentIds(): Promise<string[]> {
  const rows = await db
    .select({
      userId: student.userId,
      displayName: student.displayName,
      pronouns: student.pronouns,
      introduction: student.introduction,
      link: student.link,
    })
    .from(student)
    .innerJoin(user, eq(user.id, student.userId))
    .where(eq(user.role, "student"));
  const completeIds = rows
    .filter(
      (r) =>
        r.displayName !== "" &&
        r.pronouns !== "" &&
        r.introduction !== "" &&
        r.link !== "",
    )
    .map((r) => r.userId);
  if (completeIds.length === 0) return [];
  const comps = await db
    .select({ studentUserId: studentCompetency.studentUserId })
    .from(studentCompetency)
    .where(inArray(studentCompetency.studentUserId, completeIds));
  const hasComp = new Set(comps.map((c) => c.studentUserId));
  return completeIds.filter((id) => hasComp.has(id));
}

/** Aggregate raw Appearance rows into per-Student ms summed across overlaps
 *  with `[sinceMs, nowMs]`. Missing Students = 0 (absent from the map). */
function aggregate(
  records: AppearanceRecord[],
  sinceMs: number,
  nowMs: number,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of records) {
    const endedAtMs = r.endedAtMs ?? nowMs;
    if (endedAtMs < sinceMs) continue;
    const effStart = Math.max(r.startedAtMs, sinceMs);
    const effEnd = Math.max(effStart, endedAtMs);
    const ms = effEnd - effStart;
    if (ms <= 0) continue;
    out.set(r.studentUserId, (out.get(r.studentUserId) ?? 0) + ms);
  }
  return out;
}

/** Pick the next Rotation candidate: eligible pool minus `exclude`, sorted
 *  ascending by Stage Time, drop the top decile of Stage-Time-leaders, then
 *  random pick within the remainder. Returns `null` when no Student is
 *  eligible. ADR-0011. */
export async function pickForRotation(
  exclude: Set<string>,
): Promise<string | null> {
  const eligible = await eligibleStudentIds();
  const pool = eligible.filter((id) => !exclude.has(id));
  if (pool.length === 0) return null;

  const now = Date.now();
  const sinceMs = now - STAGE_TIME_WINDOW_MS;
  const records = await getAppearanceLog().rowsIn(pool, sinceMs);
  const stageTime = aggregate(records, sinceMs, now);

  const scored = pool
    .map((id) => ({ id, ms: stageTime.get(id) ?? 0 }))
    .sort((a, b) => a.ms - b.ms);

  const dropCount = Math.floor(scored.length * ROTATION_DROP_DECILE);
  const candidates = scored.slice(0, scored.length - dropCount);
  return candidates[Math.floor(Math.random() * candidates.length)]!.id;
}

/** Annotate a Companion's list of eligible Students with `stageTimeMs` and
 *  `hideWhenIdle`, sorted ascending by Stage Time. Mutates entries in place
 *  and returns the same array. ADR-0011. */
export async function rankForCompanion<
  T extends { userId: string; stageTimeMs: number; hideWhenIdle: boolean },
>(list: T[]): Promise<T[]> {
  if (list.length === 0) return list;
  const now = Date.now();
  const sinceMs = now - STAGE_TIME_WINDOW_MS;
  const ids = list.map((s) => s.userId);
  const records = await getAppearanceLog().rowsIn(ids, sinceMs);
  const stageTime = aggregate(records, sinceMs, now);

  for (const s of list) {
    s.stageTimeMs = stageTime.get(s.userId) ?? 0;
  }
  list.sort((a, b) => a.stageTimeMs - b.stageTimeMs);

  const hideCount = Math.floor(list.length * COMPANION_HIDE_DECILE);
  if (hideCount > 0) {
    const firstHiddenIdx = list.length - hideCount;
    for (let i = firstHiddenIdx; i < list.length; i += 1) {
      if (list[i]!.stageTimeMs > 0) {
        list[i]!.hideWhenIdle = true;
      }
    }
  }
  return list;
}
