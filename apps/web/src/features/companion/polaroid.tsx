import type { StudentSummary } from "@end-show/api/routers/student";
import { cn } from "@end-show/ui/lib/utils";

import { STAGE_PALETTE } from "@/features/stage";
import { DEFAULT_ACCENT, hash, initials, rand, STICKER_TONES } from "./wonk";

export function Polaroid({
  student,
  focused,
  width,
}: {
  student: StudentSummary;
  focused: boolean;
  queued: boolean;
  width: number;
}) {
  const seed = hash(student.userId);
  const palette = student.stageColor
    ? STAGE_PALETTE[student.stageColor]
    : DEFAULT_ACCENT;
  const competency = student.competencies[0];
  const sticker = STICKER_TONES[hash(competency ?? "x") % STICKER_TONES.length];
  const stickerTilt = rand(seed, 4) * 14;
  const stickerLeft = 12 + rand(seed, 5) * 18;
  const pinOffsetPx = rand(seed, 8) * 12;
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
              "absolute -top-2 z-10 rounded-sm px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider shadow-md",
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

        <div
          aria-hidden
          className="absolute top-2 z-10 h-4 w-4 -translate-x-1/2 rounded-full"
          style={{
            left: `calc(50% + ${pinOffsetPx}px)`,
            background:
              "radial-gradient(circle at 35% 30%, #ff8a6a 0%, #ff5b23 45%, #b8350f 100%)",
            boxShadow:
              "0 2px 3px rgba(0,0,0,0.45), inset -1px -1px 2px rgba(0,0,0,0.35), inset 1px 1px 1.5px rgba(255,255,255,0.6)",
          }}
        >
          <span
            aria-hidden
            className="absolute h-1 w-1 rounded-full bg-chalkboard/80"
            style={{ top: "22%", left: "28%" }}
          />
        </div>

        <div
          data-polaroid-image
          className="relative aspect-[3/4] w-full overflow-hidden"
          style={{
            background: `radial-gradient(circle at 50% 55%, ${palette.accent}aa 0%, ${palette.dark} 78%)`,
          }}
        >
          {student.portraitUrl ? (
            <img
              src={student.portraitUrl}
              alt={student.displayName}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-mono text-xs tracking-widest text-chalkboard/30">
              {initials(student.displayName)}
            </span>
          )}
        </div>

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
