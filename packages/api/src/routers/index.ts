import { protectedProcedure, publicProcedure, router } from "../index";
import { adminRouter } from "./admin";
import { assetRouter } from "./asset";
import { budgetRouter } from "./budget";
import { printerRouter } from "./printer";
import { queueRouter } from "./queue";
import { stageRouter } from "./stage";
import { studentRouter } from "./student";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  student: studentRouter,
  queue: queueRouter,
  stage: stageRouter,
  printer: printerRouter,
  asset: assetRouter,
  budget: budgetRouter,
  admin: adminRouter,
});
export type AppRouter = typeof appRouter;
