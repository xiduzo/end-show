import type { StageColor } from "@end-show/api/routers/student";

export type StagePaletteEntry = { accent: string; dark: string };

export const STAGE_PALETTE: Record<StageColor, StagePaletteEntry> = {
  slime: { accent: "#d9e73c", dark: "#363a0a" },
  crayon: { accent: "#f2bb06", dark: "#493800" },
  bubblegum: { accent: "#f3b9ff", dark: "#3e064a" },
};

export const STAGE_PALETTE_KEYS = Object.keys(STAGE_PALETTE) as StageColor[];
