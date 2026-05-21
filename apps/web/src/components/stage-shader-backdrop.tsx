import type { StageColor } from "@end-show/api/routers/student";
import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";
import { useEffect, useRef, useState } from "react";

const PALETTE: Record<StageColor, [string, string, string][]> = {
  slime: [
    ["#D9E73C", "#7BAD2E", "#363A0A"],
    ["#E7F26B", "#5C8F1E", "#1F2606"],
    ["#BFD12A", "#8FBE3A", "#2A330A"],
  ],
  crayon: [
    ["#F2BB06", "#B07700", "#493800"],
    ["#FFD64A", "#8A5C00", "#2A2000"],
    ["#E0A800", "#C98A1A", "#5A4500"],
  ],
  bubblegum: [
    ["#F3B9FF", "#A56BCC", "#3E064A"],
    ["#FFD0FF", "#7A3FA6", "#220028"],
    ["#E297F5", "#B97BD9", "#561870"],
  ],
};

const ORDER: StageColor[] = ["slime", "crayon", "bubblegum"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function resolveStageColor(
  color: StageColor | null,
  seed: string,
): StageColor {
  return color ?? ORDER[hash(seed) % ORDER.length];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function lerpHex(a: string, b: string, t: number): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  return rgbToHex([
    ra[0] + (rb[0] - ra[0]) * t,
    ra[1] + (rb[1] - ra[1]) * t,
    ra[2] + (rb[2] - ra[2]) * t,
  ]);
}

// 18s per palette variant, smooth easing
const CYCLE_MS = 18000;
// Palette-to-palette crossfade when the student changes
const PALETTE_CROSSFADE_MS = 1200;

function tripletAt(
  variants: [string, string, string][],
  elapsed: number,
): [string, string, string] {
  const n = variants.length;
  const phase = (elapsed / CYCLE_MS) % n;
  const i = Math.floor(phase);
  const t = phase - i;
  const ease = t * t * (3 - 2 * t);
  const a = variants[i];
  const b = variants[(i + 1) % n];
  return [
    lerpHex(a[0], b[0], ease),
    lerpHex(a[1], b[1], ease),
    lerpHex(a[2], b[2], ease),
  ];
}

function useTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = () => {
      setTick(performance.now() - start);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return tick;
}

function useTransitioningTriplet(
  resolved: StageColor,
): [string, string, string] {
  const tick = useTick();
  const prevRef = useRef<StageColor>(resolved);
  const transitionStartRef = useRef<number | null>(null);

  if (prevRef.current !== resolved && transitionStartRef.current === null) {
    transitionStartRef.current = performance.now();
  }

  const target = tripletAt(PALETTE[resolved], tick);
  const start = transitionStartRef.current;
  if (start === null) return target;

  const elapsed = performance.now() - start;
  const t = Math.min(1, elapsed / PALETTE_CROSSFADE_MS);
  const ease = t * t * (3 - 2 * t);
  const from = tripletAt(PALETTE[prevRef.current], tick);

  if (t >= 1) {
    prevRef.current = resolved;
    transitionStartRef.current = null;
    return target;
  }

  return [
    lerpHex(from[0], target[0], ease),
    lerpHex(from[1], target[1], ease),
    lerpHex(from[2], target[2], ease),
  ];
}

export function StageShaderBackdrop({
  color,
  seed,
  variant = "bottom",
}: {
  color: StageColor | null;
  seed: string;
  variant?: "bottom" | "full";
}) {
  const resolved = resolveStageColor(color, seed);
  const [c1, c2, c3] = useTransitioningTriplet(resolved);

  // Shader band lives in the lower ~35% of the screen, with the top edge
  // feathered so it blends into the work media.
  const maskImage =
    "linear-gradient(to top, rgba(0,0,0,1) 30%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0) 100%)";
  const isFull = variant === "full";

  return (
    <>
      <div
        aria-hidden
        className={
          isFull
            ? "pointer-events-none absolute inset-0 z-0"
            : "pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[35%]"
        }
        style={
          isFull ? undefined : { WebkitMaskImage: maskImage, maskImage }
        }
      >
        <ShaderGradientCanvas
          style={{ position: "absolute", inset: 0 }}
          pixelDensity={1}
          pointerEvents="none"
        >
          <ShaderGradient
            control="props"
            animate="on"
            type="waterPlane"
            shader="defaults"
            color1={c1}
            color2={c2}
            color3={c3}
            bgColor1="#000000"
            bgColor2="#000000"
            brightness={1.1}
            cAzimuthAngle={180}
            cDistance={3.9}
            cPolarAngle={115}
            cameraZoom={1}
            envPreset="city"
            fov={45}
            frameRate={10}
            grain="off"
            lightType="3d"
            positionX={-0.5}
            positionY={0.1}
            positionZ={0}
            range="disabled"
            rangeEnd={40}
            rangeStart={0}
            reflection={0.1}
            rotationX={0}
            rotationY={0}
            rotationZ={235}
            uAmplitude={0}
            uDensity={1.1}
            uFrequency={5.5}
            uSpeed={0.1}
            uStrength={2.4}
            uTime={0.2}
          />
        </ShaderGradientCanvas>
      </div>
      {/* Readability gradient: dark at the bottom for text contrast, fades up */}
      <div
        aria-hidden
        className={
          isFull
            ? "from-lego/40 pointer-events-none absolute inset-0 z-0 bg-linear-to-t to-transparent"
            : "from-lego/85 via-lego/30 pointer-events-none absolute inset-0 z-0 bg-linear-to-t to-transparent"
        }
      />
    </>
  );
}
