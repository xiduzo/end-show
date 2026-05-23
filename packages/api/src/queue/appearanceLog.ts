import { db } from "@end-show/db";
import { appearance } from "@end-show/db/schema/appearance";
import { and, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";

export type AppearanceSource = "kiosk" | "mobile" | "rotation";

export type AppearanceRecord = {
  id: string;
  studentUserId: string;
  stageCode: string | null;
  source: AppearanceSource;
  startedAtMs: number;
  endedAtMs: number | null;
};

export type StartInput = {
  studentUserId: string;
  stageCode: string | null;
  source: AppearanceSource;
};

export type StartResult = { id: string; startedAtMs: number };

export interface AppearanceLog {
  start(input: StartInput): Promise<StartResult>;
  end(id: string, endedAtMs?: number): Promise<void>;
  /** Raw Appearance rows for these Students whose interval overlaps
   *  `[sinceMs, now]`. Ongoing rows (endedAt = null) are always included.
   *  Aggregation lives in the Stage Time module — this is pure storage. */
  rowsIn(
    studentUserIds: string[],
    sinceMs: number,
  ): Promise<AppearanceRecord[]>;
  /**
   * Close orphaned in-flight rows. Sets `endedAt = startedAt + fillMs` as a
   * best-guess attribution (see ADR-0007 §Recovery).
   *
   * @param fillMs    Duration to attribute to the closed appearance (use the
   *                  Stage's Dwell — a realistic one-appearance approximation).
   * @param maxAgeMs  Optional: only close rows whose `startedAt` is older than
   *                  `now - maxAgeMs`. Used by the janitor to avoid clipping
   *                  legitimately in-flight rows. Omit at boot.
   * @returns         Number of rows closed.
   */
  closeAllOpen(fillMs: number, maxAgeMs?: number): Promise<number>;
}

export class DrizzleAppearanceLog implements AppearanceLog {
  async start(input: StartInput): Promise<StartResult> {
    const id = crypto.randomUUID();
    const startedAtMs = Date.now();
    await db.insert(appearance).values({
      id,
      studentUserId: input.studentUserId,
      stageCode: input.stageCode,
      source: input.source,
      startedAt: new Date(startedAtMs),
    });
    return { id, startedAtMs };
  }

  async end(id: string, endedAtMs: number = Date.now()): Promise<void> {
    await db
      .update(appearance)
      .set({ endedAt: new Date(endedAtMs) })
      .where(eq(appearance.id, id));
  }

  async rowsIn(
    studentUserIds: string[],
    sinceMs: number,
  ): Promise<AppearanceRecord[]> {
    if (studentUserIds.length === 0) return [];
    const since = new Date(sinceMs);
    const rows = await db
      .select()
      .from(appearance)
      .where(
        and(
          inArray(appearance.studentUserId, studentUserIds),
          or(isNull(appearance.endedAt), gte(appearance.endedAt, since)),
        ),
      );
    return rows.map((r) => ({
      id: r.id,
      studentUserId: r.studentUserId,
      stageCode: r.stageCode,
      source: r.source,
      startedAtMs: r.startedAt.getTime(),
      endedAtMs: r.endedAt?.getTime() ?? null,
    }));
  }

  async closeAllOpen(fillMs: number, maxAgeMs?: number): Promise<number> {
    const cutoff =
      maxAgeMs !== undefined ? new Date(Date.now() - maxAgeMs) : null;
    const where = cutoff
      ? and(isNull(appearance.endedAt), lt(appearance.startedAt, cutoff))
      : isNull(appearance.endedAt);
    const open = await db.select().from(appearance).where(where);
    if (open.length === 0) return 0;
    for (const r of open) {
      await db
        .update(appearance)
        .set({ endedAt: new Date(r.startedAt.getTime() + fillMs) })
        .where(eq(appearance.id, r.id));
    }
    return open.length;
  }
}

export class InMemoryAppearanceLog implements AppearanceLog {
  private rows: AppearanceRecord[] = [];
  private seq = 0;
  private nowFn: () => number;

  constructor(nowFn: () => number = () => Date.now()) {
    this.nowFn = nowFn;
  }

  async start(input: StartInput): Promise<StartResult> {
    this.seq += 1;
    const id = `mem-${this.seq}`;
    const startedAtMs = this.nowFn();
    this.rows.push({
      id,
      studentUserId: input.studentUserId,
      stageCode: input.stageCode,
      source: input.source,
      startedAtMs,
      endedAtMs: null,
    });
    return { id, startedAtMs };
  }

  async end(id: string, endedAtMs: number = this.nowFn()): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.endedAtMs = endedAtMs;
  }

  async rowsIn(
    studentUserIds: string[],
    sinceMs: number,
  ): Promise<AppearanceRecord[]> {
    const want = new Set(studentUserIds);
    const nowMs = this.nowFn();
    return this.rows.filter((r) => {
      if (!want.has(r.studentUserId)) return false;
      const endedAtMs = r.endedAtMs ?? nowMs;
      return endedAtMs >= sinceMs;
    });
  }

  async closeAllOpen(fillMs: number, maxAgeMs?: number): Promise<number> {
    const nowMs = this.nowFn();
    let n = 0;
    for (const r of this.rows) {
      if (r.endedAtMs !== null) continue;
      if (maxAgeMs !== undefined && nowMs - r.startedAtMs < maxAgeMs) continue;
      r.endedAtMs = r.startedAtMs + fillMs;
      n += 1;
    }
    return n;
  }

  reset(): void {
    this.rows = [];
    this.seq = 0;
  }
}

let instance: AppearanceLog = new DrizzleAppearanceLog();

export function getAppearanceLog(): AppearanceLog {
  return instance;
}

export function setAppearanceLog(impl: AppearanceLog): void {
  instance = impl;
}
