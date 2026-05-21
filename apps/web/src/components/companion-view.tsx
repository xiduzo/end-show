import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ConnectionIndicator } from "@/components/connection-indicator";
import { isValidStageCode, useStageCodeStore } from "@/lib/stageCode";
import { trpc, trpcClient } from "@/utils/trpc";

type QueueSnap = { stageCode: string | null; kiosk: string[]; mobile: string[] };

export function CompanionView({
  tier,
  urlCode,
}: {
  tier: "mobile" | "kiosk";
  urlCode: string | null;
}) {
  const stageCode = useStageCodeStore((s) => s.stageCode);
  const setStageCode = useStageCodeStore((s) => s.setStageCode);
  const students = useQuery(trpc.student.listEligible.queryOptions());
  const push = useMutation(trpc.queue.push.mutationOptions());
  const [snap, setSnap] = useState<QueueSnap | null>(null);

  useEffect(() => {
    if (urlCode && isValidStageCode(urlCode) && urlCode !== stageCode) {
      setStageCode(urlCode);
    }
  }, [urlCode, stageCode, setStageCode]);

  useEffect(() => {
    const sub = trpcClient.queue.watch.subscribe(
      { stageCode },
      {
        onData: (data) => setSnap(data as QueueSnap),
        onError: (err) => console.error("queue.watch error", err),
      },
    );
    return () => sub.unsubscribe();
  }, [stageCode]);

  const inFlight = new Set([...(snap?.kiosk ?? []), ...(snap?.mobile ?? [])]);

  return (
    <div className="container mx-auto max-w-md px-4 py-6">
      <ConnectionIndicator />
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">
          {tier === "kiosk" ? "Kiosk" : "Companion"}
        </h1>
        <p className="text-xs text-muted-foreground">
          stage: {stageCode ?? "default"}
        </p>
      </div>

      {tier === "kiosk" && <KioskCodeEntry />}

      <ul className="mt-6 space-y-3">
        {students.data?.map((s) => {
          const queued = inFlight.has(s.userId);
          return (
            <li
              key={s.userId}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="font-medium">{s.displayName}</p>
                <p className="text-xs text-muted-foreground">{s.pronouns}</p>
                <p className="text-xs text-muted-foreground">
                  {s.competencies.join(" · ")}
                </p>
              </div>
              <button
                type="button"
                disabled={queued || push.isPending}
                onClick={async () => {
                  const res = await push.mutateAsync({
                    stageCode,
                    studentUserId: s.userId,
                    tier,
                  });
                  if (!res.ok) {
                    if (res.reason === "currently-on-stage") {
                      toast.error("Already on stage");
                    } else if (res.reason === "already-queued") {
                      toast.error("Already in queue");
                    } else if (res.reason === "exposure-cap") {
                      const secs = Math.ceil(res.retryAfterMs / 1000);
                      toast.error(`Capped — try again in ~${secs}s`);
                    }
                  }
                }}
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-50"
              >
                {queued ? "queued" : "send"}
              </button>
            </li>
          );
        })}
      </ul>

      {snap && (snap.kiosk.length > 0 || snap.mobile.length > 0) && (
        <div className="mt-8 rounded-lg border p-3 text-xs">
          <p className="font-medium">Queue</p>
          <p>
            kiosk: {snap.kiosk.length} · mobile: {snap.mobile.length}
          </p>
        </div>
      )}
    </div>
  );
}

function KioskCodeEntry() {
  const stageCode = useStageCodeStore((s) => s.stageCode);
  const setStageCode = useStageCodeStore((s) => s.setStageCode);
  const clear = useStageCodeStore((s) => s.clear);
  const [entry, setEntry] = useState("");

  return (
    <div className="mt-4 rounded-lg border p-3 text-sm">
      <p className="font-medium">Pairing</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Enter 4-char Stage Code to pair, or leave on default.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          value={entry}
          onChange={(e) => setEntry(e.target.value.toUpperCase().slice(0, 4))}
          placeholder="XKZP"
          className="w-24 rounded border bg-transparent px-2 py-1 font-mono tracking-widest"
        />
        <button
          type="button"
          disabled={!isValidStageCode(entry)}
          onClick={() => {
            setStageCode(entry);
            setEntry("");
          }}
          className="rounded border px-3 py-1 disabled:opacity-50"
        >
          Pair
        </button>
        {stageCode && (
          <button
            type="button"
            onClick={() => clear()}
            className="rounded border px-3 py-1"
          >
            Unpair
          </button>
        )}
      </div>
    </div>
  );
}
