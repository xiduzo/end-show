export const DEFAULT_ACCENT = { accent: "#ff5b23", dark: "#381404" };

export const STICKER_TONES = [
  { bg: "bg-slime", fg: "text-slime-dark" },
  { bg: "bg-crayon", fg: "text-crayon-dark" },
  { bg: "bg-bubblegum", fg: "text-bubblegum-dark" },
  { bg: "bg-slide", fg: "text-chalkboard" },
];

export const PORTRAIT_TONES = [
  ["#ff5b23", "#481b07"],
  ["#d9e73c", "#363a0a"],
  ["#f2bb06", "#493800"],
  ["#f3b9ff", "#3e064a"],
  ["#3a39ff", "#06063c"],
  ["#7be0a8", "#0b3a23"],
  ["#7ec8ff", "#0d2a4a"],
];

export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Stable pseudo-random in [-1, 1] from (seed, salt). Lets each student have
// reproducible "wonk" — tilt, jitter, sticker offset — that doesn't change
// between renders.
export function rand(seed: number, salt: number): number {
  const x = Math.sin(seed * 9301 + salt * 49297) * 233280;
  return (x - Math.floor(x)) * 2 - 1;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
