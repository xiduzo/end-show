import { getAppearanceLog } from "./appearanceLog";
import { checkExposureCap } from "./exposureCap";

type Tier = "kiosk" | "mobile";
type Source = Tier | "rotation";

type CurrentEntry = {
  studentUserId: string;
  startedAt: number;
  source: Source;
  appearanceId: string;
};

export type QueueSnapshot = {
  stageCode: string | null;
  kiosk: string[];
  mobile: string[];
  next: string | null;
};

export type StageSnapshot = {
  stageCode: string | null;
  current: { studentUserId: string; startedAt: number; source: Source } | null;
  dwellMs: number;
};

type ChannelState = {
  stageCode: string | null;
  kiosk: string[];
  mobile: string[];
  current: CurrentEntry | null;
  rotationOrder: string[];
  rotationCursor: number;
  timer: ReturnType<typeof setTimeout> | null;
  queueListeners: Set<(s: QueueSnapshot) => void>;
  stageListeners: Set<(s: StageSnapshot) => void>;
};

const DWELL_MS = Number(process.env.DWELL_MS ?? 30000);

const channels = new Map<string, ChannelState>();

function keyFor(stageCode: string | null): string {
  return stageCode ?? "";
}

function getChannel(stageCode: string | null): ChannelState {
  const key = keyFor(stageCode);
  let ch = channels.get(key);
  if (!ch) {
    ch = {
      stageCode,
      kiosk: [],
      mobile: [],
      current: null,
      rotationOrder: [],
      rotationCursor: 0,
      timer: null,
      queueListeners: new Set(),
      stageListeners: new Set(),
    };
    channels.set(key, ch);
  }
  return ch;
}

function peekNext(ch: ChannelState): string | null {
  if (ch.kiosk.length > 0) return ch.kiosk[0] ?? null;
  if (ch.mobile.length > 0) return ch.mobile[0] ?? null;
  if (ch.rotationOrder.length > 0) {
    const idx =
      ch.rotationCursor < ch.rotationOrder.length ? ch.rotationCursor : 0;
    return ch.rotationOrder[idx] ?? null;
  }
  return null;
}

function snapshotQueue(ch: ChannelState): QueueSnapshot {
  return {
    stageCode: ch.stageCode,
    kiosk: [...ch.kiosk],
    mobile: [...ch.mobile],
    next: peekNext(ch),
  };
}

function snapshotStage(ch: ChannelState): StageSnapshot {
  const cur = ch.current
    ? { studentUserId: ch.current.studentUserId, startedAt: ch.current.startedAt, source: ch.current.source }
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

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

async function pickRotation(ch: ChannelState): Promise<string | null> {
  const eligible = await rotationProvider();
  if (eligible.length === 0) return null;
  if (ch.rotationCursor >= ch.rotationOrder.length || ch.rotationOrder.length === 0) {
    ch.rotationOrder = shuffle(eligible);
    ch.rotationCursor = 0;
  }
  const pick = ch.rotationOrder[ch.rotationCursor] ?? null;
  ch.rotationCursor += 1;
  return pick;
}

async function pickNextEligible(
  ch: ChannelState,
): Promise<{ studentUserId: string; source: Source } | null> {
  const seenInRotation = new Set<string>();
  while (true) {
    let candidate: { studentUserId: string; source: Source } | null = null;
    if (ch.kiosk.length > 0) {
      candidate = { studentUserId: ch.kiosk.shift()!, source: "kiosk" };
    } else if (ch.mobile.length > 0) {
      candidate = { studentUserId: ch.mobile.shift()!, source: "mobile" };
    } else {
      const rot = await pickRotation(ch);
      if (rot) {
        if (seenInRotation.has(rot)) return null; // walked full cycle, all over cap
        seenInRotation.add(rot);
        candidate = { studentUserId: rot, source: "rotation" };
      }
    }
    if (!candidate) return null;

    const status = await checkExposureCap(candidate.studentUserId);
    if (!status.overCap) return candidate;
    // silently skip; loop
  }
}

async function advance(ch: ChannelState): Promise<void> {
  const log = getAppearanceLog();

  if (ch.current) {
    await log.end(ch.current.appearanceId);
  }

  const next = await pickNextEligible(ch);

  if (!next) {
    ch.current = null;
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
    source: next.source,
  });

  ch.current = {
    studentUserId: next.studentUserId,
    startedAt: startedAtMs,
    source: next.source,
    appearanceId: id,
  };
  emitStage(ch);
  emitQueue(ch);

  if (ch.timer) clearTimeout(ch.timer);
  ch.timer = setTimeout(() => {
    void advance(ch);
  }, DWELL_MS);
}

export type PushResult =
  | { ok: true }
  | { ok: false; reason: "currently-on-stage" | "already-queued" }
  | { ok: false; reason: "exposure-cap"; retryAfterMs: number };

export async function pushToQueue(opts: {
  stageCode: string | null;
  studentUserId: string;
  tier: Tier;
}): Promise<PushResult> {
  const ch = getChannel(opts.stageCode);
  if (ch.current?.studentUserId === opts.studentUserId) {
    return { ok: false, reason: "currently-on-stage" };
  }
  if (ch.kiosk.includes(opts.studentUserId) || ch.mobile.includes(opts.studentUserId)) {
    return { ok: false, reason: "already-queued" };
  }

  const status = await checkExposureCap(opts.studentUserId);
  if (status.overCap) {
    return { ok: false, reason: "exposure-cap", retryAfterMs: status.retryAfterMs };
  }

  const tierQueue = opts.tier === "kiosk" ? ch.kiosk : ch.mobile;
  tierQueue.push(opts.studentUserId);
  emitQueue(ch);
  if (!ch.current && ch.stageListeners.size > 0) {
    void advance(ch);
  }
  return { ok: true };
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
