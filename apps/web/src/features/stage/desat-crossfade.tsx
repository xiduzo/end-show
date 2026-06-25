import { AnimatePresence, motion } from "motion/react";

export function DesatCrossfade({
  src,
  alt,
  className,
  durationMs = 1000,
  brightnessLift = false,
}: {
  src: string;
  alt: string;
  className?: string;
  durationMs?: number;
  brightnessLift?: boolean;
}) {
  const duration = durationMs / 1000;
  const enterFilter = brightnessLift
    ? "grayscale(0%) blur(0px) brightness(105%)"
    : "grayscale(0%) blur(0px) brightness(100%)";
  const restFilter = "grayscale(0%) blur(0px) brightness(100%)";
  const exitFilter = "grayscale(100%) blur(2px) brightness(100%)";

  return (
    <AnimatePresence mode="sync" initial={false}>
      <motion.img
        key={src}
        src={src}
        alt={alt}
        crossOrigin="anonymous"
        className={className}
        initial={{ opacity: 0, filter: enterFilter }}
        animate={{ opacity: 1, filter: restFilter }}
        exit={{ opacity: 0, filter: exitFilter }}
        transition={{ duration, ease: "easeInOut" }}
        style={{ position: "absolute", inset: 0 }}
      />
    </AnimatePresence>
  );
}
