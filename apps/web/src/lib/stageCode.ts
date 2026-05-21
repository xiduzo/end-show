import { create } from "zustand";
import { persist } from "zustand/middleware";

// Crockford-ish alphabet: drop confusing chars (0/O, 1/I/L, U).
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

// Tiny seed profanity blocklist. Substrings, case-sensitive against generated upper.
const PROFANE = ["ASS", "FUK", "FUC", "CUM", "TIT", "GAY", "FAG", "NIG", "SUX", "WTF"];

const CODE_LENGTH = 4;

function isProfane(code: string): boolean {
  for (const word of PROFANE) {
    if (code.includes(word)) return true;
  }
  return false;
}

export function generateStageCode(): string {
  for (let attempt = 0; attempt < 32; attempt += 1) {
    let code = "";
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      const idx = Math.floor(Math.random() * ALPHABET.length);
      code += ALPHABET[idx];
    }
    if (!isProfane(code)) return code;
  }
  throw new Error("Could not generate non-profane stage code after 32 attempts");
}

export function isValidStageCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return !isProfane(code);
}

type StageCodeState = {
  stageCode: string | null;
  setStageCode: (code: string | null) => void;
  generate: () => string;
  clear: () => void;
};

export const useStageCodeStore = create<StageCodeState>()(
  persist(
    (set) => ({
      stageCode: null,
      setStageCode: (code) => set({ stageCode: code }),
      generate: () => {
        const code = generateStageCode();
        set({ stageCode: code });
        return code;
      },
      clear: () => set({ stageCode: null }),
    }),
    { name: "end-show:stage-code" },
  ),
);
