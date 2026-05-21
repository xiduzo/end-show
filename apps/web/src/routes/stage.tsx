import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";

import { ConnectionIndicator } from "@/components/connection-indicator";
import { useStageCodeStore } from "@/lib/stageCode";
import { trpc, trpcClient } from "@/utils/trpc";

type StageSnap = {
  stageCode: string | null;
  current: { studentUserId: string; startedAt: number; source: string } | null;
  dwellMs: number;
};

export const Route = createFileRoute("/stage")({
  component: StageRoute,
});

function StageRoute() {
  const stageCode = useStageCodeStore((s) => s.stageCode);
  const generate = useStageCodeStore((s) => s.generate);
  const clear = useStageCodeStore((s) => s.clear);
  const [snap, setSnap] = useState<StageSnap | null>(null);
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

  return (
    <div className="relative flex h-full items-center justify-center bg-black text-white">
      <ConnectionIndicator light />
      <button
        type="button"
        aria-label="Stage setup gesture"
        onClick={onCornerTap}
        className="absolute top-0 left-0 z-10 h-20 w-20 cursor-default opacity-0"
      />

      {!snap?.current ? (
        <Idle stageCode={stageCode} />
      ) : !current ? (
        <p className="opacity-60">Loading…</p>
      ) : (
        <div className="flex max-w-5xl items-center gap-12 px-12">
          {current.portraitUrl && (
            <img
              src={current.portraitUrl}
              alt={current.displayName}
              className="h-72 w-72 rounded-2xl object-cover"
            />
          )}
          <div className="text-left">
            <h1 className="text-7xl font-bold">{current.displayName}</h1>
            <p className="mt-2 text-2xl opacity-70">{current.pronouns}</p>
            <p className="mt-6 max-w-xl text-xl">{current.introduction}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {current.competencies.map((c) => (
                <span key={c} className="rounded-full border px-3 py-1 text-sm">
                  {c}
                </span>
              ))}
            </div>
          </div>
          {current.link && (
            <div className="ml-auto flex flex-col items-center gap-2">
              <div className="rounded-lg bg-white p-2">
                <QRCodeSVG value={current.link} size={120} />
              </div>
              <p className="text-xs opacity-50">Scan for more</p>
            </div>
          )}
        </div>
      )}

      <div className="absolute right-3 bottom-3 text-xs opacity-40">
        stage: {stageCode ?? "default"}
      </div>

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

function Idle({ stageCode }: { stageCode: string | null }) {
  const base = window.location.origin;
  const visitor = `${base}/companion${stageCode ? `?code=${stageCode}` : ""}`;
  const kiosk = `${base}/companion/kiosk${stageCode ? `?code=${stageCode}` : ""}`;
  return (
    <div className="flex flex-col items-center gap-10">
      <div className="text-center">
        <h1 className="text-6xl font-bold tracking-tight">End Show</h1>
        <p className="mt-2 text-lg opacity-50">Master Digital Design · graduation</p>
      </div>
      <div className="grid grid-cols-2 gap-12 text-center">
        <PairCard label="Visitor" url={visitor} hint="Scan with your phone" />
        <PairCard label="Kiosk" url={kiosk} hint="Operator tablet only" />
      </div>
      <p className="mt-2 text-sm opacity-40">tap a student on your phone to bring them on stage</p>
    </div>
  );
}

function PairCard({ label, url, hint }: { label: string; url: string; hint: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm opacity-60">{label}</p>
      <div className="rounded-lg bg-white p-3">
        <QRCodeSVG value={url} size={200} />
      </div>
      <p className="text-xs opacity-40">{hint}</p>
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
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur">
      <div className="w-96 rounded-lg border border-white/20 bg-zinc-900 p-6">
        <h2 className="text-lg font-medium">Stage setup</h2>
        <p className="mt-2 text-sm opacity-70">
          Current: {currentCode ? <code>{currentCode}</code> : "default channel"}
        </p>
        <p className="mt-4 text-sm">
          Generate a new code, return to default, or cancel.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-white/20 px-3 py-1 text-sm"
          >
            Cancel
          </button>
          {currentCode && (
            <button
              type="button"
              onClick={onClear}
              className="rounded border border-white/20 px-3 py-1 text-sm"
            >
              Use default
            </button>
          )}
          <button
            type="button"
            onClick={onGenerate}
            className="rounded bg-white px-3 py-1 text-sm text-black"
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
