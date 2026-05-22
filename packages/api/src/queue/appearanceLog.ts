import { db } from "@end-show/db";
import { appearance } from "@end-show/db/schema/appearance";
import { and, eq, gte, isNull, or } from "drizzle-orm";

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
  recentForStudent(
    studentUserId: string,
    sinceMs: number,
  ): Promise<AppearanceRecord[]>;
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

  async recentForStudent(
    studentUserId: string,
    sinceMs: number,
  ): Promise<AppearanceRecord[]> {
    const rows = await db
      .select()
      .from(appearance)
      .where(
        and(
          eq(appearance.studentUserId, studentUserId),
          or(
            isNull(appearance.endedAt),
            gte(appearance.endedAt, new Date(sinceMs)),
          ),
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

  async recentForStudent(
    studentUserId: string,
    sinceMs: number,
  ): Promise<AppearanceRecord[]> {
    return this.rows.filter(
      (r) =>
        r.studentUserId === studentUserId &&
        (r.endedAtMs === null || r.endedAtMs >= sinceMs),
    );
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
