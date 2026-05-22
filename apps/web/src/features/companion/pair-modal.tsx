import { useRef, useState } from "react";

import { isValidStageCode } from "@/features/stage";
import { cn } from "@end-show/ui/lib/utils";

const CODE_LENGTH = 4;

export function PairModal({
  onPair,
  onSkip,
  onClose,
}: {
  onPair: (code: string) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = isValidStageCode(code);

  return (
    <div
      className="bg-lego/80 fixed inset-0 z-50 flex items-center justify-center p-6 backdrop-blur"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="border-chalkboard/10 w-full max-w-sm rounded-3xl border bg-[#fdfaf2] p-8 text-chalkboard shadow-2xl"
      >
        <p className="text-chalkboard/60 font-mono text-xs font-bold tracking-widest uppercase">
          Pair your phone
        </p>
        <h2 className="font-display mt-1 text-3xl leading-tight font-bold">
          What screen?
        </h2>
        <p className="text-chalkboard/60 mt-3 text-sm">
          type the 4 letters/numbers you see on the big screen.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className="mt-6 flex w-full items-center justify-center gap-3"
        >
          {Array.from({ length: CODE_LENGTH }).map((_, i) => {
            const ch = code[i] ?? "";
            const isCaret = i === code.length;
            return (
              <span
                key={i}
                className={cn(
                  "font-display flex h-16 w-14 items-center justify-center rounded-xl border-2 text-3xl font-bold",
                  ch
                    ? "border-chalkboard text-chalkboard"
                    : isCaret
                      ? "border-slide text-chalkboard/40"
                      : "border-chalkboard/20 text-chalkboard/40",
                )}
              >
                {ch}
              </span>
            );
          })}
        </button>
        <input
          ref={inputRef}
          autoFocus
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={CODE_LENGTH}
          value={code}
          onChange={(e) =>
            setCode(
              e.target.value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, CODE_LENGTH),
            )
          }
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) onPair(code);
          }}
          className="sr-only"
        />

        <button
          type="button"
          disabled={!valid}
          onClick={() => onPair(code)}
          className="bg-slide text-lego-dark font-mono mt-6 w-full rounded-full px-6 py-4 text-sm font-bold tracking-widest lowercase disabled:opacity-40"
        >
          pair →
        </button>

        <hr className="border-chalkboard/10 my-6" />

        <p className="text-chalkboard/60 text-center text-sm">
          or skip — picks will go to the default channel (any unpaired stage).
        </p>
        <button
          type="button"
          onClick={onSkip}
          className="border-chalkboard/20 font-mono mt-3 w-full rounded-full border px-6 py-3 text-sm tracking-widest lowercase"
        >
          skip · use default →
        </button>

        <p className="text-chalkboard/40 mt-8 text-center text-xs">
          we use a signed cookie to rate-limit your picks. no account, no
          tracking beyond tonight.
        </p>
      </div>
    </div>
  );
}
