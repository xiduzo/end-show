import type { StudentSummary } from "@end-show/api/routers/student";
import { cn } from "@end-show/ui/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { animate, type AnimationPlaybackControls } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { ConnectionIndicator } from "@/components/connection-indicator";
import { StageShaderBackdrop } from "@/components/stage-shader-backdrop";
import { isValidStageCode, useStageCodeStore } from "@/lib/stageCode";
import { trpc, trpcClient } from "@/utils/trpc";

type QueueSnap = {
  stageCode: string | null;
  kiosk: string[];
  mobile: string[];
};
type StageSnap = {
  stageCode: string | null;
  current: { studentUserId: string; startedAt: number; source: string } | null;
  dwellMs: number;
};

const STICKER_TONES = [
  { bg: "bg-slime", fg: "text-slime" },
  { bg: "bg-crayon", fg: "text-crayon" },
  { bg: "bg-bubblegum", fg: "text-bubblegum" },
  { bg: "bg-slide", fg: "text-chalkboard" },
];

const PORTRAIT_TONES = [
  ["#ff5b23", "#481b07"],
  ["#d9e73c", "#363a0a"],
  ["#f2bb06", "#493b00"],
  ["#f3b9ff", "#3e064a"],
  ["#3a39ff", "#06063c"],
  ["#7be0a8", "#0b3a23"],
  ["#7ec8ff", "#0d2a4a"],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Stable pseudo-random in [-1, 1] from (seed, salt). Lets each student have
// reproducible "wonk" — tilt, jitter, sticker offset — that doesn't change
// between renders.
function rand(seed: number, salt: number): number {
  const x = Math.sin(seed * 9301 + salt * 49297) * 233280;
  return (x - Math.floor(x)) * 2 - 1;
}

// Scale + horizontal-offset tiers extracted from the design reference
// (idle-attract demo). `offset` is in units of center-card-width; `scale` is
// the polaroid scale relative to the center card. Float absD lerps between
// adjacent tiers so values animate smoothly as you scroll.
const TIERS: Array<{ scale: number; offset: number; opacity: number }> = [
  { scale: 1.0, offset: 0.0, opacity: 1.0 },
  { scale: 0.588, offset: 1.25, opacity: 0.9 },
  { scale: 0.412, offset: 2.05, opacity: 0.6 },
  { scale: 0.0, offset: 2.6, opacity: 0.0 },
  { scale: 0.0, offset: 2.9, opacity: 0.0 },
  { scale: 0.0, offset: 3.1, opacity: 0.0 },
];

function tierAt(absD: number): {
  scale: number;
  offset: number;
  opacity: number;
} {
  if (absD <= 0) return TIERS[0];
  const last = TIERS.length - 1;
  if (absD >= last) return TIERS[last];
  const i = Math.floor(absD);
  const t = absD - i;
  const a = TIERS[i];
  const b = TIERS[i + 1];
  return {
    scale: a.scale + (b.scale - a.scale) * t,
    offset: a.offset + (b.offset - a.offset) * t,
    opacity: a.opacity + (b.opacity - a.opacity) * t,
  };
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function CompanionView({
  tier,
  urlCode,
}: {
  tier: "mobile" | "kiosk";
  urlCode: string | null;
}) {
  const stageCode = useStageCodeStore((s) => s.stageCode);
  const setStageCode = useStageCodeStore((s) => s.setStageCode);
  const clearStageCode = useStageCodeStore((s) => s.clear);
  const students = useQuery(trpc.student.listEligible.queryOptions());
  const push = useMutation(trpc.queue.push.mutationOptions());
  const [queue, setQueue] = useState<QueueSnap | null>(null);
  const [stage, setStage] = useState<StageSnap | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [isIdle, setIsIdle] = useState(false);

  useEffect(() => {
    if (urlCode && isValidStageCode(urlCode) && urlCode !== stageCode) {
      setStageCode(urlCode);
    }
  }, [urlCode, stageCode, setStageCode]);

  useEffect(() => {
    const sub = trpcClient.queue.watch.subscribe(
      { stageCode },
      {
        onData: (d) => setQueue(d as QueueSnap),
        onError: (e) => console.error("queue.watch error", e),
      },
    );
    return () => sub.unsubscribe();
  }, [stageCode]);

  useEffect(() => {
    const sub = trpcClient.stage.current.subscribe(
      { stageCode },
      {
        onData: (d) => setStage(d as StageSnap),
        onError: (e) => console.error("stage.current error", e),
      },
    );
    return () => sub.unsubscribe();
  }, [stageCode]);

  const list = students.data ?? [];
  const focused = list[focusIdx];
  const onStageId = stage?.current?.studentUserId ?? null;
  const onStageStudent = onStageId
    ? (list.find((s) => s.userId === onStageId) ?? null)
    : null;

  const fullQueue = useMemo(
    () => [...(queue?.kiosk ?? []), ...(queue?.mobile ?? [])],
    [queue],
  );
  const inFlight = useMemo(() => new Set(fullQueue), [fullQueue]);
  const focusedQueuedPos =
    focused && inFlight.has(focused.userId)
      ? fullQueue.indexOf(focused.userId) + 1
      : null;
  const isFocusedOnStage = focused != null && focused.userId === onStageId;

  const send = useCallback(async () => {
    if (!focused || isFocusedOnStage) return;
    const res = await push.mutateAsync({
      stageCode,
      studentUserId: focused.userId,
      tier,
    });
    if (!res.ok) {
      if (res.reason === "currently-on-stage") toast.error("Already on stage");
      else if (res.reason === "already-queued") toast.error("Already queued");
      else if (res.reason === "exposure-cap") {
        const secs = Math.ceil(res.retryAfterMs / 1000);
        toast.error(`Capped — retry ~${secs}s`);
      }
    } else {
      toast.success(`Sent ${focused.displayName}`);
    }
  }, [focused, isFocusedOnStage, push, stageCode, tier]);

  return (
    <div className="bg-lego relative flex h-full min-h-screen flex-col overflow-hidden text-chalkboard">
      {focused ? (
        <StageShaderBackdrop
          color={focused.stageColor ?? null}
          seed={focused.userId}
          variant="full"
        />
      ) : (
        <BgGrid />
      )}
      <ConnectionIndicator light />

      <Header
        tier={tier}
        stageCode={stageCode}
        onSetCode={(c) => (c ? setStageCode(c) : clearStageCode())}
      />

      <main className="relative z-10 flex flex-1 items-center">
        {list.length === 0 ? (
          <EmptyState loading={students.isLoading} />
        ) : (
          <Lane
            tier={tier}
            students={list}
            focusIdx={focusIdx}
            onFocusChange={setFocusIdx}
            onIdleChange={setIsIdle}
            onTap={send}
            inFlight={inFlight}
            onStageId={onStageId}
          />
        )}
      </main>

      <FooterStatus
        focused={focused}
        isOnStage={isFocusedOnStage}
        queuedPos={focusedQueuedPos}
        onStageStudent={onStageStudent}
        stage={stage}
        idle={isIdle}
      />
    </div>
  );
}

function BgGrid() {
  return (
    <div
      aria-hidden
      className="absolute inset-0 z-0 opacity-[0.05]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 28px)",
      }}
    />
  );
}

function Header({
  tier,
  stageCode,
  onSetCode,
}: {
  tier: "mobile" | "kiosk";
  stageCode: string | null;
  onSetCode: (code: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState("");

  return (
    <header className="relative z-20 flex flex-wrap items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
      <h1 className="font-display text-lg font-bold tracking-tight sm:text-xl">
        End Show<span className="text-slide">'26</span>
      </h1>

      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        className="bg-slide text-lego inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[10px] font-bold tracking-widest uppercase shadow-md"
      >
        <span>{tier}</span>
        <span className="text-lego/60">·</span>
        <span>{stageCode ?? "default"}</span>
      </button>

      <p className="hidden font-mono text-[10px] tracking-widest text-chalkboard/40 uppercase sm:block">
        throw any card → big screen
      </p>

      {editing && (
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value.toUpperCase().slice(0, 4))}
            placeholder={stageCode ?? "XKZP"}
            className="w-24 rounded-full border border-chalkboard/20 bg-transparent px-3 py-1 font-mono text-sm tracking-widest"
          />
          <button
            type="button"
            disabled={!isValidStageCode(entry)}
            onClick={() => {
              onSetCode(entry);
              setEntry("");
              setEditing(false);
            }}
            className="rounded-full border border-chalkboard/20 px-3 py-1 font-mono text-[10px] tracking-widest uppercase disabled:opacity-40"
          >
            pair
          </button>
          {stageCode && (
            <button
              type="button"
              onClick={() => {
                onSetCode(null);
                setEditing(false);
              }}
              className="rounded-full border border-chalkboard/20 px-3 py-1 font-mono text-[10px] tracking-widest uppercase"
            >
              reset
            </button>
          )}
        </div>
      )}
    </header>
  );
}

function Lane({
  tier,
  students,
  onFocusChange,
  onIdleChange,
  onTap,
  inFlight,
  onStageId,
}: {
  tier: "mobile" | "kiosk";
  students: StudentSummary[];
  focusIdx: number;
  onFocusChange: (i: number) => void;
  onIdleChange?: (idle: boolean) => void;
  onTap: () => void;
  inFlight: Set<string>;
  onStageId: string | null;
}) {
  const N = students.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0);
  const animRef = useRef<AnimationPlaybackControls | null>(null);
  const dragRef = useRef<null | {
    startX: number;
    startPos: number;
    id: number;
    moved: boolean;
  }>(null);
  const suppressClickRef = useRef(false);
  const wheelIdleRef = useRef<number | null>(null);
  const lastReportedRef = useRef(-1);
  const lastActivityRef = useRef(Date.now());
  const idleRef = useRef(false);
  const dirRef = useRef<1 | -1>(1);
  const [, force] = useState(0);
  const rerender = useCallback(() => force((v) => (v + 1) & 0xffff), []);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Mobile: center fills most of the viewport, side cards become slivers.
  // Kiosk: center stays modest, side cards readable. Both capped by height
  // (polaroid is ~4/3 tall + 68px chrome, ≤70% of available height).
  const isMobile = tier === "mobile";
  const MAX_W = isMobile ? 480 : 360;
  const widthByW = isMobile
    ? Math.max(200, size.w * 0.7)
    : Math.min(size.w * 0.9, Math.max(200, size.w * 0.22));
  const widthByH = Math.max(160, (size.h * 0.7 - 68) * 0.75);
  const cardWidth = Math.min(MAX_W, widthByW, widthByH);
  // Inter-center distances are derived from TIERS — see tierAt().
  const K = 5;
  const IDLE_MS = 4000;
  const IDLE_ADVANCE_MS = 2800; // gap between auto-advances when idle

  const stopAnim = useCallback(() => {
    animRef.current?.stop();
    animRef.current = null;
  }, []);

  const springTo = useCallback(
    (target: number) => {
      stopAnim();
      animRef.current = animate(posRef.current, target, {
        type: "spring",
        stiffness: 140,
        damping: 16,
        mass: 0.9,
        restDelta: 0.001,
        onUpdate: (v) => {
          posRef.current = v;
          rerender();
        },
        onComplete: () => {
          animRef.current = null;
        },
      });
    },
    [rerender, stopAnim],
  );

  const advance = useCallback(
    (dir: 1 | -1) => {
      lastActivityRef.current = Date.now();
      dirRef.current = dir;
      springTo(Math.round(posRef.current) + dir);
    },
    [springTo],
  );

  useHotkey("ArrowRight", () => advance(1));
  useHotkey("ArrowLeft", () => advance(-1));

  // idle detection
  useEffect(() => {
    const check = () => {
      const idle =
        !dragRef.current &&
        wheelIdleRef.current == null &&
        Date.now() - lastActivityRef.current > IDLE_MS;
      if (idle !== idleRef.current) {
        idleRef.current = idle;
        onIdleChange?.(idle);
      }
    };
    const id = window.setInterval(check, 300);
    return () => window.clearInterval(id);
  }, [IDLE_MS, onIdleChange]);

  // idle auto-advance: snap to next card every IDLE_ADVANCE_MS, springy
  useEffect(() => {
    if (N === 0) return;
    let timer: number;
    const tick = () => {
      if (
        idleRef.current &&
        !dragRef.current &&
        wheelIdleRef.current == null &&
        animRef.current == null
      ) {
        springTo(Math.round(posRef.current) + dirRef.current);
      }
      timer = window.setTimeout(tick, IDLE_ADVANCE_MS);
    };
    timer = window.setTimeout(tick, IDLE_ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [N, IDLE_ADVANCE_MS, springTo]);

  // wheel + trackpad
  useEffect(() => {
    const el = containerRef.current;
    if (!el || N === 0) return;
    const onWheel = (e: WheelEvent) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (dx === 0) return;
      e.preventDefault();
      lastActivityRef.current = Date.now();
      dirRef.current = dx > 0 ? 1 : -1;
      stopAnim();
      posRef.current += dx / cardWidth;
      rerender();
      if (wheelIdleRef.current) window.clearTimeout(wheelIdleRef.current);
      wheelIdleRef.current = window.setTimeout(() => {
        wheelIdleRef.current = null;
        springTo(Math.round(posRef.current));
      }, 120);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [cardWidth, rerender, N, springTo, stopAnim]);

  // report focused index to parent
  const focused = N > 0 ? ((Math.round(posRef.current) % N) + N) % N : 0;
  useEffect(() => {
    if (focused !== lastReportedRef.current) {
      lastReportedRef.current = focused;
      onFocusChange(focused);
    }
  }, [focused, onFocusChange]);

  if (N === 0) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    lastActivityRef.current = Date.now();
    stopAnim();
    dragRef.current = {
      startX: e.clientX,
      startPos: posRef.current,
      id: e.pointerId,
      moved: false,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    lastActivityRef.current = Date.now();
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    posRef.current = d.startPos - dx / cardWidth;
    rerender();
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    lastActivityRef.current = Date.now();
    if (d.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      const dx = posRef.current - d.startPos;
      if (dx !== 0) dirRef.current = dx > 0 ? 1 : -1;
      springTo(Math.round(posRef.current));
    }
    dragRef.current = null;
  };

  const baseIdx = Math.round(posRef.current);
  const cards: React.ReactNode[] = [];
  for (let k = -K; k <= K; k++) {
    const virt = baseIdx + k;
    const dist = virt - posRef.current;
    const absD = Math.abs(dist);
    const studentIdx = ((virt % N) + N) % N;
    const s = students[studentIdx];
    const isFocused = virt === baseIdx;
    const queued = inFlight.has(s.userId);
    const onStage = s.userId === onStageId;

    // Row layout — cards share a vertical baseline. Scale and horizontal
    // offset both come from the design-reference TIERS table.
    const tier = tierAt(absD);
    const sign = dist === 0 ? 0 : dist > 0 ? 1 : -1;
    const x = sign * tier.offset * cardWidth;
    const y = 0;
    const scale = tier.scale;
    const curveRot = 0;

    // Per-student "wonk": stable tilt + x/y jitter, blended in by distance
    // from focus. Focused card keeps ~15% wonk so it never looks too rigid.
    const seed = hash(s.userId);
    const tiltJitter = rand(seed, 1) * 10; // ±10°
    const xJitter = rand(seed, 2) * 14; // ±14px
    const yJitter = rand(seed, 3) * 12; // ±12px
    const wonk = 0.15 + 0.85 * Math.min(1, absD);
    const rotate = curveRot + tiltJitter * wonk;
    const wx = x + xJitter * wonk;
    const wy = y + yJitter * wonk;

    const fade = tier.opacity * Math.max(0, 1 - Math.max(0, absD - (K - 0.5)));

    cards.push(
      <div
        key={`${virt}-${s.userId}`}
        className="absolute top-1/2 left-1/2 will-change-transform"
        style={{
          transform: `translate3d(${wx}px, ${wy}px, 0) translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`,
          zIndex: 100 - Math.round(absD * 10),
          opacity: fade,
        }}
      >
        <button
          type="button"
          aria-label={`${s.displayName} — ${isFocused ? (onStage ? "on stage" : "tap to send") : "focus"}`}
          onClick={() => {
            if (suppressClickRef.current) return;
            lastActivityRef.current = Date.now();
            if (isFocused) {
              onTap();
              return;
            }
            dirRef.current = virt > posRef.current ? 1 : -1;
            springTo(virt);
          }}
          className="block cursor-pointer focus:outline-none"
        >
          <Polaroid
            student={s}
            focused={isFocused}
            queued={queued}
            onStage={onStage}
            width={cardWidth}
          />
        </button>
      </div>,
    );
  }

  return (
    <div className="relative h-full w-full">
      <FocusHint />
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative h-full w-full touch-pan-y cursor-grab select-none active:cursor-grabbing"
        style={{ touchAction: "pan-y" }}
      >
        {cards}
      </div>
    </div>
  );
}

function FocusHint() {
  return (
    <div
      aria-hidden
      className="text-slide pointer-events-none absolute top-6 left-1/2 z-20 -translate-x-1/2 font-mono text-[11px] tracking-[0.3em] uppercase"
    >
      ◇ tap a card or swipe ◇
    </div>
  );
}

function Polaroid({
  student,
  focused,
  queued,
  onStage,
  width,
}: {
  student: StudentSummary;
  focused: boolean;
  queued: boolean;
  onStage: boolean;
  width: number;
}) {
  const seed = hash(student.userId);
  const tone = PORTRAIT_TONES[seed % PORTRAIT_TONES.length];
  const competency = student.competencies[0];
  const sticker = STICKER_TONES[hash(competency ?? "x") % STICKER_TONES.length];
  const stickerTilt = rand(seed, 4) * 14; // ±14°
  const stickerLeft = 12 + rand(seed, 5) * 18; // ~px offset variety
  const pinOffsetPx = rand(seed, 8) * 12; // ±4px wobble around center
  const captionTilt = rand(seed, 7) * 2.5; // hand-written feel

  return (
    <div className="relative will-change-transform">
      {/* polaroid frame */}
      <div
        className={cn(
          "relative bg-[#fdfaf2] p-3 pb-14 shadow-2xl",
          focused && "shadow-[0_30px_80px_rgba(255,91,35,0.35)]",
          focused &&
            !onStage &&
            "ring-2 ring-slide ring-offset-4 ring-offset-lego",
          onStage &&
            focused &&
            "ring-2 ring-crayon ring-offset-4 ring-offset-lego",
        )}
        style={{ width }}
      >
        {/* competency sticker */}
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

        {/* on-screen tape (only when this card is currently on stage) */}
        {onStage && (
          <span
            className="bg-crayon text-crayon absolute -top-3 left-1/2 z-10 -translate-x-1/2 -rotate-2 px-3 py-1 font-mono text-[10px] font-bold tracking-widest uppercase shadow-md"
            style={{
              clipPath:
                "polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%)",
            }}
          >
            on screen
          </span>
        )}

        {/* pushpin */}
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

        {/* portrait area */}
        <div
          className="relative aspect-[3/4] w-full overflow-hidden"
          style={{
            background: `radial-gradient(circle at 50% 55%, ${tone[0]}aa 0%, ${tone[1]} 78%)`,
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

        {/* caption */}
        <p
          className={cn(
            "text-lego absolute right-0 bottom-3 left-0 px-2 text-center font-display font-bold",
            focused ? "text-lg" : "text-sm",
          )}
          style={{ transform: `rotate(${captionTilt}deg)` }}
        >
          {student.displayName}
        </p>

        {queued && !onStage && (
          <div className="bg-slide/95 absolute inset-0 flex items-center justify-center">
            <span className="font-mono text-xs font-bold tracking-widest text-chalkboard uppercase">
              queued
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function FooterStatus({
  focused,
  isOnStage,
  queuedPos,
  onStageStudent,
  stage,
  idle,
}: {
  focused: StudentSummary | undefined;
  isOnStage: boolean;
  queuedPos: number | null;
  onStageStudent: StudentSummary | null;
  stage: StageSnap | null;
  idle: boolean;
}) {
  const label = idle
    ? "idle · attract"
    : !focused
      ? "state · idle"
      : isOnStage
        ? "state · on stage"
        : queuedPos
          ? `state · queued · #${queuedPos}`
          : "state · focused";

  return (
    <footer className="relative z-20 flex items-end justify-between gap-3 px-4 pb-4 sm:px-6 sm:pb-6">
      <span
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-chalkboard/15 bg-chalkboard/5 px-3 py-1 font-mono text-[10px] tracking-widest uppercase",
          idle && "border-slide/40 bg-slide/10 text-slide",
        )}
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            idle ? "bg-slide animate-pulse" : "bg-slide",
          )}
        />
        {label}
      </span>

      {onStageStudent && <OnStagePill student={onStageStudent} stage={stage} />}
    </footer>
  );
}

function OnStagePill({
  student,
  stage,
}: {
  student: StudentSummary;
  stage: StageSnap | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);

  const startedAt = stage?.current?.startedAt ?? null;
  const dwellMs = stage?.dwellMs ?? 30000;
  const elapsed = startedAt ? Math.min(dwellMs, now - startedAt) : 0;
  const elapsedS = Math.floor(elapsed / 1000);
  const dwellS = Math.round(dwellMs / 1000);

  return (
    <div className="border-lego/40 bg-lego/80 inline-flex items-center gap-3 rounded-full border py-1 pr-4 pl-1 shadow-2xl backdrop-blur">
      <div className="relative h-9 w-9 overflow-hidden rounded-full border border-chalkboard/15 bg-chalkboard/10">
        {student.portraitUrl ? (
          <img
            src={student.portraitUrl}
            alt={student.displayName}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-mono text-[10px] text-chalkboard/60">
            {initials(student.displayName)}
          </span>
        )}
      </div>
      <div className="leading-tight">
        <p className="font-mono text-[9px] tracking-widest text-chalkboard/50 uppercase">
          on stage now
        </p>
        <p className="font-display text-sm font-bold">{student.displayName}</p>
        <p className="font-mono text-[9px] tracking-widest text-chalkboard/40 uppercase">
          {elapsedS}s / {dwellS}s
        </p>
      </div>
    </div>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex w-full flex-col items-center gap-3 px-8 text-center">
      <p className="font-mono text-xs tracking-widest text-chalkboard/40 uppercase">
        {loading ? "loading students…" : "no students published yet"}
      </p>
    </div>
  );
}
