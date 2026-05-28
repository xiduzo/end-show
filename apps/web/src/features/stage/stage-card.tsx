import type { StudentSummary } from "@end-show/api/routers/student";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";

type ResolvedMedia = ReturnType<typeof resolveWorkMedia>;

import { HyperText } from "@/features/text-effects";
import { MorphingName } from "@/features/text-effects";
import { WordRotate } from "@/features/text-effects";

import { BackgroundDecor } from "./background-decor";
import { DesatCrossfade } from "./desat-crossfade";
import { resolveScrim, resolveWorkMedia } from "./stage-card-resolvers";
import { StageShaderBackdrop } from "./stage-shader-backdrop";

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

export function StageCard({ student }: { student: StudentSummary }) {
  return (
    <div className="bg-lego relative h-full w-full overflow-hidden text-chalkboard">
      <BackgroundDecor />
      <div className="relative z-10 flex h-full flex-col">
        <CurrentStage student={student} />
      </div>
    </div>
  );
}

function CurrentStage({ student }: { student: StudentSummary }) {
  const scrim = resolveScrim(student);

  return (
    <div className="relative flex h-full flex-col px-8 py-8">
      <WorkMedia student={student} />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-5 h-[50%] transition-[background-color] duration-700 ease-out"
        style={{
          backgroundColor: scrim.dark,
          maskImage:
            "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.88) 20%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.2) 80%, rgba(0,0,0,0.05) 92%, rgba(0,0,0,0) 100%)",
          WebkitMaskImage:
            "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.88) 20%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0.45) 60%, rgba(0,0,0,0.2) 80%, rgba(0,0,0,0.05) 92%, rgba(0,0,0,0) 100%)",
        }}
      />
      <div
        className="relative z-10 mt-auto grid grid-cols-[auto_1fr_auto] items-end gap-10"
        style={{ textShadow: "0 1px 12px rgba(0,0,0,0.45)" }}
      >
        <Avatar student={student} size={256} withInitials />

        <div className="min-w-0">
          <p className="font-mono text-sm -mb-6 tracking-widest text-chalkboard/60 uppercase">
            <WordRotate
              className="text-chalkboard/60"
              word={student.pronouns}
              delay={1000}
            />
          </p>
          <h1 className="font-display text-h1 flex items-baseline text-chalkboard">
            <MorphingName
              text={student.displayName.split(/\s+/)[0] ?? student.displayName}
            />
          </h1>
          <p className="text-body-3 font-mono text-chalkboard/80">
            <HyperText duration={700} delay={700}>
              {student.introduction}
            </HyperText>
          </p>
          <motion.div
            layout
            className="mt-5 flex flex-wrap gap-2"
            transition={{ duration: 0.5, ease: "easeInOut" }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {student.competencies.map((c, i) => (
                <motion.span
                  key={`${student.userId}-${c}`}
                  layout
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.85,
                    transition: {
                      duration: 0.35,
                      delay: 0.6 + i * 0.06,
                      ease: "easeIn",
                    },
                  }}
                  transition={{
                    opacity: {
                      duration: 0.35,
                      delay: 1.2 + i * 0.08,
                      ease: "easeOut",
                    },
                    scale: {
                      duration: 0.35,
                      delay: 1.2 + i * 0.08,
                      ease: "easeOut",
                    },
                    layout: { duration: 0.6, ease: "easeInOut" },
                  }}
                  className="rounded-full border border-chalkboard/25 font-extrabold px-4 py-1 font-mono text-sm text-chalkboard/85"
                >
                  {c}
                </motion.span>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>

        {student.link && <LinkQr url={student.link} scrim={scrim} />}
      </div>
    </div>
  );
}

function WorkMedia({ student }: { student: StudentSummary }) {
  const media = resolveWorkMedia(student);
  const key = `${student.userId}:${media.kind}:${media.kind !== "none" ? media.url : "shader"}`;

  return (
    <AnimatePresence mode="sync" initial={false}>
      <motion.div
        key={key}
        initial={{ opacity: 0, scale: 1.04 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 1.02 }}
        transition={{
          opacity: { duration: 0.7, ease: "easeInOut" },
          scale: { duration: 1.2, ease: [0.22, 1, 0.36, 1] },
        }}
        className="absolute inset-0 z-0"
      >
        <MediaSlide student={student} media={media} />
      </motion.div>
    </AnimatePresence>
  );
}

function MediaSlide({
  student,
  media,
}: {
  student: StudentSummary;
  media: ResolvedMedia;
}) {
  const [ready, setReady] = useState(media.kind === "none");

  if (media.kind === "image") {
    return (
      <motion.img
        src={media.url}
        alt={`${student.displayName} work`}
        className="h-full w-full object-cover"
        onLoad={() => setReady(true)}
        animate={{ opacity: ready ? 1 : 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    );
  }

  if (media.kind === "video") {
    return (
      <motion.video
        src={media.url}
        autoPlay
        muted
        loop
        playsInline
        crossOrigin="anonymous"
        preload="auto"
        className="h-full w-full object-cover"
        onCanPlay={() => setReady(true)}
        animate={{ opacity: ready ? 1 : 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    );
  }

  return (
    <StageShaderBackdrop
      color={student.stageColor}
      seed={student.userId}
      variant="full"
    />
  );
}

function Avatar({
  student,
  size,
  withInitials,
}: {
  student: StudentSummary;
  size: number;
  withInitials?: boolean;
}) {
  const initials = student.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  if (student.portraitUrl) {
    return (
      <div
        className="relative overflow-hidden rounded-4xl border border-chalkboard/15"
        style={{ width: size, height: size }}
      >
        <DesatCrossfade
          src={student.portraitUrl}
          alt={student.displayName}
          className="h-full w-full object-cover"
          durationMs={1200}
          brightnessLift
        />
      </div>
    );
  }

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-4xl bg-chalkboard/95"
      style={{
        width: size,
        height: size,
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 6px)",
      }}
    >
      {withInitials && (
        <span className="text-lego-dark font-mono text-xs tracking-widest">
          {initials}
        </span>
      )}
    </div>
  );
}

function LinkQr({
  url,
  scrim,
}: {
  url: string;
  scrim: { dark: string; accent: string };
}) {
  const [displayed, setDisplayed] = useState(url);
  const [blurred, setBlurred] = useState(false);
  const prevUrl = useRef(url);

  useEffect(() => {
    if (url === prevUrl.current) return;
    prevUrl.current = url;
    setBlurred(true);
    const swap = setTimeout(() => setDisplayed(url), 220);
    const clear = setTimeout(() => setBlurred(false), 440);
    return () => {
      clearTimeout(swap);
      clearTimeout(clear);
    };
  }, [url]);

  return (
    <div className="flex flex-col items-end gap-2">
      <p className="font-mono text-xs tracking-widest text-chalkboard/80 uppercase">
        keep exploring ↓
      </p>
      <div className="qr-tinted rounded-xl bg-chalkboard p-3">
        <motion.div
          animate={{
            filter: blurred ? "blur(8px)" : "blur(0px)",
            scale: blurred ? 0.9 : 1,
            opacity: blurred ? 0.6 : 1,
          }}
          transition={{
            duration: 0.22,
            ease: blurred ? "circInOut" : "easeInOut",
          }}
        >
          <QRCodeSVG
            value={displayed}
            size={126}
            bgColor="#F8F9FA"
            fgColor={scrim.dark}
          />
        </motion.div>
      </div>
    </div>
  );
}
