import { useState } from "react";

import { isValidStageCode } from "@/features/stage";
import type { CompanionTier } from "./types";

export function StageCodeChip({
  tier,
  stageCode,
  onSetCode,
}: {
  tier: CompanionTier;
  stageCode: string | null;
  onSetCode: (code: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [entry, setEntry] = useState("");

  return (
    <div className="absolute top-3 left-3 z-30 flex flex-wrap items-center gap-2 sm:top-4 sm:left-4">
      <button
        type="button"
        onClick={() => setEditing((v) => !v)}
        className="bg-slide text-lego-dark inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[10px] font-bold tracking-widest uppercase shadow-md"
      >
        <span>{tier}</span>
        <span className="text-lego-dark/60">·</span>
        <span>{stageCode ?? "default"}</span>
      </button>

      {editing && (
        <div className="flex items-center gap-2">
          <input
            value={entry}
            onChange={(e) => setEntry(e.target.value.toUpperCase().slice(0, 4))}
            placeholder={stageCode ?? "XKZP"}
            className="w-24 rounded-full border border-chalkboard/20 bg-white/40 px-3 py-1 font-mono text-sm tracking-widest backdrop-blur"
          />
          <button
            type="button"
            disabled={!isValidStageCode(entry)}
            onClick={() => {
              onSetCode(entry);
              setEntry("");
              setEditing(false);
            }}
            className="rounded-full border border-chalkboard/20 bg-white/40 px-3 py-1 font-mono text-[10px] tracking-widest uppercase backdrop-blur disabled:opacity-40"
          >
            pair
          </button>
          {stageCode && (
            <button
              type="button"
              onClick={() => {
                onSetCode(null);
                setEditing(false);
              }}
              className="rounded-full border border-chalkboard/20 bg-white/40 px-3 py-1 font-mono text-[10px] tracking-widest uppercase backdrop-blur"
            >
              reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
