import { observable } from "@trpc/server/observable";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import { type StageSnapshot, subscribeStage } from "../queue/engine";

export const stageRouter = router({
  current: publicProcedure
    .input(z.object({ stageCode: z.string().nullable() }))
    .subscription(({ input }) =>
      observable<StageSnapshot>((emit) => {
        return subscribeStage(input.stageCode, (snap) => emit.next(snap));
      }),
    ),
});
