import { randomUUID } from "node:crypto";

// Printer relay — the companion (iPad) can't reach the local print service
// on the printer host, so the Stage bridges: it reports printer availability
// per stageCode and receives print jobs to forward to localhost.

export type PrintJob = {
  /** Correlates the forwarded job with its completion report. */
  jobId: string;
  displayName: string;
  pronouns: string;
  track: string;
  introduction: string;
  competencies: string[];
  link: string;
  portraitUrl: string | null;
};

export type PrinterSnapshot = {
  stageCode: string | null;
  available: boolean;
};

type PrinterChannel = {
  stageCode: string | null;
  /** Last health report from the Stage's local print service. */
  reported: boolean;
  jobListeners: Set<(job: PrintJob) => void>;
  availabilityListeners: Set<(s: PrinterSnapshot) => void>;
};

const channels = new Map<string, PrinterChannel>();

// Jobs awaiting a completion report from the Stage that forwarded them, so the
// companion's print mutation stays pending (button shows "printing…") until the
// receipt physically prints or fails. A timeout resolves false if the Stage
// never reports back (disconnected mid-job, slow link).
type PendingJob = {
  resolve: (ok: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
};
const pending = new Map<string, PendingJob>();
// A raster receipt over BLE with a deliberately slowed print head can take well
// over a minute end to end (the printer ACKs only as its buffer drains, plus a
// drain wait so completion tracks the physical print). Keep this comfortably
// above the worst-case print so the job isn't force-resolved while still printing.
const JOB_TIMEOUT_MS = 180_000;

function keyFor(stageCode: string | null): string {
  return stageCode ?? "";
}

function getChannel(stageCode: string | null): PrinterChannel {
  const key = keyFor(stageCode);
  let ch = channels.get(key);
  if (!ch) {
    ch = {
      stageCode,
      reported: false,
      jobListeners: new Set(),
      availabilityListeners: new Set(),
    };
    channels.set(key, ch);
  }
  return ch;
}

// Available only while a Stage is connected to forward jobs AND its last
// health check found the printer — a reported=true flag from a Stage that
// has since disconnected must not show the print button.
function snapshot(ch: PrinterChannel): PrinterSnapshot {
  return {
    stageCode: ch.stageCode,
    available: ch.reported && ch.jobListeners.size > 0,
  };
}

function emitAvailability(ch: PrinterChannel): void {
  const snap = snapshot(ch);
  for (const l of ch.availabilityListeners) l(snap);
}

export function reportPrinter(
  stageCode: string | null,
  available: boolean,
): void {
  const ch = getChannel(stageCode);
  if (ch.reported === available) return;
  ch.reported = available;
  emitAvailability(ch);
}

export function subscribePrinterJobs(
  stageCode: string | null,
  cb: (job: PrintJob) => void,
): () => void {
  const ch = getChannel(stageCode);
  ch.jobListeners.add(cb);
  emitAvailability(ch);
  return () => {
    ch.jobListeners.delete(cb);
    emitAvailability(ch);
  };
}

export function subscribePrinterAvailability(
  stageCode: string | null,
  cb: (s: PrinterSnapshot) => void,
): () => void {
  const ch = getChannel(stageCode);
  ch.availabilityListeners.add(cb);
  cb(snapshot(ch));
  return () => {
    ch.availabilityListeners.delete(cb);
  };
}

// Resolves once the Stage reports the job done (true=printed, false=failed),
// or false on timeout. The returned promise is what keeps the companion's
// print mutation pending.
export function submitPrintJob(
  stageCode: string | null,
  job: Omit<PrintJob, "jobId">,
): Promise<boolean> {
  const ch = getChannel(stageCode);
  if (!snapshot(ch).available) return Promise.resolve(false);
  const jobId = randomUUID();
  const full: PrintJob = { ...job, jobId };
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(jobId);
      resolve(false);
    }, JOB_TIMEOUT_MS);
    pending.set(jobId, { resolve, timer });
    for (const l of ch.jobListeners) l(full);
  });
}

// Stage → server: a forwarded job finished printing (or failed).
export function completePrintJob(jobId: string, ok: boolean): void {
  const p = pending.get(jobId);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(jobId);
  p.resolve(ok);
}
