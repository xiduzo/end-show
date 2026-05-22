import { useCallback, useEffect, useRef } from "react";

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
] as const;

type Mode = "window" | "manual";

/**
 * Fire `onIdle` after `delayMs` without activity, while `enabled`.
 *
 * - `listen: "window"` (default) — any pointer/keyboard/wheel on window
 *   counts as activity. Use for kiosk-wide idle (e.g. showcase dismiss,
 *   filter wipe).
 * - `listen: "manual"` — caller decides what counts as activity by calling
 *   the returned `bump()`. Use for scoped idles (e.g. a panel that should
 *   close only when *its own* contents aren't touched).
 *
 * Activity events are passive; the hook never preventDefaults them.
 */
export function useUserActivity({
  onIdle,
  delayMs,
  enabled = true,
  listen = "window",
}: {
  onIdle: () => void;
  delayMs: number;
  enabled?: boolean;
  listen?: Mode;
}): { bump: () => void } {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;
  const timerRef = useRef<number | null>(null);

  const clear = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const bump = useCallback(() => {
    clear();
    if (!enabled) return;
    timerRef.current = window.setTimeout(() => onIdleRef.current(), delayMs);
  }, [enabled, delayMs]);

  useEffect(() => {
    if (!enabled) {
      clear();
      return;
    }
    bump();
    if (listen === "manual") return clear;

    const handler = () => bump();
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, handler, { passive: true });
    }
    return () => {
      clear();
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, handler);
      }
    };
  }, [enabled, listen, bump]);

  return { bump };
}
