import { cn } from "@end-show/ui/lib/utils";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const DEFAULT_MORPH_TIME = 1.2;

export function MorphingName({
  text,
  className,
  compact = false,
  duration,
}: {
  text: string;
  className?: string;
  compact?: boolean;
  duration?: number;
}) {
  const morphTime = duration ?? DEFAULT_MORPH_TIME;
  const morphTimeRef = useRef(morphTime);
  morphTimeRef.current = morphTime;
  const maxBlur = compact ? 6 : 100;
  const blurCoef = compact ? 2 : 8;
  const text1Ref = useRef<HTMLSpanElement>(null);
  const text2Ref = useRef<HTMLSpanElement>(null);
  const sizerRef = useRef<HTMLSpanElement>(null);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const prevRef = useRef(text);
  const currentRef = useRef(text);
  const morphRef = useRef(0);
  const morphingRef = useRef(false);
  const lastFrameRef = useRef<number>(0);
  const mountedRef = useRef(false);
  const [settled, setSettled] = useState(true);
  const [width, setWidth] = useState<number | null>(null);
  const [bearing, setBearing] = useState(0);

  const applyFraction = useCallback(
    (fraction: number) => {
      const c1 = text1Ref.current;
      const c2 = text2Ref.current;
      if (!c1 || !c2) return;
      const f = Math.max(0.0001, Math.min(1, fraction));
      const inv = Math.max(0.0001, 1 - f);
      c2.style.filter = `blur(${Math.min(blurCoef / f - blurCoef, maxBlur)}px)`;
      c2.style.opacity = `${Math.pow(f, 0.4) * 100}%`;
      c1.style.filter = `blur(${Math.min(blurCoef / inv - blurCoef, maxBlur)}px)`;
      c1.style.opacity = `${Math.pow(inv, 0.4) * 100}%`;
    },
    [blurCoef, maxBlur],
  );

  const settle = useCallback(() => {
    const c1 = text1Ref.current;
    const c2 = text2Ref.current;
    if (!c1 || !c2) return;
    c1.style.opacity = "0%";
    c1.style.filter = "none";
    c2.style.opacity = "100%";
    c2.style.filter = "none";
  }, []);

  useLayoutEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      currentRef.current = text;
      prevRef.current = text;
      if (text1Ref.current) text1Ref.current.textContent = text;
      if (text2Ref.current) text2Ref.current.textContent = text;
      if (sizerRef.current) sizerRef.current.textContent = text;
      settle();
      return;
    }
    if (text === currentRef.current) return;

    prevRef.current = currentRef.current;
    currentRef.current = text;
    morphRef.current = 0;
    morphingRef.current = true;
    setSettled(false);

    if (text1Ref.current) text1Ref.current.textContent = prevRef.current;
    if (text2Ref.current) text2Ref.current.textContent = currentRef.current;
    if (sizerRef.current) sizerRef.current.textContent = currentRef.current;
    applyFraction(0);
  }, [text, applyFraction, settle]);

  useLayoutEffect(() => {
    const el = sizerRef.current;
    if (!el) return;
    let cancelled = false;
    const measure = async () => {
      setWidth(el.offsetWidth);
      const cs = window.getComputedStyle(el);
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      try {
        await document.fonts.load(font, text);
      } catch {
        // ignore
      }
      if (cancelled) return;
      const canvas =
        measureCanvasRef.current ??
        (measureCanvasRef.current = document.createElement("canvas"));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.font = font;
      const m = ctx.measureText(text);
      const left = m.actualBoundingBoxLeft;
      setBearing(Number.isFinite(left) ? left : 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [text]);

  useEffect(() => {
    let raf = 0;
    lastFrameRef.current = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;
      if (!morphingRef.current) return;
      morphRef.current += dt;
      let fraction = morphRef.current / morphTimeRef.current;
      if (fraction >= 1) {
        fraction = 1;
        morphingRef.current = false;
        prevRef.current = currentRef.current;
        settle();
        setSettled(true);
        return;
      }
      applyFraction(fraction);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [applyFraction, settle]);

  return (
    <span
      className={cn(
        "relative inline-block align-baseline transition-[width,transform] ease-out",
        !settled &&
          (compact
            ? "[filter:url(#stage-name-morph-compact)_blur(0.4px)]"
            : "[filter:url(#stage-name-morph)_blur(0.6px)]"),
        className,
      )}
      style={{
        ...(width != null ? { width } : {}),
        transform: bearing ? `translateX(${bearing}px)` : undefined,
        transitionDuration: `${morphTime * 1000}ms`,
      }}
    >
      <span ref={sizerRef} className="invisible inline-block whitespace-nowrap">
        {text}
      </span>
      {settled && (
        <span className="pointer-events-none absolute inset-0 inline-block whitespace-nowrap">
          {text}
        </span>
      )}
      <span
        ref={text1Ref}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 inline-block whitespace-nowrap",
          settled && "hidden",
        )}
      />
      <span
        ref={text2Ref}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 inline-block whitespace-nowrap",
          settled && "hidden",
        )}
      />
      <MorphFilter />
    </span>
  );
}

function MorphFilter() {
  return (
    <svg className="pointer-events-none fixed h-0 w-0" aria-hidden>
      <defs>
        <filter id="stage-name-morph">
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 255 -140"
          />
        </filter>
        <filter id="stage-name-morph-compact">
          <feColorMatrix
            in="SourceGraphic"
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 12 -4"
          />
        </filter>
      </defs>
    </svg>
  );
}
