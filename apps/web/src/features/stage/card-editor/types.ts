import type { StageColor, Track } from "@end-show/api/routers/student";

export type CardEditorProfile = {
  userId: string;
  displayName: string;
  pronouns: string;
  introduction: string;
  link: string;
  competencies: string[];
  stageColor: StageColor | null;
  track: Track;
  portraitUrl: string | null;
  workMediaUrl: string | null;
  workMediaKind: "work-image" | "work-video" | null;
  name?: string;
  email?: string;
};

export type CardEditorDraft = {
  displayName: string;
  pronouns: string;
  introduction: string;
  link: string;
  competencies: string[];
  stageColor: StageColor | null;
  track: Track;
};

export const ONE_LINER_MAX = 80;
export const COMP_MAX = 5;
export const COMP_TAG_MAX = 18;

export const inputCls =
  "w-full rounded-md border border-lego-dark/20 bg-white px-3 py-2 font-mono text-sm text-lego-dark placeholder:text-lego-dark/30 focus:border-lego focus:outline-none";

export function timeAgo(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ago`;
}
