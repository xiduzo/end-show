import { useEffect, useRef } from "react";

export function useTapGesture({
  count = 5,
  windowMs = 2000,
  enabled = true,
  onTrigger,
}: {
  count?: number;
  windowMs?: number;
  enabled?: boolean;
  onTrigger: () => void;
}): void {
  const tapsRef = useRef<number[]>([]);
  const triggerRef = useRef(onTrigger);

  useEffect(() => {
    triggerRef.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    if (!enabled) {
      tapsRef.current = [];
      return;
    }
    const onDown = () => {
      const now = Date.now();
      tapsRef.current = [
        ...tapsRef.current.filter((t) => now - t < windowMs),
        now,
      ];
      if (tapsRef.current.length >= count) {
        tapsRef.current = [];
        triggerRef.current();
      }
    };
    window.addEventListener("pointerdown", onDown, { passive: true });
    return () => window.removeEventListener("pointerdown", onDown);
  }, [enabled, count, windowMs]);
}
