import type { StudentSummary } from "@end-show/api/routers/student";
import { cn } from "@end-show/ui/lib/utils";
import { motion } from "motion/react";

import { STAGE_PALETTE } from "@/features/stage";
import { DEFAULT_ACCENT, hash, initials, rand, STICKER_TONES } from "./wonk";

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
  const competency = student.competencies[0];
  const sticker = STICKER_TONES[hash(competency ?? "x") % STICKER_TONES.length];
  const stickerTilt = rand(seed, 4) * 14;
  const stickerLeft = 12 + rand(seed, 5) * 18;
  const captionTilt = rand(seed, 7) * 2.5;

  return (
    <div className="relative will-change-transform">
      <div
        className={cn(
          "relative bg-[#fdfaf2] p-3 pb-14 shadow-2xl",
          focused && "shadow-[0_30px_80px_rgba(255,91,35,0.35)]",
          focused && "ring-2 ring-slide ring-offset-4 ring-offset-lego",
        )}
        style={{ width }}
      >
        {competency && (
          <span
            className={cn(
              "absolute -top-2 z-10 rounded-sm px-2 py-0.5 font-mono text-xs font-bold tracking-wider shadow-md",
              sticker.bg,
              sticker.fg,
            )}
            style={{
              left: stickerLeft,
              transform: `rotate(${stickerTilt}deg)`,
            }}
          >
            {competency}
          </span>
        )}

        <motion.div
          data-polaroid-image
          className="relative aspect-[3/4] w-full overflow-hidden"
          style={{
            background: `radial-gradient(circle at 50% 55%, ${palette.accent}aa 0%, ${palette.dark} 78%)`,
            willChange: "filter",
          }}
          initial={
            developDelay !== undefined
              ? {
                  filter:
                    "brightness(2.4) contrast(0.15) saturate(0) hue-rotate(195deg) blur(3px)",
                }
              : false
          }
          animate={{
            filter: [
              "brightness(2.4) contrast(0.15) saturate(0) hue-rotate(195deg) blur(2px)",
              "brightness(1.9) contrast(0.35) saturate(0.25) hue-rotate(170deg) blur(1px)",
              "brightness(1.45) contrast(0.65) saturate(0.6) hue-rotate(60deg) blur(0.6px)",
              "brightness(1) contrast(1) saturate(1) hue-rotate(0deg) blur(0px)",
            ],
          }}
          transition={{
            duration: 1.4,
            times: [0, 0.25, 0.6, 1],
            ease: "easeInOut",
            delay: developDelay ?? 0,
          }}
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
