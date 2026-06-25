/**
 * Clock seam for the Queue subsystem.
 *
 * The engine's Dwell timer and the Stage Time rolling window read time and
 * schedule callbacks through this interface instead of the global `Date.now`
 * and `setTimeout`, so advance, the Dwell timer and the fairness window can be
 * driven deterministically in tests (ManualClock) while production keeps the
 * real timers (RealClock). Mirrors the get/set singleton shape of the
 * Appearance Log seam (see ./appearanceLog) and the nowFn it already injects.
 *
 * Two adapters justify the seam: RealClock in prod, ManualClock in tests.
 */

export type TimerCallback = () => void | Promise<void>;
/** Opaque handle returned by {@link Clock.setTimeout}. */
export type TimerHandle = unknown;

export interface Clock {
  /** Current wall-clock time in ms. */
  now(): number;
  /** Schedule `fn` to run after `ms`. Returns a handle for {@link clearTimeout}. */
  setTimeout(fn: TimerCallback, ms: number): TimerHandle;
  /** Cancel a scheduled callback. No-op for a null/unknown handle. */
  clearTimeout(handle: TimerHandle | null): void;
}

export class RealClock implements Clock {
  now(): number {
    return Date.now();
  }
  setTimeout(fn: TimerCallback, ms: number): TimerHandle {
    return setTimeout(fn, ms);
  }
  clearTimeout(handle: TimerHandle | null): void {
    if (handle != null) clearTimeout(handle as ReturnType<typeof setTimeout>);
  }
}

/**
 * Deterministic clock for tests. Time only moves when `tick`/`set` is called.
 * `tick` fires due timers in deadline order and awaits each callback, so an
 * async `advance` chain settles before `tick` resolves. Timers scheduled while
 * a callback runs (the engine re-arms the Dwell on every advance) are picked up
 * in the same `tick` if they fall within the window.
 */
export class ManualClock implements Clock {
  private current: number;
  private seq = 0;
  private timers = new Map<number, { at: number; fn: TimerCallback }>();

  constructor(startMs = 0) {
    this.current = startMs;
  }

  now(): number {
    return this.current;
  }

  setTimeout(fn: TimerCallback, ms: number): TimerHandle {
    this.seq += 1;
    const id = this.seq;
    this.timers.set(id, { at: this.current + ms, fn });
    return id;
  }

  clearTimeout(handle: TimerHandle | null): void {
    if (handle != null) this.timers.delete(handle as number);
  }

  /** Advance time by `ms`, firing (and awaiting) any timers that come due. */
  async tick(ms: number): Promise<void> {
    const target = this.current + ms;
    for (;;) {
      let dueId: number | null = null;
      let due: { at: number; fn: TimerCallback } | null = null;
      for (const [id, t] of this.timers) {
        if (t.at <= target && (due === null || t.at < due.at)) {
          dueId = id;
          due = t;
        }
      }
      if (dueId === null || due === null) break;
      this.timers.delete(dueId);
      this.current = due.at;
      await due.fn();
    }
    this.current = target;
  }

  /** Jump to an absolute time without firing timers. */
  set(ms: number): void {
    this.current = ms;
  }

  /** Number of timers still armed — handy for asserting the Dwell is cancelled. */
  pendingTimers(): number {
    return this.timers.size;
  }
}

let clock: Clock = new RealClock();

export function getClock(): Clock {
  return clock;
}

export function setClock(c: Clock): void {
  clock = c;
}
