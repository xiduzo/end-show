import type { StudentSummary } from "@end-show/api/routers/student";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ConnectionIndicator } from "@/components/connection-indicator";
import { HyperText } from "@/components/hyper-text";
import { MorphingName } from "@/components/morphing-name";
import { StageShaderBackdrop } from "@/components/stage-shader-backdrop";
import { WordRotate } from "@/components/word-rotate";
import { useStageCodeStore } from "@/lib/stageCode";
import { trpc, trpcClient } from "@/utils/trpc";

type StageSnap = {
  stageCode: string | null;
  current: { studentUserId: string; startedAt: number; source: string } | null;
  dwellMs: number;
};

type QueueSnap = {
  stageCode: string | null;
  kiosk: string[];
  mobile: string[];
  next: string | null;
};

export const Route = createFileRoute("/")({
  component: StageRoute,
});

function StageRoute() {
  const stageCode = useStageCodeStore((s) => s.stageCode);
  const generate = useStageCodeStore((s) => s.generate);
  const clear = useStageCodeStore((s) => s.clear);
  const [snap, setSnap] = useState<StageSnap | null>(null);
  const [queue, setQueue] = useState<QueueSnap | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const tapsRef = useRef<number[]>([]);
  const students = useQuery(trpc.student.listEligible.queryOptions());

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

  function onCornerTap() {
    const now = Date.now();
    tapsRef.current = [...tapsRef.current.filter((t) => now - t < 2000), now];
    if (tapsRef.current.length >= 5) {
      tapsRef.current = [];
      setConfirmOpen(true);
    }
  }

  const current = snap?.current
    ? students.data?.find((s) => s.userId === snap.current!.studentUserId)
    : null;

  const nextId = queue?.next ?? null;
  const next =
    nextId && nextId !== snap?.current?.studentUserId
      ? students.data?.find((s) => s.userId === nextId)
      : null;

  return (
    <div className="bg-lego relative h-full overflow-hidden text-chalkboard">
      <BackgroundDecor />
      <ConnectionIndicator light />

      {students.data && (
        <AssetPreloader students={students.data} nextUserId={nextId} />
      )}

      <button
        type="button"
        aria-label="Stage setup gesture"
        onClick={onCornerTap}
        className="absolute top-0 left-0 z-30 h-20 w-20 cursor-default opacity-0"
      />

      {snap && (
        <DwellBar
          startedAt={snap.current?.startedAt ?? null}
          dwellMs={snap.dwellMs}
        />
      )}

      {next && <UpNextBadge student={next} />}

      <div className="relative z-10 flex h-full flex-col">
        {!current ? (
          <Idle stageCode={stageCode} />
        ) : (
          <CurrentStage student={current} />
        )}
      </div>

      {/*<p className="text-mono absolute right-3 bottom-3 z-30 font-mono text-[10px] tracking-widest text-chalkboard/30 uppercase">
        stage · {stageCode ?? "default"}
      </p>*/}

      {confirmOpen && (
        <ConfirmGenerate
          currentCode={stageCode}
          onCancel={() => setConfirmOpen(false)}
          onGenerate={() => {
            generate();
            setConfirmOpen(false);
          }}
          onClear={() => {
            clear();
            setConfirmOpen(false);
          }}
        />
      )}
    </div>
  );
}

function BackgroundDecor() {
  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, rgba(255,255,255,0.6) 0 1px, transparent 1px 14px)",
        }}
      />
      <div
        aria-hidden
        className="bg-slide/25 absolute -top-1/3 -left-1/4 h-[80vh] w-[80vh] rounded-full blur-[180px]"
      />
      <div
        aria-hidden
        className="bg-lego/40 absolute -right-1/4 -bottom-1/3 h-[70vh] w-[70vh] rounded-full blur-[180px]"
      />
    </>
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
    <div className="absolute top-0 right-0 left-0 z-20 h-1 bg-chalkboard/5">
      <div
        className="bg-slide h-full transition-[width] duration-150 ease-linear"
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
        backgroundColor: scrim.dark,
        boxShadow: `0 25px 50px -12px ${scrim.dark}80`,
      }}
    >
      <div
        ref={innerRef}
        className="flex w-max items-center gap-3 py-1.5 pr-5 pl-1.5"
      >
        <Avatar student={student} size={42} />
        <div className="leading-tight">
          <p className="font-mono text-[10px] tracking-widest text-chalkboard/50 uppercase">
            Up next
          </p>
          <MorphingName
            text={student.displayName}
            className="font-display text-chalkboard font-bold"
          />
        </div>
      </div>
    </div>
  );
}

const STAGE_SCRIM: Record<string, { dark: string; accent: string }> = {
  slime: { dark: "#363a0a", accent: "#d9e73c" },
  crayon: { dark: "#493b00", accent: "#f2bb06" },
  bubblegum: { dark: "#3e064a", accent: "#f3b9ff" },
};
const STAGE_SCRIM_KEYS = Object.keys(STAGE_SCRIM);

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function resolveScrim(student: StudentSummary): {
  dark: string;
  accent: string;
} {
  const key =
    student.stageColor ??
    STAGE_SCRIM_KEYS[hashStr(student.userId) % STAGE_SCRIM_KEYS.length]!;
  return STAGE_SCRIM[key]!;
}

function CurrentStage({ student }: { student: StudentSummary }) {
  const scrim = resolveScrim(student);

  return (
    <div className="relative flex h-full flex-col px-8 py-8">
      <WorkMedia student={student} />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[55%] transition-[background-color] duration-700 ease-out"
        style={{
          backgroundColor: scrim.dark,
          maskImage:
            "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.75) 40%, rgba(0,0,0,0) 100%)",
          WebkitMaskImage:
            "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.75) 40%, rgba(0,0,0,0) 100%)",
        }}
      />
      <div
        className="relative z-10 mt-auto grid grid-cols-[auto_1fr_auto] items-end gap-10"
        style={{ textShadow: "0 1px 12px rgba(0,0,0,0.45)" }}
      >
        <Avatar student={student} size={144} withInitials />

        <div className="min-w-0">
          <h1 className="font-display text-h1 flex items-baseline text-chalkboard">
            <MorphingName text={student.displayName} />
          </h1>
          <p className="text-body-2 mt-4 max-w-3xl font-mono text-chalkboard/80">
            <WordRotate
              className="text-chalkboard"
              word={student.pronouns}
              delay={1000}
            />
            <span className="text-chalkboard/40"> — </span>
            <HyperText duration={400} delay={1200}>
              {student.introduction}
            </HyperText>
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {student.competencies.map((c, i) => (
                <motion.span
                  key={`${student.userId}-${c}`}
                  layoutId={c}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    y: 20,
                    transition: { duration: 0.35, delay: 1, ease: "easeIn" },
                  }}
                  transition={{
                    duration: 0.35,
                    delay: 1.6 + i * 0.12,
                    ease: "easeOut",
                  }}
                  className="rounded-full border border-chalkboard/25 font-extrabold px-4 py-1 font-mono text-sm text-chalkboard/85"
                >
                  {c}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {student.link && <LinkQr url={student.link} scrim={scrim} />}
      </div>
    </div>
  );
}

const FALLBACK_VIDEOS = [
  "https://www.pexels.com/download/video/5384977/",
  "https://www.pexels.com/download/video/7807288/",
  "https://www.pexels.com/download/video/20463055/",
  "https://www.pexels.com/download/video/9903008/",
  "https://www.pexels.com/download/video/9618370/",
  "https://www.pexels.com/download/video/7610989/",
  "https://www.pexels.com/download/video/4622464/",
  "https://www.pexels.com/download/video/7762408/",
  "https://www.pexels.com/download/video/6608009/",
  "https://www.pexels.com/download/video/4125748/",
] as const;

function pickFallbackVideo(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % FALLBACK_VIDEOS.length;
  return FALLBACK_VIDEOS[index]!;
}

type ResolvedWorkMedia =
  | { kind: "video"; url: string }
  | { kind: "image"; url: string };

function resolveWorkMedia(student: StudentSummary): ResolvedWorkMedia {
  if (student.workMediaUrl && student.workMediaKind === "work-video") {
    return { kind: "video", url: student.workMediaUrl };
  }
  if (student.workMediaUrl && student.workMediaKind === "work-image") {
    return { kind: "image", url: student.workMediaUrl };
  }
  return { kind: "video", url: pickFallbackVideo(student.userId) };
}

function AssetPreloader({
  students,
  nextUserId,
}: {
  students: StudentSummary[];
  nextUserId: string | null;
}) {
  const nextStudent = nextUserId
    ? students.find((s) => s.userId === nextUserId)
    : null;
  const nextMedia = nextStudent ? resolveWorkMedia(nextStudent) : null;

  useEffect(() => {
    let cancelled = false;
    const warmed = new Set<string>();
    const urls: string[] = [];
    for (const s of students) {
      if (s.portraitUrl) urls.push(s.portraitUrl);
      const m = resolveWorkMedia(s);
      urls.push(m.url);
    }

    async function warm() {
      for (const url of urls) {
        if (cancelled) return;
        if (warmed.has(url)) continue;
        warmed.add(url);
        try {
          await fetch(url, { mode: "no-cors", cache: "force-cache" });
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
    const handle = idle
      ? idle(warm)
      : window.setTimeout(warm, 1500);

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
      {nextStudent && nextMedia ? (
        nextMedia.kind === "video" ? (
          <video
            key={`next-video-${nextStudent.userId}`}
            src={nextMedia.url}
            muted
            playsInline
            preload="auto"
          />
        ) : (
          <img
            key={`next-image-${nextStudent.userId}`}
            src={nextMedia.url}
            alt=""
            loading="eager"
            decoding="async"
          />
        )
      ) : null}
    </div>
  );
}

function WorkMedia({ student }: { student: StudentSummary }) {
  const { displayName } = student;
  const media = resolveWorkMedia(student);

  if (media.kind === "image") {
    return (
      <img
        src={media.url}
        alt={`${displayName} work`}
        className="absolute inset-0 z-0 h-full w-full object-cover"
      />
    );
  }

  return (
    <video
      src={media.url}
      autoPlay
      muted
      loop
      playsInline
      className="absolute inset-0 z-0 h-full w-full object-cover"
    />
  );
}

function Avatar({
  student,
  size,
  withInitials,
}: {
  student: StudentSummary;
  size: number;
  withInitials?: boolean;
}) {
  const initials = student.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

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
      className="relative flex items-center justify-center overflow-hidden rounded-full bg-chalkboard/95"
      style={{
        width: size,
        height: size,
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 6px)",
      }}
    >
      {withInitials && (
        <span className="text-lego font-mono text-xs tracking-widest">
          {initials}
        </span>
      )}
    </div>
  );
}

function LinkQr({
  url,
  scrim,
}: {
  url: string;
  scrim: { dark: string; accent: string };
}) {
  let host = url;
  try {
    host = new URL(url).host.replace(/^www\./, "");
  } catch {
    /* keep raw */
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <p className="font-mono text-[10px] pr-1 tracking-widest text-chalkboard/80 uppercase">
        scan me
      </p>
      <div className="qr-tinted rounded-xl bg-chalkboard p-3">
        <QRCodeSVG
          value={url}
          size={126}
          bgColor="#F8F9FA"
          fgColor={scrim.dark}
        />
      </div>
    </div>
  );
}

function Idle({ stageCode }: { stageCode: string | null }) {
  const base = window.location.origin;
  const companion = `${base}/companion${stageCode ? `?code=${stageCode}` : ""}`;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-12 px-12">
      <div className="text-center">
        <h1 className="font-display text-h1 leading-none">
          End Show<span className="text-slide">.</span>
        </h1>
        <p className="mt-3 font-mono text-sm tracking-widest text-chalkboard/40 uppercase">
          Master Digital Design · graduation
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl bg-chalkboard p-3">
          <QRCodeSVG
            value={companion}
            size={220}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>
        <p className="font-mono text-[11px] tracking-widest text-chalkboard/50 uppercase">
          scan → companion
        </p>
      </div>
      <p className="font-mono text-xs text-chalkboard/30">
        Tap a student on your phone to bring them on stage.
      </p>
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
  return (
    <div className="bg-lego/80 absolute inset-0 z-40 flex items-center justify-center backdrop-blur">
      <div className="border-lego/40 bg-lego w-96 rounded-2xl border p-6">
        <h2 className="font-display text-lg font-bold">Stage setup</h2>
        <p className="mt-2 font-mono text-sm text-chalkboard/60">
          Current:{" "}
          {currentCode ? (
            <code className="text-slide">{currentCode}</code>
          ) : (
            <span className="text-chalkboard/40">default channel</span>
          )}
        </p>
        <p className="mt-4 text-sm text-chalkboard/80">
          Generate a new code, return to default, or cancel.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-chalkboard/20 px-4 py-1.5 text-sm"
          >
            Cancel
          </button>
          {currentCode && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full border border-chalkboard/20 px-4 py-1.5 text-sm"
            >
              Use default
            </button>
          )}
          <button
            type="button"
            onClick={onGenerate}
            className="bg-slide text-lego rounded-full px-4 py-1.5 text-sm font-bold"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
