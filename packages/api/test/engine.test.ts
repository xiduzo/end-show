import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  InMemoryAppearanceLog,
  setAppearanceLog,
} from "../src/queue/appearanceLog";
import { ManualClock, RealClock, setClock } from "../src/queue/clock";
import {
  DWELL_MS,
  __resetChannelsForTest,
  pushToQueue,
  type QueueSnapshot,
  type StageSnapshot,
  subscribeQueue,
  subscribeStage,
} from "../src/queue/engine";
import {
  InMemoryStudentDataStore,
  type MemStudent,
  setStudentDataStore,
} from "../src/studentDataStore";

/** Resolve after the microtask queue drains (advance() is fire-and-forget). */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

/** A Student whose profile is complete (so it is Rotation-eligible). */
function complete(userId: string, extra?: Partial<MemStudent>): MemStudent {
  return {
    userId,
    displayName: "Name",
    introduction: "Intro",
    portraitAssetId: "portrait",
    workMediaAssetId: "work",
    competencyCount: 1,
    ...extra,
  };
}

let clock: ManualClock;
let log: InMemoryAppearanceLog;

beforeEach(() => {
  clock = new ManualClock(1_000_000);
  setClock(clock);
  log = new InMemoryAppearanceLog(() => clock.now());
  setAppearanceLog(log);
  setStudentDataStore(
    new InMemoryStudentDataStore({
      students: [complete("a"), complete("b"), complete("c")],
    }),
  );
  __resetChannelsForTest();
});

afterEach(() => {
  __resetChannelsForTest();
  setClock(new RealClock());
});

describe("Stage engine (Clock + AppearanceLog seams)", () => {
  test("Rotation fills an empty Stage and arms the Dwell", async () => {
    let latest: StageSnapshot | null = null;
    subscribeStage(null, (s) => (latest = s));
    await flush();

    const cur = latest!.current;
    expect(cur).not.toBeNull();
    expect(["a", "b", "c"]).toContain(cur!.studentUserId);
    // one Dwell timer armed, one open Appearance row
    expect(clock.pendingTimers()).toBe(1);
    const rows = await log.rowsIn(["a", "b", "c"], 0);
    expect(rows.filter((r) => r.endedAtMs === null)).toHaveLength(1);
  });

  test("a Dwell tick closes the current Appearance and re-arms", async () => {
    let latest: StageSnapshot | null = null;
    subscribeStage(null, (s) => (latest = s));
    await flush();
    const first = latest!.current!;

    await clock.tick(DWELL_MS); // fire the Dwell → advance()

    // the first appearance is closed at exactly one Dwell after it started
    const rows = await log.rowsIn([first.studentUserId], 0);
    expect(rows.some((r) => r.endedAtMs === first.startedAt + DWELL_MS)).toBe(
      true,
    );
    // Stage keeps moving — a Dwell is armed again
    expect(clock.pendingTimers()).toBe(1);
  });

  test("preempt is additive: the displaced Student re-queues with resume", async () => {
    let stage: StageSnapshot | null = null;
    let queue: QueueSnapshot | null = null;
    subscribeStage(null, (s) => (stage = s));
    subscribeQueue(null, (q) => (queue = q));
    await flush();

    const displaced = stage!.current!.studentUserId;
    const newcomer = ["a", "b", "c"].find((x) => x !== displaced)!;

    const res = await pushToQueue({
      stageCode: null,
      studentUserId: newcomer,
      tier: "kiosk",
    });

    expect(res).toEqual({ ok: true, preempted: true });
    expect(stage!.current!.studentUserId).toBe(newcomer);
    // displaced Student is re-queued at resume priority (plays again — additive)
    expect(
      queue!.items.some(
        (i) => i.studentUserId === displaced && i.source === "resume",
      ),
    ).toBe(true);
  });

  test("extend: pushing the on-Stage Student resets the Dwell, no preempt", async () => {
    let stage: StageSnapshot | null = null;
    subscribeStage(null, (s) => (stage = s));
    await flush();
    const onStage = stage!.current!;

    await clock.tick(DWELL_MS / 2); // partway through the Dwell
    const res = await pushToQueue({
      stageCode: null,
      studentUserId: onStage.studentUserId,
      tier: "mobile",
    });

    expect(res).toEqual({ ok: true, preempted: false, extended: true });
    // same Student, same Appearance — Dwell restarted, not a new row
    expect(stage!.current!.studentUserId).toBe(onStage.studentUserId);
    const openRows = (await log.rowsIn([onStage.studentUserId], 0)).filter(
      (r) => r.endedAtMs === null,
    );
    expect(openRows).toHaveLength(1);
  });

  test("no-audience: last unsubscribe cancels the Dwell and closes the row", async () => {
    let latest: StageSnapshot | null = null;
    const unsub = subscribeStage(null, (s) => (latest = s));
    await flush();
    const onStage = latest!.current!.studentUserId;
    expect(clock.pendingTimers()).toBe(1);

    unsub();
    await flush();

    expect(clock.pendingTimers()).toBe(0); // Dwell paused
    const rows = await log.rowsIn([onStage], 0);
    expect(rows.every((r) => r.endedAtMs !== null)).toBe(true); // closed
  });

  test("closeCurrent does not freeze the Stage when end() fails (orphan left for janitor)", async () => {
    const failing = new (class extends InMemoryAppearanceLog {
      private failOnce = true;
      async end(id: string, endedAtMs?: number): Promise<void> {
        if (this.failOnce) {
          this.failOnce = false;
          throw new Error("db write failed");
        }
        return super.end(id, endedAtMs);
      }
    })(() => clock.now());
    setAppearanceLog(failing);

    subscribeStage(null, () => {});
    await flush();

    // The Dwell fires; advance() calls the failing end() — it must not reject,
    // and the Stage must keep moving (a new Dwell armed).
    await clock.tick(DWELL_MS);
    expect(clock.pendingTimers()).toBe(1);
  });
});
