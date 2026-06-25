import { cn } from "@end-show/ui/lib/utils";

import { hash } from "./wonk";

const TRACK_TONES = ["#d9e73c", "#ff5b23", "#f2bb06", "#7be0a8", "#7ec8ff"];

function pickPair(seed: string): { a: string; b: string } {
  const a = TRACK_TONES[hash(seed + ":a") % TRACK_TONES.length]!;
  let b = TRACK_TONES[hash(seed + ":b") % TRACK_TONES.length]!;
  if (b === a) b = TRACK_TONES[(TRACK_TONES.indexOf(a) + 1) % TRACK_TONES.length]!;
  return { a, b };
}

const SIZES = {
  sm: { wrap: "px-1.5 py-0.5 text-base", mid: "text-xs" },
  md: { wrap: "px-2 py-0.5 text-xl", mid: "text-sm" },
  lg: { wrap: "px-2.5 py-1 text-2xl", mid: "text-base" },
} as const;

export function TrackStamp({
  track,
  seed,
  size = "md",
  className,
}: {
  track: string;
  seed: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { a, b } = pickPair(seed);
  const s = SIZES[size];
  const midColor = "#f3b9ff";
  const label = track.trim() || "—";

  // Generic three-zone rendering: first char (tone a), middle run (smaller,
  // lowercase, pink), last char (tone b). Renders "IxD"/"DFT" exactly as
  // before and degrades cleanly for any free-form track label.
  const head = label[0]!;
  const tail = label.length > 1 ? label[label.length - 1]! : "";
  const mid = label.length > 2 ? label.slice(1, -1) : "";

  return (
    <span
      className={cn(
        "inline-flex select-none items-center rounded-sm bg-lego-dark font-display font-black leading-none tracking-tight shadow-sm",
        s.wrap,
        className,
      )}
      aria-label={`Track ${label}`}
    >
      <span style={{ color: a }}>{head}</span>
      {mid && (
        <span
          className={cn("mx-0.5 inline-block align-middle lowercase", s.mid)}
          style={{ color: midColor }}
        >
          {mid}
        </span>
      )}
      {tail && <span style={{ color: b }}>{tail}</span>}
    </span>
  );
}
