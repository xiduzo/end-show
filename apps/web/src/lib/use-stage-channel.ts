import type { QueueSnapshot, StageSnapshot } from "@end-show/api/queue/engine";
import { useEffect, useState } from "react";

import { trpcClient } from "./trpc";

export type { QueueSnapshot, StageSnapshot };

export type StageChannel = {
  /** Current Student on Stage + the Stage's track filter + Dwell. */
  stage: StageSnapshot | null;
  /** The ordered Queue for this Stage Code. */
  queue: QueueSnapshot | null;
};

/**
 * The live Stage channel — `stage.current` and `queue.watch` for one Stage
 * Code, over the single tRPC WebSocket (ADR-0002). The one home for the
 * subscription contract, shared by the Stage display and both Companions, so
 * reconnect/resync lives in one module instead of being hand-wired per surface.
 *
 * Pass `tracks` only from the Stage display — it owns the track filter. The
 * Companion omits it (leave `tracks` undefined) so it never clobbers the
 * Stage's configuration (see subscribeStage in queue/engine).
 */
export function useStageChannel(opts: {
  stageCode: string | null;
  tracks?: string[] | null;
}): StageChannel {
  const { stageCode } = opts;
  // Arrays are a fresh ref each render; collapse to a stable string so the
  // effect re-subscribes only when the filter actually changes. `undefined`
  // (Companion) stays distinct from `null`/`[]` (Stage clearing the filter).
  const tracksKey =
    opts.tracks === undefined ? undefined : (opts.tracks ?? []).join(",");

  const [stage, setStage] = useState<StageSnapshot | null>(null);
  const [queue, setQueue] = useState<QueueSnapshot | null>(null);

  useEffect(() => {
    const input =
      tracksKey === undefined
        ? { stageCode }
        : { stageCode, tracks: tracksKey ? tracksKey.split(",") : null };
    const sub = trpcClient.stage.current.subscribe(input, {
      onData: (d) => setStage(d as StageSnapshot),
      onError: (e) => console.error("stage.current error", e),
    });
    return () => sub.unsubscribe();
  }, [stageCode, tracksKey]);

  useEffect(() => {
    const sub = trpcClient.queue.watch.subscribe(
      { stageCode },
      {
        onData: (d) => setQueue(d as QueueSnapshot),
        onError: (e) => console.error("queue.watch error", e),
      },
    );
    return () => sub.unsubscribe();
  }, [stageCode]);

  return { stage, queue };
}
