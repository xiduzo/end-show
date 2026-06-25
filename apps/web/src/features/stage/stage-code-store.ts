import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

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

/** Uppercase and strip anything outside the code alphabet, capped at length.
 *  Used to gate typed input so invalid chars (0/1, lookalikes) never appear. */
export function sanitizeStageCodeInput(raw: string): string {
  return raw
    .toUpperCase()
    .split("")
    .filter((ch) => ALPHABET.includes(ch))
    .join("")
    .slice(0, CODE_LENGTH);
}

export function isValidStageCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return !isProfane(code);
}

type StageCodeHandle = {
  stageCode: string | null;
  /** Tracks this Stage shows. `null` = all tracks (no filter). Only meaningful
   *  when a stageCode is set. */
  tracks: string[] | null;
  setStageCode: (code: string | null) => void;
  setTracks: (tracks: string[] | null) => void;
  generate: () => string;
  clear: () => void;
};

function parseTracks(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return list.length > 0 ? list : null;
}

export function useStageCode(): StageCodeHandle {
  const search = useSearch({ strict: false }) as {
    code?: string;
    tracks?: string;
  };
  const navigate = useNavigate();

  const raw = search.code?.toUpperCase() ?? null;
  const stageCode = raw && isValidStageCode(raw) ? raw : null;
  // A track filter only applies to a coded Stage; ignore it on the default Stage.
  const tracks = stageCode ? parseTracks(search.tracks) : null;

  const setStageCode = useCallback(
    (code: string | null) => {
      navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          code: code ?? undefined,
          // Dropping the code also drops any track filter.
          tracks: code ? prev.tracks : undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const setTracks = useCallback(
    (next: string[] | null) => {
      navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          tracks: next && next.length > 0 ? next.join(",") : undefined,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const generate = useCallback(() => {
    const code = generateStageCode();
    setStageCode(code);
    return code;
  }, [setStageCode]);

  const clear = useCallback(() => setStageCode(null), [setStageCode]);

  return { stageCode, tracks, setStageCode, setTracks, generate, clear };
}
