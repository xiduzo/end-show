// Printer relay — the companion (iPad) can't reach the local print service
// on the printer host, so the Stage bridges: it reports printer availability
// per stageCode and receives print jobs to forward to localhost.

export type PrintJob = {
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

export function submitPrintJob(
  stageCode: string | null,
  job: PrintJob,
): boolean {
  const ch = getChannel(stageCode);
  if (!snapshot(ch).available) return false;
  for (const l of ch.jobListeners) l(job);
  return true;
}
