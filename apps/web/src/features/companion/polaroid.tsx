import type { StudentSummary } from "@end-show/api/routers/student";
import { cn } from "@end-show/ui/lib/utils";
import { motion, useInView } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { STAGE_PALETTE } from "@/features/stage";
import { TrackStamp } from "./track-stamp";
import { DEFAULT_ACCENT, hash, initials, rand } from "./wonk";

const DEVELOP_CLEAR =
  "brightness(1) contrast(1) saturate(1) hue-rotate(0deg) blur(0px)";
const DEVELOP_INITIAL =
  "brightness(2.4) contrast(0.15) saturate(0) hue-rotate(195deg) blur(3px)";
const DEVELOP_KEYFRAMES = [
  "brightness(2.4) contrast(0.15) saturate(0) hue-rotate(195deg) blur(2px)",
  "brightness(1.9) contrast(0.35) saturate(0.25) hue-rotate(170deg) blur(1px)",
  "brightness(1.45) contrast(0.65) saturate(0.6) hue-rotate(60deg) blur(0.6px)",
  DEVELOP_CLEAR,
];
const DEVELOP_BASE_DURATION = 1.4;
const DEVELOP_DURATION_JITTER = 0.6; // ±0.6s → per-card duration in [0.8s, 2.0s]
const DEVELOP_STOP_JITTER = 0.07; // ±0.07 on the intermediate timing stops
const DEVELOP_EXTRA_DELAY = 0.25; // 0–0.25s extra wait before this card starts

export function Polaroid({
  student,
  focused,
  width,
  developDelay,
}: {
  student: StudentSummary;
  focused: boolean;
  queued: boolean;
  width: number;
  developDelay?: number;
}) {
  const seed = hash(student.userId);
  const palette = student.stageColor
    ? STAGE_PALETTE[student.stageColor]
    : DEFAULT_ACCENT;
  const track = student.track;
  const trackTilt = rand(seed, 4) * 8;
  const trackLeft = 14 + rand(seed, 5) * 12;
  const captionTilt = rand(seed, 7) * 2.5;

  // Per-card develop timing — duration, the two intermediate "wet" stops, and
  // an extra startup wait all jitter on a stable seed so a batch of polaroids
  // developing in parallel feels physical (one card lands clear while the
  // next is still cyan, another lingers in the magenta phase). Stable per
  // student so the timing doesn't shift across re-renders.
  const developTiming = useMemo(() => {
    const duration =
      DEVELOP_BASE_DURATION + rand(seed, 20) * DEVELOP_DURATION_JITTER;
    const stop1 = 0.25 + rand(seed, 21) * DEVELOP_STOP_JITTER;
    const stop2 = 0.6 + rand(seed, 22) * DEVELOP_STOP_JITTER;
    const extraDelay = ((rand(seed, 23) + 1) / 2) * DEVELOP_EXTRA_DELAY;
    return {
      duration,
      times: [0, stop1, stop2, 1],
      extraDelay,
    };
  }, [seed]);

  // Develop runs when the polaroid actually enters the viewport — buffered
  // slots stay undeveloped so a fast scroll reveals the blur→clear animation
  // instead of pre-developing off-screen and arriving already clear. Latches
  // once via `developed` so a student prop swap inside a persistent slot
  // doesn't replay the keyframes.
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { once: true });
  const [developed, setDeveloped] = useState(developDelay === undefined);
  useEffect(() => {
    if (developDelay === undefined || !inView || developed) return;
    const totalDelay = developDelay + developTiming.extraDelay;
    const ms = totalDelay * 1000 + developTiming.duration * 1000 + 50;
    const t = window.setTimeout(() => setDeveloped(true), ms);
    return () => window.clearTimeout(t);
  }, [developDelay, inView, developed, developTiming]);

  return (
    <div ref={rootRef} className="relative will-change-transform">
      <div
        className={cn(
          "relative bg-[#fdfaf2] p-3 pb-14 shadow-2xl",
          focused && "shadow-[0_30px_80px_rgba(255,91,35,0.35)]",
          focused && "ring-2 ring-slide ring-offset-4 ring-offset-lego",
        )}
        style={{ width }}
      >
        <span
          className="absolute -top-3 z-10"
          style={{
            left: trackLeft,
            transform: `rotate(${trackTilt}deg)`,
          }}
        >
          <TrackStamp track={track} seed={student.userId} size="md" />
        </span>

        <motion.div
          data-polaroid-image
          className="relative aspect-[3/4] w-full overflow-hidden"
          style={{
            background: `radial-gradient(circle at 50% 55%, ${palette.accent}aa 0%, ${palette.dark} 78%)`,
            willChange: "filter",
          }}
          initial={
            developDelay !== undefined ? { filter: DEVELOP_INITIAL } : false
          }
          animate={
            developed
              ? { filter: DEVELOP_CLEAR }
              : inView
                ? { filter: DEVELOP_KEYFRAMES }
                : { filter: DEVELOP_INITIAL }
          }
          transition={
            developed || !inView
              ? { duration: 0 }
              : {
                  duration: developTiming.duration,
                  times: developTiming.times,
                  ease: "easeInOut",
                  delay: (developDelay ?? 0) + developTiming.extraDelay,
                }
          }
        >
          {student.portraitUrl ? (
            <img
              src={student.portraitUrl}
              alt={student.displayName}
              draggable={false}
              className="pointer-events-none h-full w-full select-none object-cover"
              style={{ touchAction: "none" }}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-mono text-xs tracking-widest text-chalkboard/30">
              {initials(student.displayName)}
            </span>
          )}
        </motion.div>

        <p
          className={cn(
            "text-lego-dark absolute right-0 bottom-3 left-0 px-2 text-center font-display font-bold",
            focused ? "text-lg" : "text-sm",
          )}
          style={{ transform: `rotate(${captionTilt}deg)` }}
        >
          {student.displayName}
        </p>
      </div>
    </div>
  );
}
