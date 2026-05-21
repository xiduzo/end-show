import type { StageColor } from "@end-show/api/routers/student";
import { ShaderGradient, ShaderGradientCanvas } from "@shadergradient/react";
import { useEffect, useState } from "react";

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

function useCyclingTriplet(
  variants: [string, string, string][],
): [string, string, string] {
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

  const n = variants.length;
  const phase = (tick / CYCLE_MS) % n;
  const i = Math.floor(phase);
  const t = phase - i;
  // ease in/out
  const ease = t * t * (3 - 2 * t);
  const a = variants[i];
  const b = variants[(i + 1) % n];
  return [
    lerpHex(a[0], b[0], ease),
    lerpHex(a[1], b[1], ease),
    lerpHex(a[2], b[2], ease),
  ];
}

export function StageShaderBackdrop({
  color,
  seed,
}: {
  color: StageColor | null;
  seed: string;
}) {
  const resolved = resolveStageColor(color, seed);
  const [c1, c2, c3] = useCyclingTriplet(PALETTE[resolved]);

  // Shader band lives in the lower ~35% of the screen, with the top edge
  // feathered so it blends into the work media.
  const maskImage =
    "linear-gradient(to top, rgba(0,0,0,1) 30%, rgba(0,0,0,0.85) 60%, rgba(0,0,0,0) 100%)";

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[35%]"
        style={{ WebkitMaskImage: maskImage, maskImage }}
      >
        <ShaderGradientCanvas
          style={{ position: "absolute", inset: 0 }}
          pixelDensity={1}
          pointerEvents="none"
        >
          <ShaderGradient
            control="props"
            type="waterPlane"
            color1={c1}
            color2={c2}
            color3={c3}
            uTime={0}
            uSpeed={0.05}
            uStrength={1.4}
            uDensity={1.3}
            uFrequency={0}
            uAmplitude={0}
            positionX={0}
            positionY={0}
            positionZ={0}
            rotationX={50}
            rotationY={0}
            rotationZ={-60}
            cameraZoom={9.1}
            lightType="3d"
            brightness={1.1}
            envPreset="city"
            grain="off"
            reflection={0.1}
            range="enabled"
            rangeStart={0}
            rangeEnd={40}
          />
        </ShaderGradientCanvas>
      </div>
      {/* Readability gradient: dark at the bottom for text contrast, fades up */}
      <div
        aria-hidden
        className="from-lego/85 via-lego/30 pointer-events-none absolute inset-0 z-0 bg-linear-to-t to-transparent"
      />
    </>
  );
}
