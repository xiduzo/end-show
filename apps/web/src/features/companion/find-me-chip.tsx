import { cn } from "@end-show/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { MorphingName } from "@/features/text-effects";
import { NumberTicker } from "./number-ticker";
import { FILTER_CLOSE_MS, FILTER_RESET_MS } from "./timings";
import { useUserActivity } from "./use-user-activity";

export function FindMeChip({
  search,
  onSearchChange,
  competencies,
  selected,
  onToggleComp,
  onClear,
  resultCount,
  showcasedId,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  competencies: string[];
  selected: string[];
  onToggleComp: (c: string) => void;
  onClear: () => void;
  resultCount: number;
  showcasedId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const activeCount = (search ? 1 : 0) + selected.length;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { bump: bumpClose } = useUserActivity({
    onIdle: () => setOpen(false),
    delayMs: FILTER_CLOSE_MS,
    enabled: open,
    listen: "manual",
  });

  useUserActivity({
    onIdle: onClear,
    delayMs: FILTER_RESET_MS,
    enabled: activeCount > 0,
  });

  useEffect(() => {
    if (showcasedId != null) setOpen(false);
  }, [showcasedId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const isOutsidePanel = (target: EventTarget | null) =>
      !panelRef.current ||
      !(target instanceof Node) ||
      !panelRef.current.contains(target);
    const isOutsideRoot = (target: EventTarget | null) =>
      !rootRef.current ||
      !(target instanceof Node) ||
      !rootRef.current.contains(target);
    const closeOnScroll = (e: Event) => {
      if (isOutsidePanel(e.target)) setOpen(false);
    };
    const closeOnOutsidePointer = (e: Event) => {
      if (isOutsideRoot(e.target)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", closeOnScroll, { passive: true });
    window.addEventListener("touchmove", closeOnScroll, { passive: true });
    window.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", closeOnScroll);
      window.removeEventListener("touchmove", closeOnScroll);
      window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="absolute top-8 left-1/2 z-30 -translate-x-1/2 sm:right-8 sm:left-auto sm:translate-x-0"
    >
      <motion.button
        layout
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          bumpClose();
        }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        className="bg-slide text-lego-dark touch-manipulation overflow-hidden rounded-full shadow-[0_25px_50px_-12px_rgba(255,91,35,0.35)] backdrop-blur transition-colors duration-700 ease-out active:scale-[0.97]"
      >
        <motion.div
          layout
          className="flex w-max items-center gap-3 py-2 pr-7 pl-2"
        >
          <motion.div
            layout
            className="bg-lego-dark text-slide flex h-[52px] w-[52px] items-center justify-center rounded-full font-display text-xl font-bold tabular-nums"
          >
            <NumberTicker value={resultCount} />
          </motion.div>
          <motion.div
            layout="position"
            className="text-lego-dark text-left leading-tight"
          >
            <p className="font-mono text-sm tracking-widest uppercase">
              find me
            </p>
            <MorphingName
              compact
              duration={0.4}
              className="font-display text-lg font-bold"
              text={
                activeCount > 0
                  ? `${activeCount} filter${activeCount > 1 ? "s" : ""}`
                  : "tap to filter"
              }
            />
          </motion.div>
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            onPointerDown={bumpClose}
            onTouchStart={bumpClose}
            className="text-lego ring-lego/10 absolute left-1/2 mt-3 w-[22rem] -translate-x-1/2 touch-manipulation rounded-2xl bg-[#fdfaf2] p-5 shadow-2xl ring-1 sm:right-0 sm:left-auto sm:w-[50vw] sm:translate-x-0"
          >
            <p className="text-lego/55 font-mono text-xs font-bold tracking-widest uppercase">
              search
            </p>
            <div className="relative mt-2">
              <input
                value={search}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  bumpClose();
                }}
                placeholder="what are you looking for?"
                className="border-lego/20 text-lego placeholder:text-lego/35 focus:border-lego/60 w-full rounded-full border bg-transparent px-4 py-3 pr-11 font-mono text-base outline-none"
              />
              <button
                type="button"
                aria-label="clear search"
                onClick={() => {
                  onSearchChange("");
                  bumpClose();
                }}
                className={cn(
                  "text-chalkboard bg-lego/80 p-6 transition-all right-0 absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full font-mono text-base leading-none active:scale-[0.92]",
                  {
                    "opacity-0": !search,
                    "opacity-100": !!search,
                  },
                )}
              >
                ×
              </button>
            </div>
            {competencies.length > 0 && (
              <>
                <p className="text-lego/55 mt-4 font-mono text-xs font-bold tracking-widest uppercase">
                  competencies
                </p>
                <div className="-mx-1 mt-2 flex max-h-[50vh] flex-wrap gap-2 overflow-y-auto px-1 py-1">
                  {competencies.map((c) => {
                    const active = selected.includes(c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          onToggleComp(c);
                          bumpClose();
                        }}
                        className={cn(
                          "min-h-[40px] rounded-full px-3.5 py-2 font-mono text-sm lowercase ring-1 transition active:scale-[0.97]",
                          active
                            ? "bg-slide text-lego-dark ring-slide"
                            : "text-lego/80 ring-lego/25 hover:ring-lego/55",
                        )}
                      >
                        {c}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            <div className="mt-5 flex items-center justify-between font-mono text-xs tracking-widest uppercase">
              <span className="text-lego/55">{resultCount} match</span>
              <button
                type="button"
                onClick={() => {
                  onClear();
                  bumpClose();
                }}
                className="text-lego/70 hover:text-lego min-h-[40px] px-2 underline-offset-2 hover:underline"
              >
                clear
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
