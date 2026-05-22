import { useEffect, useRef } from "react";

export function useTapGesture({
  count = 5,
  windowMs = 2000,
  cooldownMs = 1000,
  enabled = true,
  onTrigger,
}: {
  count?: number;
  windowMs?: number;
  cooldownMs?: number;
  enabled?: boolean;
  onTrigger: () => void;
}): void {
  const tapsRef = useRef<number[]>([]);
  const cooldownUntilRef = useRef(0);
  const triggerRef = useRef(onTrigger);

  useEffect(() => {
    triggerRef.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    if (!enabled) {
      tapsRef.current = [];
      cooldownUntilRef.current = 0;
      return;
    }
    const BLOCKED_EVENTS = [
      "pointerdown",
      "pointerup",
      "pointermove",
      "mousedown",
      "mouseup",
      "click",
      "touchstart",
      "touchend",
      "touchmove",
    ] as const;

    const blocker = (e: Event) => {
      if (Date.now() < cooldownUntilRef.current) {
        if (e.cancelable) e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    const onDown = (e: Event) => {
      const now = Date.now();
      if (now < cooldownUntilRef.current) return;
      tapsRef.current = [
        ...tapsRef.current.filter((t) => now - t < windowMs),
        now,
      ];
      if (tapsRef.current.length >= count) {
        tapsRef.current = [];
        cooldownUntilRef.current = now + cooldownMs;
        if (e.cancelable) e.preventDefault();
        e.stopImmediatePropagation();
        triggerRef.current();
      }
    };

    for (const ev of BLOCKED_EVENTS) {
      window.addEventListener(ev, blocker, { capture: true, passive: false });
    }
    window.addEventListener("pointerdown", onDown, {
      capture: true,
      passive: false,
    });
    return () => {
      for (const ev of BLOCKED_EVENTS) {
        window.removeEventListener(ev, blocker, { capture: true });
      }
      window.removeEventListener("pointerdown", onDown, { capture: true });
    };
  }, [enabled, count, windowMs, cooldownMs]);
}
