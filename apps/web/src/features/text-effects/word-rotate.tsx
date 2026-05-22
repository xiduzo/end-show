import { cn } from "@end-show/ui/lib/utils";
import { AnimatePresence, type MotionProps, motion } from "motion/react";
import { type ElementType, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type WordRotateProps = {
  word: string;
  delay?: number;
  motionProps?: MotionProps;
  className?: string;
  as?: ElementType;
};

const defaultMotion: MotionProps = {
  initial: { opacity: 0, y: "-100%" },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: "100%" },
  transition: { duration: 0.3, ease: "easeOut" },
};

export function WordRotate({
  word,
  delay = 0,
  motionProps = defaultMotion,
  className,
  as: Tag = "span",
}: WordRotateProps) {
  const [current, setCurrent] = useState(word);
  const sizerRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const wordRef = useRef(word);
  wordRef.current = word;
  const MotionTag = useMemo(() => motion.create(Tag), [Tag]);

  useEffect(() => {
    if (word === current) return;
    if (delay <= 0) {
      setCurrent(word);
      return;
    }
    const id = setTimeout(() => setCurrent(wordRef.current), delay);
    return () => clearTimeout(id);
  }, [word, current, delay]);

  useLayoutEffect(() => {
    const el = sizerRef.current;
    if (!el) return;
    const update = () => setWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <span
      className={cn(
        "relative inline-block overflow-hidden align-bottom transition-[width] duration-500 ease-out",
        className,
      )}
      style={width != null ? { width } : undefined}
    >
      <span ref={sizerRef} className="invisible inline-block whitespace-nowrap">
        {current}
      </span>
      <AnimatePresence mode="wait">
        <MotionTag
          key={current}
          className="absolute inset-0 inline-block whitespace-nowrap"
          {...motionProps}
        >
          {current}
        </MotionTag>
      </AnimatePresence>
    </span>
  );
}
