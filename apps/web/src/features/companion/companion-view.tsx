import type { StudentSummary } from "@end-show/api/routers/student";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConnectionIndicator } from "@/shell";
import {
  isValidStageCode,
  useStageCodeStore,
} from "@/features/stage";
import { trpc, trpcClient } from "@/lib/trpc";
import { useTapGesture } from "@/lib/use-tap-gesture";

import { EmptyState } from "./empty-state";
import { FindMeChip } from "./find-me-chip";
import { PairModal } from "./pair-modal";
import { SentFlash } from "./sent-flash";
import { ShaderBg } from "./shader-bg";
import { SENT_FLASH_MS, SHOWCASE_TIMEOUT_MS } from "./timings";
import type { CompanionTier, QueueSnap, StageSnap } from "./types";
import { useUserActivity } from "./use-user-activity";
import { WallLane } from "./wall-lane";
import { WallShowcase } from "./wall-showcase";

export function CompanionView({
  tier,
  urlCode,
}: {
  tier: CompanionTier;
  urlCode: string | null;
}) {
  const stageCode = useStageCodeStore((s) => s.stageCode);
  const setStageCode = useStageCodeStore((s) => s.setStageCode);
  const clearStageCode = useStageCodeStore((s) => s.clear);
  const students = useQuery(trpc.student.listEligible.queryOptions());
  const push = useMutation(trpc.queue.push.mutationOptions());
  const [queue, setQueue] = useState<QueueSnap | null>(null);
  const [stage, setStage] = useState<StageSnap | null>(null);
  const [showcasedId, setShowcasedId] = useState<string | null>(null);
  const [sourceRects, setSourceRects] = useState<{
    card: DOMRect;
    image: DOMRect;
  } | null>(null);
  const [sentStudent, setSentStudent] = useState<StudentSummary | null>(null);
  const [search, setSearch] = useState("");
  const [selectedComps, setSelectedComps] = useState<string[]>([]);
  const [pairOpen, setPairOpen] = useState(false);

  useTapGesture({
    enabled: !pairOpen,
    onTrigger: () => setPairOpen(true),
  });

  useEffect(() => {
    if (urlCode && isValidStageCode(urlCode) && urlCode !== stageCode) {
      setStageCode(urlCode);
    }
  }, [urlCode, stageCode, setStageCode]);

  useEffect(() => {
    const sub = trpcClient.queue.watch.subscribe(
      { stageCode },
      {
        onData: (d) => setQueue(d as QueueSnap),
        onError: (e) => console.error("queue.watch error", e),
      },
    );
    return () => sub.unsubscribe();
  }, [stageCode]);

  useEffect(() => {
    const sub = trpcClient.stage.current.subscribe(
      { stageCode },
      {
        onData: (d) => setStage(d as StageSnap),
        onError: (e) => console.error("stage.current error", e),
      },
    );
    return () => sub.unsubscribe();
  }, [stageCode]);

  const list = students.data ?? [];
  const onStageId = stage?.current?.studentUserId ?? null;
  const showcased = showcasedId
    ? (list.find((s) => s.userId === showcasedId) ?? null)
    : null;

  const allCompetencies = useMemo(
    () => Array.from(new Set(list.flatMap((s) => s.competencies))).sort(),
    [list],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((s) => {
      const text = [s.displayName, s.introduction, s.pronouns]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const textOk = !q || text.includes(q);
      const compOk =
        selectedComps.length === 0 ||
        s.competencies.some((c) => selectedComps.includes(c));
      return textOk && compOk;
    });
  }, [list, search, selectedComps]);

  const isFiltering = search.length > 0 || selectedComps.length > 0;

  const fullQueue = useMemo(
    () => (queue?.items ?? []).map((i) => i.studentUserId),
    [queue],
  );
  const inFlight = useMemo(() => new Set(fullQueue), [fullQueue]);
  const showcasedQueuedPos =
    showcased && inFlight.has(showcased.userId)
      ? fullQueue.indexOf(showcased.userId) + 1
      : null;
  const isShowcasedOnStage =
    showcased != null && showcased.userId === onStageId;

  const sendStudent = useCallback(
    async (s: StudentSummary) => {
      const res = await push.mutateAsync({
        stageCode,
        studentUserId: s.userId,
        tier,
      });
      if (!res.ok && res.reason === "currently-on-stage") {
        toast.error("Already on stage");
      }
      return res;
    },
    [push, stageCode, tier],
  );

  const openShowcase = useCallback(
    (s: StudentSummary, cardRect: DOMRect, imageRect: DOMRect) => {
      setSourceRects({ card: cardRect, image: imageRect });
      setShowcasedId(s.userId);
    },
    [],
  );

  useUserActivity({
    onIdle: () => setShowcasedId(null),
    delayMs: SHOWCASE_TIMEOUT_MS,
    enabled: showcasedId != null,
  });

  return (
    <div className="bg-lego relative flex h-full min-h-screen flex-col overflow-hidden text-chalkboard">
      <ShaderBg />
      <ConnectionIndicator light />

      <FindMeChip
        search={search}
        onSearchChange={setSearch}
        competencies={allCompetencies}
        selected={selectedComps}
        onToggleComp={(c) =>
          setSelectedComps((cur) =>
            cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c],
          )
        }
        onClear={() => {
          setSearch("");
          setSelectedComps([]);
        }}
        resultCount={filtered.length}
        showcasedId={showcasedId}
      />

      <main className="relative z-10 flex flex-1 items-stretch">
        {filtered.length === 0 ? (
          <EmptyState
            loading={students.isLoading}
            filtering={isFiltering && list.length > 0}
          />
        ) : (
          <div className="relative h-full w-full">
            <WallLane
              tier={tier}
              students={filtered}
              showcasedId={showcasedId}
              onTap={openShowcase}
              inFlight={inFlight}
            />
          </div>
        )}
      </main>

      <AnimatePresence>
        {showcased && sourceRects && (
          <WallShowcase
            tier={tier}
            student={showcased}
            sourceCardRect={sourceRects.card}
            sourceImageRect={sourceRects.image}
            isOnStage={isShowcasedOnStage}
            isQueued={showcasedQueuedPos != null && !isShowcasedOnStage}
            onClose={() => setShowcasedId(null)}
            onSend={async () => {
              const target = showcased;
              const res = await sendStudent(target);
              if (res.ok) {
                setSentStudent(target);
                setShowcasedId(null);
                window.setTimeout(() => setSentStudent(null), SENT_FLASH_MS);
              }
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sentStudent && <SentFlash student={sentStudent} />}
      </AnimatePresence>

      {pairOpen && (
        <PairModal
          onPair={(code) => {
            setStageCode(code);
            setPairOpen(false);
          }}
          onSkip={() => {
            clearStageCode();
            setPairOpen(false);
          }}
          onClose={() => setPairOpen(false)}
        />
      )}
    </div>
  );
}
