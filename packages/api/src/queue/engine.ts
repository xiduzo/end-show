import { Queuer } from "@tanstack/pacer";

import { type AppearanceSource, getAppearanceLog } from "./appearanceLog";
import { pickForRotation, studentTrack } from "./stageTime";

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
  /** Tracks this Stage shows. `null` = all tracks. Lets Companions apply the
   *  same hard filter even when they paired by code without the tracks param. */
  tracks: string[] | null;
  current: {
    studentUserId: string;
    startedAt: number;
    source: AppearanceSource;
  } | null;
  dwellMs: number;
};

type ChannelState = {
  stageCode: string | null;
  /** Tracks this Stage displays. `null` = all tracks (no filter). Set by the
   *  Stage display via subscribeStage; companions read it but never write. */
  tracks: string[] | null;
  current: CurrentEntry | null;
  queuer: Queuer<QueueItem>;
  resumeBump: number;
  timer: ReturnType<typeof setTimeout> | null;
  queueListeners: Set<(s: QueueSnapshot) => void>;
  stageListeners: Set<(s: StageSnapshot) => void>;
};

export const DWELL_MS = Number(process.env.DWELL_MS ?? 30000);
const MIN_QUEUE = 3;

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
      tracks: null,
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
  return {
    stageCode: ch.stageCode,
    tracks: ch.tracks,
    current: cur,
    dwellMs: DWELL_MS,
  };
}

function emitQueue(ch: ChannelState): void {
  const snap = snapshotQueue(ch);
  for (const l of ch.queueListeners) l(snap);
}

function emitStage(ch: ChannelState): void {
  const snap = snapshotStage(ch);
  for (const l of ch.stageListeners) l(snap);
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

function isPreempter(src: AppearanceSource): boolean {
  return src === "kiosk" || src === "mobile";
}

/** Drop any pending preempter from the queue. Only one preempter slot
 *  exists at a time — a new preempt replaces the previous one. */
function dropPreempters(ch: ChannelState): void {
  const all = ch.queuer.peekAllItems();
  if (!all.some((i) => isPreempter(i.appearanceSource))) return;
  ch.queuer.clear();
  for (const i of all) {
    if (!isPreempter(i.appearanceSource)) ch.queuer.addItem(i);
  }
}

async function nextRotationCandidate(ch: ChannelState): Promise<string | null> {
  const exclude = queuedIds(ch);
  if (ch.current) exclude.add(ch.current.studentUserId);
  return pickForRotation(exclude, ch.tracks);
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
  | { ok: false; reason: "currently-on-stage" | "off-track" };

export async function pushToQueue(opts: {
  stageCode: string | null;
  studentUserId: string;
  tier: Tier;
}): Promise<PushResult> {
  const ch = getChannel(opts.stageCode);

  // Hard track filter: a Stage limited to certain tracks rejects pushes from
  // Students outside that set. Skipped when no filter is set (tracks === null).
  if (ch.tracks && ch.tracks.length > 0) {
    const track = await studentTrack(opts.studentUserId);
    if (track === null || !ch.tracks.includes(track)) {
      return { ok: false, reason: "off-track" };
    }
  }

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

    // A new preempt replaces any prior preempter still pending in queue.
    dropPreempters(ch);

    // Only resume "natural" stage occupants (rotation arrivals). A previous
    // preempter being preempted again is dropped, not requeued.
    if (!isPreempter(old.source)) {
      ch.resumeBump += 1;
      enqueueUnique(ch, {
        studentUserId: old.studentUserId,
        source: "resume",
        appearanceSource: old.source,
        priority: PRIORITY.resume + ch.resumeBump,
      });
    }
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
  dropPreempters(ch);
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
  tracks?: string[] | null,
): () => void {
  const ch = getChannel(stageCode);
  // Only the Stage display passes `tracks` (array or explicit null = all).
  // Companions omit it (undefined) so they never clobber the filter.
  if (tracks !== undefined) ch.tracks = tracks;
  ch.stageListeners.add(cb);
  cb(snapshotStage(ch));
  if (!ch.current && !ch.timer) {
    void advance(ch);
  }
  return () => {
    ch.stageListeners.delete(cb);
    if (ch.stageListeners.size === 0) {
      // No Stage audience: pause the Stage clock. Stage Time is the
      // attention-given signal (ADR-0011), not a wall clock — without
      // anyone watching, the in-flight Student should stop accruing it.
      // Cancel the dwell timer and close any open Appearance row. The
      // queue itself is preserved; a reconnecting Stage re-advances
      // from the head on its next subscribeStage.
      if (ch.timer) {
        clearTimeout(ch.timer);
        ch.timer = null;
      }
      if (ch.current) {
        const log = getAppearanceLog();
        const old = ch.current;
        ch.current = null;
        void log.end(old.appearanceId);
        emitStage(ch);
      }
    }
  };
}
