import { useEffect, useRef, useState } from "react";

import { isValidStageCode, sanitizeStageCodeInput } from "@/features/stage";
import { cn } from "@end-show/ui/lib/utils";

const CODE_LENGTH = 4;

export function PairModal({
  initialCode,
  onPair,
  onSkip,
  onClose,
}: {
  initialCode?: string | null;
  onPair: (code: string) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(
    (initialCode ?? "").toUpperCase().slice(0, CODE_LENGTH),
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = isValidStageCode(code);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-chalkboard text-black">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-8 right-8 z-10 rounded-full border px-4 py-1.5 font-mono text-xs tracking-widest uppercase backdrop-blur"
      >
        Close
      </button>

      <button
        type="button"
        onClick={() => inputRef.current?.focus()}
        className="flex flex-1 flex-col items-center justify-center px-12"
      >
        <p className="font-mono text-sm tracking-[0.25em] uppercase -mt-24">
          pair this companion to a stage
        </p>

        <div
          className="mt-8 flex items-center gap-4 sm:gap-6"
          style={{ fontSize: "clamp(5rem, 18vw, 20rem)" }}
        >
          {Array.from({ length: CODE_LENGTH }).map((_, i) => {
            const ch = code[i] ?? "";
            const isCaret = i === code.length;
            return (
              <span
                key={i}
                className={cn(
                  "font-display flex items-center justify-center leading-none tracking-tight",
                  ch
                    ? "text-black"
                    : isCaret
                      ? "text-slide animate-pulse"
                      : "text-black/15",
                )}
                style={{ width: "0.7em", height: "1em" }}
              >
                {ch || "•"}
              </span>
            );
          })}
        </div>

        <p className="mt-12 font-mono text-xs tracking-widest uppercase text-black/50">
          type the 4-character code on the stage
        </p>
      </button>

      <input
        ref={inputRef}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={CODE_LENGTH}
        value={code}
        onChange={(e) => setCode(sanitizeStageCodeInput(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valid) onPair(code);
        }}
        className="sr-only"
      />

      <div className="flex flex-col items-center justify-center gap-3 pb-12">
        <button
          type="button"
          onClick={onSkip}
          className="rounded-full border px-5 py-2 font-mono text-sm backdrop-blur hover:bg-white"
        >
          Use default
        </button>
        <button
          type="button"
          disabled={!valid}
          onClick={() => onPair(code)}
          className="bg-slide text-lego-dark rounded-full px-6 py-2 font-mono text-sm font-bold hover:brightness-105 disabled:opacity-40"
        >
          Pair →
        </button>
      </div>
    </div>
  );
}
