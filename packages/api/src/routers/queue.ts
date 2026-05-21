import { observable } from "@trpc/server/observable";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import { type QueueSnapshot, pushToQueue, subscribeQueue } from "../queue/engine";

const stageCodeSchema = z.string().nullable();

export const queueRouter = router({
  push: publicProcedure
    .input(
      z.object({
        stageCode: stageCodeSchema,
        studentUserId: z.string(),
        tier: z.enum(["kiosk", "mobile"]).default("mobile"),
      }),
    )
    .mutation(({ input }) => pushToQueue(input)),
  watch: publicProcedure
    .input(z.object({ stageCode: stageCodeSchema }))
    .subscription(({ input }) =>
      observable<QueueSnapshot>((emit) => {
        return subscribeQueue(input.stageCode, (snap) => emit.next(snap));
      }),
    ),
});
