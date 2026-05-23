import type { StudentSummary } from "@end-show/api/routers/student";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { ConnectionIndicator } from "@/shell";
import { MorphingName } from "@/features/text-effects";
import { QRCodeSVG } from "qrcode.react";

import {
  BackgroundDecor,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  StageCard,
  resolveScrim,
  resolveWorkMedia,
} from "@/features/stage";
import { useStageCode } from "@/features/stage";
import { trpc, trpcClient } from "@/lib/trpc";
import { useStudentUpdates } from "@/lib/use-student-updates";
import { useTapGesture } from "@/lib/use-tap-gesture";
import { cn } from "@end-show/ui/lib/utils";

type StageSnap = {
  stageCode: string | null;
  current: { studentUserId: string; startedAt: number; source: string } | null;
  dwellMs: number;
};

type QueueSnap = {
  stageCode: string | null;
  items: Array<{
    studentUserId: string;
    source: "kiosk" | "mobile" | "rotation" | "resume";
  }>;
  next: string | null;
};

const stageSearch = z.object({ code: z.string().optional() });

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
  const { stageCode, generate, clear } = useStageCode();
  const [snap, setSnap] = useState<StageSnap | null>(null);
  const [queue, setQueue] = useState<QueueSnap | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  useStudentUpdates();
  const students = useQuery(trpc.student.listEligible.queryOptions());

  useTapGesture({
    enabled: !confirmOpen,
    onTrigger: () => setConfirmOpen(true),
  });

  useEffect(() => {
    const sub = trpcClient.stage.current.subscribe(
      { stageCode },
      {
        onData: (data) => setSnap(data as StageSnap),
        onError: (err) => console.error("stage.current error", err),
      },
    );
    return () => sub.unsubscribe();
  }, [stageCode]);

  useEffect(() => {
    const sub = trpcClient.queue.watch.subscribe(
      { stageCode },
      {
        onData: (data) => setQueue(data as QueueSnap),
        onError: (err) => console.error("queue.watch error", err),
      },
    );
    return () => sub.unsubscribe();
  }, [stageCode]);

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

  const [displayedNext, setDisplayedNext] = useState<StudentSummary | null>(
    null,
  );
  useEffect(() => {
    if (next) setDisplayedNext(next);
    else if (!current) setDisplayedNext(null);
  }, [next, current]);

  return (
    <div className="relative h-full overflow-hidden">
      {current ? (
        <StageCard
          key={`${current.userId}:${snap?.current?.startedAt ?? 0}`}
          student={current}
        />
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

      {displayedNext && <UpNextBadge student={displayedNext} />}

      {confirmOpen && (
        <ConfirmGenerate
          currentCode={stageCode}
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

function UpNextBadge({ student }: { student: StudentSummary }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const scrim = resolveScrim(student);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const update = () => setWidth(el.offsetWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className="absolute top-8 right-8 z-20 overflow-hidden rounded-full backdrop-blur transition-[width,background-color,box-shadow] duration-700 ease-out"
      style={{
        ...(width != null ? { width } : {}),
        backgroundColor: scrim.accent,
        boxShadow: `0 25px 50px -12px ${scrim.accent}20`,
      }}
    >
      <div
        ref={innerRef}
        className="flex w-max items-center gap-3 py-1.5 pr-6 pl-1.5"
      >
        <UpNextAvatar student={student} size={42} />
        <div
          className="leading-tight transition-colors duration-700"
          style={{ color: scrim.dark }}
        >
          <p className="font-mono text-xs tracking-widest uppercase">Up next</p>
          <MorphingName
            text={student.displayName}
            compact
            className={cn("font-display font-bold")}
          />
        </div>
      </div>
    </div>
  );
}

function UpNextAvatar({
  student,
  size,
}: {
  student: StudentSummary;
  size: number;
}) {
  if (student.portraitUrl) {
    return (
      <div
        className="relative overflow-hidden rounded-full border border-chalkboard/15"
        style={{ width: size, height: size }}
      >
        <img
          src={student.portraitUrl}
          alt={student.displayName}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }
  return (
    <div
      className="relative overflow-hidden rounded-full bg-chalkboard/95"
      style={{ width: size, height: size }}
    />
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
  onCancel,
  onGenerate,
  onClear,
}: {
  currentCode: string | null;
  onCancel: () => void;
  onGenerate: () => void;
  onClear: () => void;
}) {
  const base = window.location.origin;
  const pairUrl = `${base}/companion${currentCode ? `?code=${currentCode}` : ""}`;
  const slots = Array.from({ length: 4 }, (_, i) => currentCode?.[i] ?? null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-chalkboard text-black">
      <button
        type="button"
        onClick={onCancel}
        className="absolute top-8 right-8 z-10 rounded-full border px-4 py-1.5 font-mono text-xs tracking-widest uppercase backdrop-blur"
      >
        Close
      </button>

      <div className="flex flex-1 flex-col items-center justify-center px-12">
        <p className="font-mono text-sm tracking-[0.25em] uppercase">
          pair a companion to this stage
        </p>

        <div
          className="mt-8 flex items-center gap-4 sm:gap-6"
          style={{ fontSize: "clamp(8rem, 22vw, 24rem)" }}
        >
          {slots.map((ch, i) => (
            <span
              key={i}
              className={cn(
                "font-display flex items-center justify-center leading-none tracking-tight",
                ch ? "text-black" : "text-slide animate-pulse",
              )}
              style={{ width: "0.7em", height: "1em" }}
            >
              {ch ?? "•"}
            </span>
          ))}
        </div>

        <div className="mt-12 flex items-center gap-10">
          <div className="qr-tinted rounded-2xl bg-chalkboard p-4">
            <QRCodeSVG
              value={pairUrl}
              size={254}
              bgColor="#F8F9FA"
              fgColor="#1a1a1a"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center gap-3 pb-12">
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
