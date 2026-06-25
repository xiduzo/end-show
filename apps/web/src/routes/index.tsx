import type { StudentSummary } from "@end-show/api/routers/student";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { ConnectionIndicator } from "@/shell";
import { QRCodeSVG } from "qrcode.react";

import {
  BackgroundDecor,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  StageCard,
  UpNextBadge,
  resolveWorkMedia,
} from "@/features/stage";
import {
  isValidStageCode,
  sanitizeStageCodeInput,
  usePrinterBridge,
  useStageCode,
} from "@/features/stage";
import { trpc } from "@/lib/trpc";
import { useStageChannel } from "@/lib/use-stage-channel";
import { useStudentUpdates } from "@/lib/use-student-updates";
import { useTapGesture } from "@/lib/use-tap-gesture";
import { cn } from "@end-show/ui/lib/utils";

const stageSearch = z.object({
  code: z.string().optional(),
  tracks: z.string().optional(),
});

export const Route = createFileRoute("/")({
  validateSearch: stageSearch,
  beforeLoad: ({ search }) => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    if (standalone) {
      throw redirect({ to: "/companion", search });
    }
  },
  component: StageRoute,
});

function StageRoute() {
  const { stageCode, tracks, setStageCode, setTracks, generate, clear } =
    useStageCode();
  const [confirmOpen, setConfirmOpen] = useState(false);
  useStudentUpdates();
  usePrinterBridge(stageCode);
  const students = useQuery(trpc.student.listEligible.queryOptions());

  useTapGesture({
    enabled: !confirmOpen,
    onTrigger: () => setConfirmOpen(true),
  });

  // The Stage owns its track filter, so it passes `tracks` (null = all tracks,
  // which also clears any stale filter on the channel).
  const { stage: snap, queue } = useStageChannel({ stageCode, tracks });

  const current = snap?.current
    ? students.data?.find((s) => s.userId === snap.current!.studentUserId)
    : null;

  const nextId = queue?.next ?? null;
  const next =
    nextId && nextId !== snap?.current?.studentUserId
      ? students.data?.find((s) => s.userId === nextId)
      : null;

  const upcomingIds = useMemo(
    () => (queue?.items ?? []).slice(0, 3).map((i) => i.studentUserId),
    [queue],
  );

  const availableTracks = useMemo(() => {
    const set = new Set<string>();
    for (const s of students.data ?? []) {
      if (s.track) set.add(s.track);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [students.data]);

  const [displayedNext, setDisplayedNext] = useState<StudentSummary | null>(
    null,
  );
  useEffect(() => {
    if (next) setDisplayedNext(next);
    else if (!current) setDisplayedNext(null);
  }, [next, current]);

  // Keep the last student mounted so swaps crossfade inside StageCard rather
  // than remounting (which would briefly expose the page background). Only
  // clear when the backend reports a genuinely idle stage.
  const [shown, setShown] = useState<StudentSummary | null>(null);
  useEffect(() => {
    if (current) setShown(current);
    else if (snap && !snap.current) setShown(null);
  }, [current, snap]);

  return (
    <div className="relative h-full overflow-hidden">
      {shown ? (
        <StageCard student={shown} />
      ) : (
        <div className="bg-lego relative h-full w-full overflow-hidden text-chalkboard">
          <BackgroundDecor />
          <div className="relative z-10 flex h-full flex-col">
            <Idle />
          </div>
        </div>
      )}

      <ConnectionIndicator light />

      {students.data && (
        <AssetPreloader
          students={students.data}
          upcomingUserIds={upcomingIds}
        />
      )}

      {snap && (
        <DwellBar
          startedAt={snap.current?.startedAt ?? null}
          dwellMs={snap.dwellMs}
        />
      )}

      {displayedNext && (
        <UpNextBadge
          student={displayedNext}
          className="absolute top-8 right-8 z-20"
        />
      )}

      {confirmOpen && (
        <ConfirmGenerate
          currentCode={stageCode}
          tracks={tracks}
          availableTracks={availableTracks}
          onSetCode={(code) => setStageCode(code)}
          onSetTracks={(t) => setTracks(t)}
          onCancel={() => setConfirmOpen(false)}
          onGenerate={() => {
            generate();
          }}
          onClear={() => {
            clear();
          }}
        />
      )}
    </div>
  );
}

function DwellBar({
  startedAt,
  dwellMs,
}: {
  startedAt: number | null;
  dwellMs: number;
}) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!startedAt) {
      setPct(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      setPct(Math.min(100, (elapsed / dwellMs) * 100));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [startedAt, dwellMs]);

  return (
    <div className="absolute top-0 right-0 left-0 z-20 h-2 bg-chalkboard/5">
      <div
        className={cn("bg-slide h-full transition-[width]  ease-linear", {
          "duration-150": pct > 2,
        })}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function AssetPreloader({
  students,
  upcomingUserIds,
}: {
  students: StudentSummary[];
  upcomingUserIds: string[];
}) {
  const upcoming = upcomingUserIds
    .map((id) => students.find((s) => s.userId === id))
    .filter((s): s is StudentSummary => s != null);

  useEffect(() => {
    let cancelled = false;
    const warmed = new Set<string>();
    const urls: string[] = [];
    for (const s of students) {
      if (s.portraitUrl) urls.push(s.portraitUrl);
      const m = resolveWorkMedia(s);
      if (m.kind !== "none") urls.push(m.url);
    }

    async function warm() {
      for (const url of urls) {
        if (cancelled) return;
        if (warmed.has(url)) continue;
        warmed.add(url);
        try {
          await fetch(url, { mode: "cors", cache: "force-cache" });
        } catch {
          // swallow — SW will retry on first real use
        }
      }
    }

    const idle = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void) => number;
      }
    ).requestIdleCallback;
    const handle = idle ? idle(warm) : window.setTimeout(warm, 1500);

    return () => {
      cancelled = true;
      const cancelIdle = (
        window as unknown as {
          cancelIdleCallback?: (h: number) => void;
        }
      ).cancelIdleCallback;
      if (idle && cancelIdle) cancelIdle(handle as number);
      else window.clearTimeout(handle as number);
    };
  }, [students]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed -z-50 h-0 w-0 overflow-hidden opacity-0"
    >
      {students.map((s) =>
        s.portraitUrl ? (
          <img
            key={`portrait-${s.userId}`}
            src={s.portraitUrl}
            alt=""
            crossOrigin="anonymous"
            loading="eager"
            decoding="async"
          />
        ) : null,
      )}
      {upcoming.map((s) => {
        const m = resolveWorkMedia(s);
        if (m.kind === "video") {
          return (
            <video
              key={`upcoming-video-${s.userId}`}
              src={m.url}
              muted
              playsInline
              preload="auto"
              crossOrigin="anonymous"
            />
          );
        }
        if (m.kind === "image") {
          return (
            <img
              key={`upcoming-image-${s.userId}`}
              src={m.url}
              alt=""
              crossOrigin="anonymous"
              loading="eager"
              decoding="async"
            />
          );
        }
        return null;
      })}
    </div>
  );
}

function Idle() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-12 px-12">
      <div className="text-center">
        <h1 className="font-display text-h1 leading-none">
          Master Digital Design
        </h1>
      </div>
    </div>
  );
}

function ConfirmGenerate({
  currentCode,
  tracks,
  availableTracks,
  onSetCode,
  onSetTracks,
  onCancel,
  onGenerate,
  onClear,
}: {
  currentCode: string | null;
  tracks: string[] | null;
  availableTracks: string[];
  onSetCode: (code: string) => void;
  onSetTracks: (tracks: string[] | null) => void;
  onCancel: () => void;
  onGenerate: () => void;
  onClear: () => void;
}) {
  const base = window.location.origin;
  const params = new URLSearchParams();
  if (currentCode) params.set("code", currentCode);
  if (currentCode && tracks && tracks.length > 0)
    params.set("tracks", tracks.join(","));
  const qs = params.toString();
  const pairUrl = `${base}/companion${qs ? `?${qs}` : ""}`;

  // Editable draft, typed straight into the big slots (like the companion
  // pair modal). Applied to the live code via Enter / "Use this".
  const [draft, setDraft] = useState((currentCode ?? "").slice(0, 4));
  const inputRef = useRef<HTMLInputElement>(null);
  // Re-sync when the live code changes out from under us (e.g. Generate).
  useEffect(() => setDraft((currentCode ?? "").slice(0, 4)), [currentCode]);

  const draftValid = isValidStageCode(draft);
  const canApply = draftValid && draft !== currentCode;
  const applyDraft = () => {
    if (canApply) onSetCode(draft);
  };

  const toggleTrack = (t: string) => {
    // `null` means "all tracks", so seed from the full list — tapping a chip
    // that's currently on then removes just that one (true multi-select),
    // instead of isolating it. Collapse back to null once everything is on.
    const set = new Set(tracks ?? availableTracks);
    if (set.has(t)) set.delete(t);
    else set.add(t);
    onSetTracks(set.size === availableTracks.length ? null : Array.from(set));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-auto bg-chalkboard text-black">
      <button
        type="button"
        onClick={onCancel}
        className="absolute top-8 right-8 z-10 rounded-full border px-4 py-1.5 font-mono text-xs tracking-widest uppercase backdrop-blur"
      >
        Close
      </button>

      <input
        ref={inputRef}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        maxLength={4}
        value={draft}
        onChange={(e) => setDraft(sanitizeStageCodeInput(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") applyDraft();
        }}
        className="sr-only"
      />

      <div className="flex flex-1 flex-col items-center justify-center px-12 py-16">
        <p className="font-mono text-sm tracking-[0.25em] uppercase">
          pair a companion to this stage
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.focus()}
          className="mt-8 flex items-center gap-4 sm:gap-6"
          style={{ fontSize: "clamp(6rem, 18vw, 20rem)" }}
        >
          {Array.from({ length: 4 }).map((_, i) => {
            const ch = draft[i] ?? "";
            const isCaret = i === draft.length;
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
        </button>

        <p className="mt-6 font-mono text-xs tracking-widest text-black/50 uppercase">
          {canApply
            ? "press enter to use this code"
            : "tap the code to type your own"}
        </p>

        <div className="mt-10 flex items-center gap-10">
          <div className="qr-tinted rounded-2xl bg-chalkboard p-4">
            <QRCodeSVG
              value={pairUrl}
              size={254}
              bgColor="#F8F9FA"
              fgColor="#1a1a1a"
            />
          </div>
        </div>

        {currentCode && (
          <div className="mt-10 w-full max-w-md">
            <p className="text-center font-mono text-xs tracking-[0.25em] text-black/50 uppercase">
              tracks shown on this stage
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {availableTracks.length === 0 && (
                <span className="font-mono text-xs text-black/40">
                  no tracks yet
                </span>
              )}
              {availableTracks.map((t) => {
                const on = !tracks || tracks.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTrack(t)}
                    className={cn(
                      "rounded-full border px-4 py-1.5 font-mono text-sm tracking-widest uppercase transition",
                      on
                        ? "border-black bg-black text-chalkboard"
                        : "border-black/20 bg-white text-black/50 hover:text-black",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-center font-mono text-[11px] text-black/40">
              {tracks && tracks.length > 0
                ? "only selected tracks rotate & can send"
                : "all tracks shown — tap to limit"}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center justify-center gap-3 pb-12">
        {canApply && (
          <button
            type="button"
            onClick={applyDraft}
            className="rounded-full border border-black px-6 py-2 font-mono text-sm font-bold backdrop-blur hover:bg-white"
          >
            Use {draft}
          </button>
        )}
        {currentCode && (
          <button
            type="button"
            onClick={() => {
              onClear();
              onCancel();
            }}
            className="rounded-full border px-5 py-2 font-mono text-sm backdrop-blur hover:bg-white"
          >
            Use default
          </button>
        )}
        <button
          type="button"
          onClick={onGenerate}
          className="bg-slide text-lego-dark rounded-full px-6 py-2 font-mono text-sm font-bold hover:brightness-105"
        >
          Generate new code
        </button>
      </div>
    </div>
  );
}
