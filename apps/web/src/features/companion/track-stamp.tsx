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
  sm: "px-1.5 py-0.5 text-base",
  md: "px-2 py-0.5 text-xl",
  lg: "px-2.5 py-1 text-2xl",
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
  const midColor = "#f3b9ff";
  const label = track.trim() || "—";

  // Three-zone colour accent only: first char (tone a), middle run (pink),
  // last char (tone b). Case and size are shown verbatim so a track reads
  // exactly as it was typed — "DFT" stays "DFT", "IxD" stays "IxD".
  const head = label[0]!;
  const tail = label.length > 1 ? label[label.length - 1]! : "";
  const mid = label.length > 2 ? label.slice(1, -1) : "";

  return (
    <span
      className={cn(
        "inline-flex select-none items-center rounded-sm bg-lego-dark font-display font-black leading-none tracking-tight shadow-sm",
        SIZES[size],
        className,
      )}
      aria-label={`Track ${label}`}
    >
      <span style={{ color: a }}>{head}</span>
      {mid && <span style={{ color: midColor }}>{mid}</span>}
      {tail && <span style={{ color: b }}>{tail}</span>}
    </span>
  );
}
