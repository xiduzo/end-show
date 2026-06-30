import { useEffect } from "react";

/**
 * Hides the mouse cursor on the kiosk after a period of inactivity, and on
 * mount (so the boot-time cursor parked in the top-left corner disappears
 * without needing a mouse wiggle). Any pointer movement reveals it again and
 * restarts the idle timer.
 *
 * Toggles the `.cursor-idle` class on <html>; the actual `cursor: none` lives
 * in index.css so React never touches inline styles on every mousemove.
 */
export function useIdleCursor({
  idleMs = 2000,
  enabled = true,
}: {
  idleMs?: number;
  enabled?: boolean;
} = {}): void {
  useEffect(() => {
    const root = document.documentElement;
    if (!enabled) {
      root.classList.remove("cursor-idle");
      return;
    }

    let timer: ReturnType<typeof setTimeout>;
    const hide = () => root.classList.add("cursor-idle");
    const wake = () => {
      root.classList.remove("cursor-idle");
      clearTimeout(timer);
      timer = setTimeout(hide, idleMs);
    };

    // Start hidden, then arm the timer so the first move reveals it.
    hide();
    timer = setTimeout(hide, idleMs);
    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("pointerdown", wake, { passive: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("pointerdown", wake);
      root.classList.remove("cursor-idle");
    };
  }, [idleMs, enabled]);
}
