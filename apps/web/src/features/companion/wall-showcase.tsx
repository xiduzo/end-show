import type { StudentSummary } from "@end-show/api/routers/student";
import { cn } from "@end-show/ui/lib/utils";
import { motion, useAnimationControls } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { STAGE_PALETTE } from "@/features/stage";
import { useBookLayout } from "./book-layout";
import { TrackStamp } from "./track-stamp";
import type { CompanionTier } from "./types";
import { usePrinter } from "./use-printer";
import { DEFAULT_ACCENT, hash, initials, rand } from "./wonk";

export function WallShowcase({
  tier,
  student,
  sourceCardRect,
  sourceImageRect,
  isOnStage,
  isQueued,
  onClose,
  onSend,
}: {
  tier: CompanionTier;
  student: StudentSummary;
  sourceCardRect: DOMRect;
  sourceImageRect: DOMRect;
  isOnStage: boolean;
  isQueued: boolean;
  onClose: () => void;
  onSend: () => Promise<boolean>;
}) {
  const isMobile = tier === "mobile";
  const layout = useBookLayout(isMobile);
  const sendDisabled = false;
  const [flying, setFlying] = useState(false);
  const cardControls = useAnimationControls();
  const printer = usePrinter();

  const spring = { type: "spring" as const, stiffness: 220, damping: 28 };

  const throwToStage = async () => {
    if (sendDisabled || flying) return;
    setFlying(true);
    const ok = await onSend();
    if (!ok) setFlying(false);
  };

  useEffect(() => {
    if (flying) {
      void cardControls.start(
        {
          x: layout.card.x,
          y: -window.innerHeight - 200,
          width: layout.card.w,
          height: layout.card.h,
          rotate: -6,
          opacity: 0,
        },
        { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
      );
    } else {
      void cardControls.start(
        {
          x: layout.card.x,
          y: layout.card.y,
          width: layout.card.w,
          height: layout.card.h,
          rotate: 0,
          opacity: 1,
        },
        spring,
      );
    }
  }, [
    flying,
    layout.card.x,
    layout.card.y,
    layout.card.w,
    layout.card.h,
    cardControls,
  ]);
  const palette = student.stageColor
    ? STAGE_PALETTE[student.stageColor]
    : DEFAULT_ACCENT;

  const seed = hash(student.userId);
  const stickerTilt = rand(seed, 4) * 6;
  const stickerLeft = 12 + rand(seed, 5) * 14;

  // image source position inside the source card
  const sourceImageLeft = sourceImageRect.x - sourceCardRect.x;
  const sourceImageTop = sourceImageRect.y - sourceCardRect.y;

  // image target inside the morphed card
  const targetImageW = layout.card.w - layout.imagePadding * 2;
  const targetImageH = layout.card.h - layout.imagePadding * 2;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const foldClosed =
    layout.foldAxis === "y"
      ? { rotateY: -78, rotateX: 0 }
      : { rotateX: -78, rotateY: 0 };
  const foldOpen = { rotateY: 0, rotateX: 0 };

  return (
    <motion.div
      className="fixed inset-0 z-40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={cn(" absolute inset-0 cursor-zoom-out")}
        style={{
          background: `${palette.dark}90`,
        }}
      />

      {/* Card — morphs from source rect on the wall to the book's card panel */}
      <motion.div
        className="absolute top-0 left-0 origin-top-left bg-[#fdfaf2] will-change-transform"
        initial={{
          x: sourceCardRect.x,
          y: sourceCardRect.y,
          width: sourceCardRect.width,
          height: sourceCardRect.height,
        }}
        animate={cardControls}
        exit={
          flying
            ? {
                y: -window.innerHeight - 200,
                opacity: 0,
              }
            : {
                x: sourceCardRect.x,
                y: sourceCardRect.y,
                width: sourceCardRect.width,
                height: sourceCardRect.height,
                opacity: 0,
              }
        }
        transition={spring}
        drag={isMobile || flying ? false : "y"}
        dragConstraints={{ top: -400, bottom: 0 }}
        dragElastic={0.3}
        onDragEnd={(_, info) => {
          if (info.offset.y < -80 || info.velocity.y < -600) {
            void throwToStage();
          } else {
            void cardControls.start(
              {
                x: layout.card.x,
                y: layout.card.y,
                width: layout.card.w,
                height: layout.card.h,
                rotate: 0,
                opacity: 1,
              },
              spring,
            );
          }
        }}
        style={{
          touchAction: isMobile ? "auto" : "none",
          boxShadow: `0 30px 90px ${palette.dark}b3`,
        }}
      >
        <span
          className="absolute -top-3 z-20"
          style={{
            left: stickerLeft,
            transform: `rotate(${stickerTilt}deg)`,
          }}
        >
          <TrackStamp track={student.track} seed={student.userId} size="lg" />
        </span>

        <motion.div
          className="absolute overflow-hidden"
          initial={{
            top: sourceImageTop,
            left: sourceImageLeft,
            width: sourceImageRect.width,
            height: sourceImageRect.height,
          }}
          animate={{
            top: layout.imagePadding,
            left: layout.imagePadding,
            width: targetImageW,
            height: targetImageH,
          }}
          exit={{
            top: sourceImageTop,
            left: sourceImageLeft,
            width: sourceImageRect.width,
            height: sourceImageRect.height,
          }}
          transition={spring}
          style={{
            background: `radial-gradient(circle at 50% 55%, ${palette.accent}aa 0%, ${palette.dark} 78%)`,
          }}
        >
          {student.portraitUrl ? (
            <img
              src={student.portraitUrl}
              alt={student.displayName}
              className="h-full w-full object-cover object-top"
              draggable={false}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center font-mono text-xs tracking-widest text-chalkboard/30">
              {initials(student.displayName)}
            </span>
          )}
        </motion.div>
      </motion.div>

      {/* Details — book page that folds open */}
      <div
        className="absolute"
        style={{
          left: layout.details.x,
          top: layout.details.y,
          width: layout.details.w,
          height: layout.details.h,
          perspective: 1600,
        }}
      >
        <motion.div
          initial={{ ...foldClosed, opacity: 0 }}
          animate={{ ...foldOpen, opacity: 1 }}
          exit={{ ...foldClosed, opacity: 0 }}
          transition={{
            duration: 0.72,
            ease: [0.62, 0, 0.18, 1],
            delay: 0.16,
          }}
          style={{
            width: "100%",
            height: "100%",
            transformOrigin: layout.foldOrigin,
            backfaceVisibility: "hidden",
            boxShadow: `0 30px 90px ${palette.dark}b3`,
            color: palette.dark,
          }}
          className="flex h-full w-full flex-col bg-[#fdfaf2] p-6 sm:p-8"
        >
          <p
            className="font-mono text-xs font-bold tracking-[0.24em] uppercase"
            style={{ color: palette.dark + "80" }}
          >
            {student.pronouns}
          </p>
          <h2 className="font-display mt-1 lg:text-3xl text-xl leading-none font-black tracking-tight sm:text-5xl">
            {student.displayName}
          </h2>
          <p className="mt-3 font-mono lg:text-xl text:md leading-snug">
            {student.introduction}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {student.competencies.map((c) => (
              <span
                key={`${student.userId}-${c}`}
                className="rounded-full px-3 py-1 font-mono lg:text-sm text-xs lowercase lg:font-normal font-bold"
                style={{
                  backgroundColor: palette.accent,
                  color: palette.dark,
                }}
              >
                {c}
              </span>
            ))}
          </div>

          <div className="mt-auto flex items-end gap-3 pt-6">
            {isMobile ? (
              <>
                {student.link && (
                  <a
                    href={student.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      backgroundColor: palette.accent,
                      color: palette.dark,
                    }}
                    className="flex-1 rounded-full lg:px-5 lg:py-4 py-2 text-center font-mono text-lg font-bold tracking-widest uppercase shadow-md transition hover:brightness-110"
                  >
                    ↗ visit
                  </a>
                )}
                {printer.available && (
                  <button
                    type="button"
                    onClick={() => {
                      void printer.print(student);
                    }}
                    disabled={printer.printing}
                    style={{
                      backgroundColor: palette.dark,
                      color: palette.accent,
                    }}
                    className="flex-1 rounded-full lg:px-5 lg:py-4 py-2 text-center font-mono text-lg font-bold tracking-widest uppercase shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {printer.printing ? "printing…" : "⎙ print"}
                  </button>
                )}
              </>
            ) : (
              <>
                {student.link && (
                  <div className="flex flex-col items-start gap-1">
                    <div className="rounded-sm p-1.5">
                      <QRCodeSVG
                        value={student.link}
                        size={124}
                        bgColor={palette.dark}
                        fgColor="#fdfaf2"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-1 flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void throwToStage();
                    }}
                    disabled={sendDisabled || flying}
                    style={{
                      backgroundColor: palette.accent,
                      color: palette.dark,
                    }}
                    className={cn(
                      "rounded-full px-5 py-3 text-left font-mono text-sm font-bold tracking-widest uppercase shadow-md transition disabled:cursor-not-allowed disabled:opacity-50",
                      !sendDisabled && "hover:brightness-110",
                    )}
                  >
                    ↑{" "}
                    {isOnStage
                      ? "extend stage"
                      : isQueued
                        ? "bump in queue"
                        : "send to stage"}
                  </button>
                  {printer.available && (
                    <button
                      type="button"
                      onClick={() => {
                        void printer.print(student);
                      }}
                      disabled={printer.printing}
                      style={{
                        backgroundColor: palette.dark,
                        color: palette.accent,
                      }}
                      className="rounded-full px-5 py-3 text-left font-mono text-sm font-bold tracking-widest uppercase shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {printer.printing ? "printing…" : "⎙ print"}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
