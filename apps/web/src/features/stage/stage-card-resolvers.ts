import type { StudentSummary } from "@end-show/api/routers/student";

import { STAGE_PALETTE, STAGE_PALETTE_KEYS } from "./stage-palette";

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function resolveScrim(student: StudentSummary): {
  dark: string;
  accent: string;
} {
  const key =
    student.stageColor ??
    STAGE_PALETTE_KEYS[hashStr(student.userId) % STAGE_PALETTE_KEYS.length]!;
  return STAGE_PALETTE[key];
}

export type ResolvedWorkMedia =
  | { kind: "video"; url: string }
  | { kind: "image"; url: string }
  | { kind: "none" };

export function resolveWorkMedia(student: StudentSummary): ResolvedWorkMedia {
  if (student.workMediaUrl && student.workMediaKind === "work-video") {
    return { kind: "video", url: student.workMediaUrl };
  }
  if (student.workMediaUrl && student.workMediaKind === "work-image") {
    return { kind: "image", url: student.workMediaUrl };
  }
  return { kind: "none" };
}
