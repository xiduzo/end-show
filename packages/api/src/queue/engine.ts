import { Queuer } from "@tanstack/pacer";

import { type AppearanceSource, getAppearanceLog } from "./appearanceLog";

type Tier = "kiosk" | "mobile";
type QueueSource = "kiosk" | "mobile" | "rotation" | "resume";

type QueueItem = {
  studentUserId: string;
  source: QueueSource;
  appearanceSource: AppearanceSource;
  priority: number;
};

type CurrentEntry = {
  studentUserId: string;
  startedAt: number;
  source: AppearanceSource;
  appearanceId: string;
};

export type QueueSnapshot = {
  stageCode: string | null;
  items: Array<{ studentUserId: string; source: QueueSource }>;
  next: string | null;
};

export type StageSnapshot = {
  stageCode: string | null;
  current: {
    studentUserId: string;
    startedAt: number;
    source: AppearanceSource;
  } | null;
  dwellMs: number;
};

type ChannelState = {
  stageCode: string | null;
  current: CurrentEntry | null;
  queuer: Queuer<QueueItem>;
  resumeBump: number;
  timer: ReturnType<typeof setTimeout> | null;
  queueListeners: Set<(s: QueueSnapshot) => void>;
  stageListeners: Set<(s: StageSnapshot) => void>;
};

const DWELL_MS = Number(process.env.DWELL_MS ?? 30000);
const MIN_QUEUE = 3;
/** Random pick happens within the N most-overdue students. Bigger = feels
 *  more random, smaller = stricter fairness. 1 = pure least-recently-seen. */
const ROTATION_WINDOW = 12;

const PRIORITY = {
  resume: 400,
  kiosk: 300,
  mobile: 200,
  rotation: 100,
} as const;

const channels = new Map<string, ChannelState>();

function keyFor(stageCode: string | null): string {
  return stageCode ?? "";
}

function noop(): void {}

function getChannel(stageCode: string | null): ChannelState {
  const key = keyFor(stageCode);
  let ch = channels.get(key);
  if (!ch) {
    ch = {
      stageCode,
      current: null,
      queuer: new Queuer<QueueItem>(noop, {
        started: false,
        getPriority: (i) => i.priority,
      }),
      resumeBump: 0,
      timer: null,
      queueListeners: new Set(),
      stageListeners: new Set(),
    };
    channels.set(key, ch);
  }
  return ch;
}

function snapshotQueue(ch: ChannelState): QueueSnapshot {
  const items = ch.queuer.peekAllItems().map((i) => ({
    studentUserId: i.studentUserId,
    source: i.source,
  }));
  return {
    stageCode: ch.stageCode,
    items,
    next: items[0]?.studentUserId ?? null,
  };
}

function snapshotStage(ch: ChannelState): StageSnapshot {
  const cur = ch.current
    ? {
        studentUserId: ch.current.studentUserId,
        startedAt: ch.current.startedAt,
        source: ch.current.source,
      }
    : null;
  return { stageCode: ch.stageCode, current: cur, dwellMs: DWELL_MS };
}

function emitQueue(ch: ChannelState): void {
  const snap = snapshotQueue(ch);
  for (const l of ch.queueListeners) l(snap);
}

function emitStage(ch: ChannelState): void {
  const snap = snapshotStage(ch);
  for (const l of ch.stageListeners) l(snap);
}

export type RotationProvider = () => Promise<string[]>;
let rotationProvider: RotationProvider = async () => [];

export function setRotationProvider(fn: RotationProvider): void {
  rotationProvider = fn;
}

function queuedIds(ch: ChannelState): Set<string> {
  return new Set(ch.queuer.peekAllItems().map((i) => i.studentUserId));
}

function enqueueUnique(ch: ChannelState, item: QueueItem): void {
  const all = ch.queuer.peekAllItems();
  if (all.some((i) => i.studentUserId === item.studentUserId)) {
    ch.queuer.clear();
    for (const i of all) {
      if (i.studentUserId !== item.studentUserId) ch.queuer.addItem(i);
    }
  }
  ch.queuer.addItem(item);
}

async function nextRotationCandidate(ch: ChannelState): Promise<string | null> {
  const eligible = await rotationProvider();
  if (eligible.length === 0) return null;
  const exclude = queuedIds(ch);
  if (ch.current) exclude.add(ch.current.studentUserId);

  const pool = eligible.filter((id) => !exclude.has(id));
  if (pool.length === 0) return null;

  // Sort by least-recently-seen (never-seen = oldest), then pick randomly
  // within the top ROTATION_WINDOW. Fair-bounded but not robotic.
  const lastSeen = await getAppearanceLog().lastStartedAtFor(pool);
  const scored = pool
    .map((id) => ({ id, last: lastSeen.get(id) ?? 0 }))
    .sort((a, b) => a.last - b.last);

  const window = Math.min(scored.length, ROTATION_WINDOW);
  return scored[Math.floor(Math.random() * window)]!.id;
}

async function topUp(ch: ChannelState): Promise<void> {
  while (ch.queuer.peekAllItems().length < MIN_QUEUE) {
    const candidate = await nextRotationCandidate(ch);
    if (!candidate) return;
    enqueueUnique(ch, {
      studentUserId: candidate,
      source: "rotation",
      appearanceSource: "rotation",
      priority: PRIORITY.rotation,
    });
  }
}

async function advance(ch: ChannelState): Promise<void> {
  const log = getAppearanceLog();

  if (ch.current) {
    await log.end(ch.current.appearanceId);
    ch.current = null;
  }

  await topUp(ch);
  const next = ch.queuer.getNextItem() ?? null;

  if (!next) {
    if (ch.timer) {
      clearTimeout(ch.timer);
      ch.timer = null;
    }
    emitStage(ch);
    emitQueue(ch);
    return;
  }

  const { id, startedAtMs } = await log.start({
    studentUserId: next.studentUserId,
    stageCode: ch.stageCode,
    source: next.appearanceSource,
  });

  ch.current = {
    studentUserId: next.studentUserId,
    startedAt: startedAtMs,
    source: next.appearanceSource,
    appearanceId: id,
  };

  await topUp(ch);
  emitStage(ch);
  emitQueue(ch);

  if (ch.timer) clearTimeout(ch.timer);
  ch.timer = setTimeout(() => {
    void advance(ch);
  }, DWELL_MS);
}

export type PushResult =
  | { ok: true; preempted: boolean; extended?: boolean }
  | { ok: false; reason: "currently-on-stage" };

export async function pushToQueue(opts: {
  stageCode: string | null;
  studentUserId: string;
  tier: Tier;
}): Promise<PushResult> {
  const ch = getChannel(opts.stageCode);
  if (ch.current?.studentUserId === opts.studentUserId) {
    ch.current.startedAt = Date.now();
    if (ch.timer) clearTimeout(ch.timer);
    ch.timer = setTimeout(() => {
      void advance(ch);
    }, DWELL_MS);
    emitStage(ch);
    return { ok: true, preempted: false, extended: true };
  }

  // Preempt path — companion send while someone is on stage.
  if (ch.current) {
    if (ch.timer) {
      clearTimeout(ch.timer);
      ch.timer = null;
    }
    const log = getAppearanceLog();
    const old = ch.current;
    ch.current = null;
    await log.end(old.appearanceId);

    ch.resumeBump += 1;
    enqueueUnique(ch, {
      studentUserId: old.studentUserId,
      source: "resume",
      appearanceSource: old.source,
      priority: PRIORITY.resume + ch.resumeBump,
    });
    enqueueUnique(ch, {
      studentUserId: opts.studentUserId,
      source: opts.tier,
      appearanceSource: opts.tier,
      // bump above the just-resumed student so this one is dequeued next
      priority: PRIORITY.resume + ch.resumeBump + 1,
    });

    await advance(ch);
    return { ok: true, preempted: true };
  }

  // No one on stage — add (or silently bump dup) and kick advance.
  enqueueUnique(ch, {
    studentUserId: opts.studentUserId,
    source: opts.tier,
    appearanceSource: opts.tier,
    priority: opts.tier === "kiosk" ? PRIORITY.kiosk : PRIORITY.mobile,
  });
  await topUp(ch);
  emitQueue(ch);
  if (ch.stageListeners.size > 0) {
    void advance(ch);
  }
  return { ok: true, preempted: false };
}

export function subscribeQueue(
  stageCode: string | null,
  cb: (s: QueueSnapshot) => void,
): () => void {
  const ch = getChannel(stageCode);
  ch.queueListeners.add(cb);
  cb(snapshotQueue(ch));
  return () => {
    ch.queueListeners.delete(cb);
  };
}

export function subscribeStage(
  stageCode: string | null,
  cb: (s: StageSnapshot) => void,
): () => void {
  const ch = getChannel(stageCode);
  ch.stageListeners.add(cb);
  cb(snapshotStage(ch));
  if (!ch.current && !ch.timer) {
    void advance(ch);
  }
  return () => {
    ch.stageListeners.delete(cb);
  };
}
