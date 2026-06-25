import { observable } from "@trpc/server/observable";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import { DWELL_MS, type StageSnapshot, subscribeStage } from "../queue/engine";

export const stageRouter = router({
  current: publicProcedure
    .input(
      z.object({
        stageCode: z.string().nullable(),
        // Stage display sends its track filter (array, or null = all tracks).
        // Companions omit it so they don't overwrite the Stage's config.
        tracks: z.array(z.string()).nullish(),
      }),
    )
    .subscription(({ input }) =>
      observable<StageSnapshot>((emit) => {
        return subscribeStage(
          input.stageCode,
          (snap) => emit.next(snap),
          input.tracks,
        );
      }),
    ),
  config: publicProcedure.query(() => ({ dwellMs: DWELL_MS })),
});
