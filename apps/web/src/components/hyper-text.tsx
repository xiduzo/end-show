import { cn } from "@end-show/ui/lib/utils";
import {
  type ElementType,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const DEFAULT_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type HyperTextProps = {
  children: string;
  className?: string;
  duration?: number;
  delay?: number;
  as?: ElementType;
  startOnView?: boolean;
  animateOnHover?: boolean;
  characterSet?: string[];
};

const isSpace = (c: string) => c === " " || c === " ";

export function HyperText({
  children,
  className,
  duration = 800,
  delay = 0,
  as: Tag = "span",
  startOnView = false,
  animateOnHover = false,
  characterSet = DEFAULT_CHARSET,
}: HyperTextProps) {
  const target = children;
  const [display, setDisplay] = useState<string>(target);
  const elRef = useRef<HTMLElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevTargetRef = useRef<string>(target);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const animate = useCallback(() => {
    stop();
    const chars = target.split("");
    const prev = prevTargetRef.current;
    const prevPool = prev.split("").filter((c) => !isSpace(c));
    const totalSteps = Math.max(chars.length * 2, 8);
    const tick = Math.max(15, duration / totalSteps);
    let step = 0;

    intervalRef.current = setInterval(() => {
      step += 1;
      const progress = step / totalSteps;
      const revealed = Math.floor(progress * chars.length);
      setDisplay(
        chars
          .map((c, i) => {
            if (isSpace(c)) return c;
            if (i < revealed) return c;
            const pool = prevPool.length > 0 ? prevPool : characterSet;
            return pool[Math.floor(Math.random() * pool.length)];
          })
          .join(""),
      );
      if (step >= totalSteps) {
        setDisplay(target);
        prevTargetRef.current = target;
        stop();
      }
    }, tick);
  }, [target, duration, characterSet, stop]);

  useEffect(() => {
    if (animateOnHover) {
      setDisplay(target);
      prevTargetRef.current = target;
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    let observer: IntersectionObserver | null = null;

    const trigger = () => {
      timer = setTimeout(animate, delay);
    };

    if (startOnView) {
      const el = elRef.current;
      if (!el) return;
      observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              trigger();
              observer?.disconnect();
              break;
            }
          }
        },
        { threshold: 0.1 },
      );
      observer.observe(el);
    } else {
      trigger();
    }

    return () => {
      if (timer) clearTimeout(timer);
      observer?.disconnect();
      stop();
    };
  }, [target, animate, delay, startOnView, animateOnHover, stop]);

  return (
    <Tag
      ref={elRef as never}
      className={cn(className)}
      onMouseEnter={animateOnHover ? animate : undefined}
    >
      {display}
    </Tag>
  );
}
