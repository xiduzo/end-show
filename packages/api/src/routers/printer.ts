import { observable } from "@trpc/server/observable";
import { z } from "zod";

import { publicProcedure, router } from "../index";
import {
  type PrinterSnapshot,
  type PrintJob,
  reportPrinter,
  submitPrintJob,
  subscribePrinterAvailability,
  subscribePrinterJobs,
} from "../printer/relay";

const stageCodeSchema = z.string().nullable();

// Mirrors PrintRequest of the local print service (apps/printer).
const printJobSchema = z.object({
  displayName: z.string().min(1),
  pronouns: z.string().default(""),
  track: z.string().default(""),
  introduction: z.string().default(""),
  competencies: z.array(z.string()).default([]),
  link: z.string().default(""),
  portraitUrl: z.string().nullable().default(null),
});

export const printerRouter = router({
  // Stage → server: health heartbeat for the local print service.
  report: publicProcedure
    .input(z.object({ stageCode: stageCodeSchema, available: z.boolean() }))
    .mutation(({ input }) => {
      reportPrinter(input.stageCode, input.available);
    }),
  // Stage ← server: jobs to forward to the local print service.
  jobs: publicProcedure
    .input(z.object({ stageCode: stageCodeSchema }))
    .subscription(({ input }) =>
      observable<PrintJob>((emit) => {
        return subscribePrinterJobs(input.stageCode, (job) => emit.next(job));
      }),
    ),
  // Companion ← server: whether a printer is reachable for this stage.
  watch: publicProcedure
    .input(z.object({ stageCode: stageCodeSchema }))
    .subscription(({ input }) =>
      observable<PrinterSnapshot>((emit) => {
        return subscribePrinterAvailability(input.stageCode, (snap) =>
          emit.next(snap),
        );
      }),
    ),
  // Companion → server: print request, relayed to the Stage.
  print: publicProcedure
    .input(printJobSchema.extend({ stageCode: stageCodeSchema }))
    .mutation(({ input }) => {
      const { stageCode, ...job } = input;
      return { ok: submitPrintJob(stageCode, job) };
    }),
});
