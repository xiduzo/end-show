import type { StudentSummary } from "@end-show/api/routers/student";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useCallback, useEffect, useRef, useState } from "react";

import { Polaroid } from "./polaroid";
import type { CompanionTier } from "./types";
import { hash, rand } from "./wonk";

export function WallLane({
  tier,
  students,
  showcasedId,
  onTap,
  onThrow,
  inFlight,
}: {
  tier: CompanionTier;
  students: StudentSummary[];
  showcasedId: string | null;
  onTap: (
    student: StudentSummary,
    sourceCardRect: DOMRect,
    sourceImageRect: DOMRect,
  ) => void;
  onThrow: (student: StudentSummary) => Promise<boolean>;
  inFlight: Set<string>;
}) {
  const isMobile = tier === "mobile";
  const N = students.length;

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(0); // px the lane has scrolled
  const dirRef = useRef<1 | -1>(1); // +1 = lane scrolls forward (cards move left)
  const velocityRef = useRef(0); // px/frame energy on top of baseline drift
  const dragRef = useRef<null | {
    startX: number;
    startY: number;
    startPos: number;
    id: number;
    moved: boolean;
    lastX: number;
    lastT: number;
    sampleVel: number;
    locked: "h" | "v" | null;
    cardWrapper: HTMLElement | null;
    student: StudentSummary | null;
    slotKey: string | null;
    rot: number;
    velocityV: number;
    lastY: number;
  }>(null);
  const suppressClickRef = useRef(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [throws, setThrows] = useState<
    { slotKey: string; studentId: string }[]
  >([]);
  const [throwActive, setThrowActive] = useState(false);
  const paused = showcasedId != null || throwActive;

  // Lane geometry. SPACING is centre-to-centre distance between slots; cards
  // jitter around that and may overlap slightly to feel like a wall.
  const BASE_CARD_W = isMobile ? 150 : 290;
  const SPACING = isMobile ? 200 : 360;
  const DRIFT_VEL = 0.35; // px per frame, baseline ambient drift
  const FRICTION = 0.94; // per-frame velocity decay (closer to 1 = longer glide)
  const MIN_VEL = 0.02;
  const WHEEL_IMPULSE = 0.32; // wheel delta -> velocity impulse
  const KEY_IMPULSE = 14; // arrow key velocity impulse (px/frame)

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Track must be wide enough that one copy fully covers the viewport plus
  // buffer; otherwise wrap seam shows. Cycle through students if too few.
  const minSlots = Math.max(
    N,
    Math.max(1, Math.ceil(((size.w || 800) + SPACING * 2) / SPACING)),
  );
  const slots = N === 0 ? 0 : minSlots;
  const TRACK_W = slots * SPACING;

  const applyTransform = useCallback(() => {
    const track = trackRef.current;
    if (track)
      track.style.transform = `translate3d(${-posRef.current}px, 0, 0)`;
  }, []);

  // After geometry changes, re-apply transform so initial paint is correct
  useEffect(() => {
    applyTransform();
  }, [applyTransform, TRACK_W]);

  // Continuous physics loop: baseline drift + decaying velocity from input.
  // While dragging, position is driven directly by the pointer handler.
  useEffect(() => {
    if (N === 0 || paused || TRACK_W === 0) return;
    let raf = 0;
    const tick = () => {
      if (!dragRef.current) {
        const v = velocityRef.current;
        const step = dirRef.current * DRIFT_VEL + v;
        let next = posRef.current + step;
        if (next >= TRACK_W) next -= TRACK_W;
        else if (next < 0) next += TRACK_W;
        posRef.current = next;
        applyTransform();
        const decayed = v * FRICTION;
        velocityRef.current = Math.abs(decayed) < MIN_VEL ? 0 : decayed;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [N, paused, TRACK_W, applyTransform]);

  const wrap = useCallback(
    (v: number) => {
      if (TRACK_W <= 0) return v;
      return ((v % TRACK_W) + TRACK_W) % TRACK_W;
    },
    [TRACK_W],
  );

  const addImpulse = useCallback((delta: number) => {
    if (delta === 0) return;
    dirRef.current = delta > 0 ? 1 : -1;
    velocityRef.current += delta;
  }, []);

  useHotkey("ArrowRight", () => addImpulse(KEY_IMPULSE));
  useHotkey("ArrowLeft", () => addImpulse(-KEY_IMPULSE));

  // Wheel + trackpad: each tick adds energy to the lane.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || N === 0) return;
    const onWheel = (e: WheelEvent) => {
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (d === 0) return;
      e.preventDefault();
      addImpulse(d * WHEEL_IMPULSE);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [N, addImpulse]);

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    const wrapper = target.closest(
      "[data-card-wrapper]",
    ) as HTMLElement | null;
    const studentId = wrapper?.getAttribute("data-student-id") ?? null;
    const slotKey = wrapper?.getAttribute("data-slot-key") ?? null;
    const rotAttr = wrapper?.getAttribute("data-rot");
    const student = studentId
      ? (students.find((s) => s.userId === studentId) ?? null)
      : null;
    velocityRef.current = 0;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPos: posRef.current,
      id: e.pointerId,
      moved: false,
      lastX: e.clientX,
      lastT: performance.now(),
      sampleVel: 0,
      locked: null,
      cardWrapper: wrapper,
      student,
      slotKey,
      rot: rotAttr ? Number(rotAttr) : 0,
      velocityV: 0,
      lastY: e.clientY,
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (d.locked === null) {
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
      if (Math.abs(dx) + Math.abs(dy) < 10) return;
      if (
        Math.abs(dy) > Math.abs(dx) &&
        dy < 0 &&
        d.cardWrapper &&
        d.student &&
        d.slotKey
      ) {
        d.locked = "v";
        setThrowActive(true);
      } else {
        d.locked = "h";
      }
    }

    if (d.locked === "h") {
      if (Math.abs(dx) > 4) d.moved = true;
      posRef.current = wrap(d.startPos - dx);
      applyTransform();
      const now = performance.now();
      const stepX = e.clientX - d.lastX;
      const dt = Math.max(1, now - d.lastT);
      const inst = (-stepX / dt) * 16.6667;
      d.sampleVel = d.sampleVel * 0.6 + inst * 0.4;
      d.lastX = e.clientX;
      d.lastT = now;
    } else if (d.locked === "v" && d.cardWrapper) {
      d.cardWrapper.style.transition = "";
      d.cardWrapper.style.transform = `translateY(calc(-50% + ${dy}px)) rotate(${d.rot}deg)`;
      const now = performance.now();
      const dt = Math.max(1, now - d.lastT);
      d.velocityV = (e.clientY - d.lastY) / dt;
      d.lastY = e.clientY;
      d.lastT = now;
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;

    if (d.locked === "v" && d.cardWrapper && d.student && d.slotKey) {
      const dy = e.clientY - d.startY;
      const fastUp = d.velocityV < -0.6;
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (dy < -80 || fastUp) {
        const slotKey = d.slotKey;
        const studentId = d.student.userId;
        const student = d.student;
        setThrows((prev) => [...prev, { slotKey, studentId }]);
        window.setTimeout(() => {
          setThrows((prev) => prev.filter((x) => x.slotKey !== slotKey));
        }, 600);
        void onThrow(student).then((ok) => {
          if (!ok) {
            setThrows((prev) => prev.filter((x) => x.slotKey !== slotKey));
          }
        });
      } else {
        const wrapper = d.cardWrapper;
        const rot = d.rot;
        wrapper.style.transition = "transform 220ms ease-out";
        wrapper.style.transform = `translateY(-50%) rotate(${rot}deg)`;
        window.setTimeout(() => {
          wrapper.style.transition = "";
        }, 240);
      }
      setThrowActive(false);
    } else if (d.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (Math.abs(d.sampleVel) > MIN_VEL) {
        velocityRef.current = d.sampleVel;
        dirRef.current = d.sampleVel > 0 ? 1 : -1;
      }
    }

    dragRef.current = null;
  };

  if (N === 0) return null;

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="relative h-full w-full cursor-grab overflow-hidden select-none active:cursor-grabbing"
      style={{ touchAction: "pan-y" }}
    >
      <div
        ref={trackRef}
        className="absolute top-1/2 left-0 will-change-transform"
        style={{ width: TRACK_W * 2, height: 0 }}
      >
        {[0, 1].map((copy) =>
          Array.from({ length: slots }).map((_, i) => {
            const s = students[i % N];
            const slotKey = `${copy}-${i}-${s.userId}`;
            const isThrown = throws.some((t) => t.slotKey === slotKey);
            const otherCopyThrowing =
              !isThrown && throws.some((t) => t.studentId === s.userId);
            const hidden = showcasedId === s.userId || otherCopyThrowing;
            const baseX = copy * TRACK_W + i * SPACING + SPACING / 2;
            // Per-slot stable wonk so each copy looks different
            const seed = hash(`${s.userId}::${i}`);
            const yJitter = rand(seed, 11) * (size.h ? size.h * 0.06 : 24);
            const rot = rand(seed, 12) * 4;
            const widthMul = 0.95 + (rand(seed, 13) * 0.5 + 0.5) * 0.1; // 0.95–1.05
            const cardW = BASE_CARD_W * widthMul;
            const transform = isThrown
              ? `translateY(calc(-50% - 110vh)) rotate(${rot - 8}deg)`
              : `translateY(-50%) rotate(${rot}deg)`;
            const transition = isThrown
              ? "transform 550ms cubic-bezier(0.4,0,0.2,1), opacity 550ms ease-out"
              : undefined;
            return (
              <div
                key={slotKey}
                data-card-wrapper=""
                data-slot-key={slotKey}
                data-student-id={s.userId}
                data-rot={rot}
                className="absolute"
                style={{
                  left: baseX - cardW / 2,
                  top: yJitter,
                  transform,
                  transition,
                  opacity: isThrown ? 0 : 1,
                  visibility: hidden ? "hidden" : "visible",
                }}
              >
                <button
                  type="button"
                  aria-label={`${s.displayName} — tap to open`}
                  onClick={(e) => {
                    if (suppressClickRef.current) return;
                    const cardEl = e.currentTarget as HTMLElement;
                    const cardRect = cardEl.getBoundingClientRect();
                    const imgEl = cardEl.querySelector(
                      "[data-polaroid-image]",
                    ) as HTMLElement | null;
                    const imgRect = imgEl?.getBoundingClientRect() ?? cardRect;
                    onTap(s, cardRect, imgRect);
                  }}
                  className="block cursor-pointer focus:outline-none"
                >
                  <Polaroid
                    student={s}
                    focused={false}
                    queued={inFlight.has(s.userId)}
                    width={cardW}
                  />
                </button>
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
