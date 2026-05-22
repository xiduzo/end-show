import type { StageColor } from "@end-show/api/routers/student";
import { cn } from "@end-show/ui/lib/utils";

import { STAGE_PALETTE, STAGE_PALETTE_KEYS } from "../stage-palette";

export function StageColorPicker({
  value,
  onChange,
}: {
  value: StageColor | null;
  onChange: (next: StageColor) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {STAGE_PALETTE_KEYS.map((key) => {
        const palette = STAGE_PALETTE[key];
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={selected}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-md border transition",
              selected
                ? "border-slide ring-2 ring-slide ring-offset-2 ring-offset-chalkboard"
                : "border-lego-dark/20 hover:border-lego-dark/40",
            )}
          >
            <span
              className="flex h-14 items-end px-2 py-1.5 font-display text-sm font-bold tracking-tight"
              style={{ backgroundColor: palette.accent, color: palette.dark }}
            >
              {key}
            </span>
            <span
              className="h-6"
              style={{ backgroundColor: palette.dark }}
              aria-hidden
            />
            {selected && (
              <span className="absolute top-1 right-1 rounded-full bg-chalkboard/95 px-1.5 font-mono text-[9px] font-bold text-lego-dark">
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
