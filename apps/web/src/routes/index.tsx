import type { StudentSummary } from "@end-show/api/routers/student";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ConnectionIndicator } from "@/components/connection-indicator";
import { HyperText } from "@/components/hyper-text";
import { MorphingName } from "@/components/morphing-name";
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
    <div className="bg-lego-dark relative h-full overflow-hidden text-white">
      <BackgroundDecor />
      <ConnectionIndicator light />

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

      <p className="text-mono absolute right-3 bottom-3 z-30 font-mono text-[10px] tracking-widest text-white/30 uppercase">
        stage · {stageCode ?? "default"}
      </p>

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
    <div className="absolute top-0 right-0 left-0 z-20 h-1 bg-white/5">
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
      className="border-lego/60 bg-lego-dark/80 absolute top-6 right-6 z-20 overflow-hidden rounded-full border shadow-2xl backdrop-blur transition-[width] duration-700 ease-out"
      style={width != null ? { width } : undefined}
    >
      <div
        ref={innerRef}
        className="flex w-max items-center gap-3 py-1.5 pr-5 pl-1.5"
      >
        <Avatar student={student} size={42} />
        <div className="leading-tight">
          <p className="font-mono text-[10px] tracking-widest text-white/50 uppercase">
            Up next
          </p>
          <MorphingName
            text={student.displayName}
            className="font-display text-base font-bold"
          />
        </div>
      </div>
    </div>
  );
}

function CurrentStage({ student }: { student: StudentSummary }) {
  return (
    <div className="relative flex h-full flex-col px-12 pt-16 pb-10">
      <WorkMedia student={student} />
      <ReadabilityScrim />

      <div className="relative z-10 mt-auto grid grid-cols-[auto_1fr_auto] items-end gap-10">
        <Avatar student={student} size={144} withInitials />

        <div className="min-w-0">
          <h1 className="font-display text-h1 flex items-baseline text-white">
            <MorphingName text={student.displayName} />
            <span className="text-slide">.</span>
          </h1>
          <p className="text-body-2 mt-4 max-w-3xl font-mono text-white/80">
            <WordRotate
              className="text-slide"
              word={student.pronouns}
              delay={1000}
            />
            <span className="text-white/40"> — </span>
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
                  className="rounded-full border border-white/25 px-4 py-1 font-mono text-sm text-white/85"
                >
                  {c}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {student.link && <LinkQr url={student.link} />}
      </div>
    </div>
  );
}

function WorkMedia({ student }: { student: StudentSummary }) {
  const { workMediaUrl, workMediaKind, displayName } = student;

  if (workMediaUrl && workMediaKind === "work-video") {
    return (
      <video
        src={workMediaUrl}
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 z-0 h-full w-full object-cover"
      />
    );
  }

  const imgSrc =
    workMediaUrl && workMediaKind === "work-image"
      ? workMediaUrl
      : "https://placehold.net/9-800x600.png";

  return (
    <img
      src={imgSrc}
      alt={`${displayName} work`}
      className="absolute inset-0 z-0 h-full w-full object-cover"
    />
  );
}

function ReadabilityScrim() {
  return (
    <div
      aria-hidden
      className="from-lego-dark/95 via-lego-dark/70 absolute inset-0 z-0 bg-gradient-to-t to-transparent"
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
        className="relative overflow-hidden rounded-full border border-white/15"
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
      className="relative flex items-center justify-center overflow-hidden rounded-full bg-white/95"
      style={{
        width: size,
        height: size,
        backgroundImage:
          "repeating-linear-gradient(135deg, rgba(0,0,0,0.06) 0 1px, transparent 1px 6px)",
      }}
    >
      {withInitials && (
        <span className="text-lego-dark font-mono text-xs tracking-widest">
          {initials}
        </span>
      )}
    </div>
  );
}

function LinkQr({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).host.replace(/^www\./, "");
  } catch {
    /* keep raw */
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="rounded-xl bg-white p-3">
        <QRCodeSVG value={url} size={120} bgColor="#ffffff" fgColor="#000000" />
      </div>
      <p className="font-mono text-[10px] tracking-widest text-white/40 uppercase">
        scan →
      </p>
      <p className="font-display text-sm font-bold text-white">{host}</p>
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
        <p className="mt-3 font-mono text-sm tracking-widest text-white/40 uppercase">
          Master Digital Design · graduation
        </p>
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG
            value={companion}
            size={220}
            bgColor="#ffffff"
            fgColor="#000000"
          />
        </div>
        <p className="font-mono text-[11px] tracking-widest text-white/50 uppercase">
          scan → companion
        </p>
      </div>
      <p className="font-mono text-xs text-white/30">
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
    <div className="bg-lego-dark/80 absolute inset-0 z-40 flex items-center justify-center backdrop-blur">
      <div className="border-lego/40 bg-lego-dark w-96 rounded-2xl border p-6">
        <h2 className="font-display text-lg font-bold">Stage setup</h2>
        <p className="mt-2 font-mono text-sm text-white/60">
          Current:{" "}
          {currentCode ? (
            <code className="text-slide">{currentCode}</code>
          ) : (
            <span className="text-white/40">default channel</span>
          )}
        </p>
        <p className="mt-4 text-sm text-white/80">
          Generate a new code, return to default, or cancel.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/20 px-4 py-1.5 text-sm"
          >
            Cancel
          </button>
          {currentCode && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-full border border-white/20 px-4 py-1.5 text-sm"
            >
              Use default
            </button>
          )}
          <button
            type="button"
            onClick={onGenerate}
            className="bg-slide text-lego-dark rounded-full px-4 py-1.5 text-sm font-bold"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
