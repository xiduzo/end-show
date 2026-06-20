import type { PrintJob } from "@end-show/api/printer/relay";
import { useEffect } from "react";

import { trpcClient } from "@/lib/trpc";

// Local print service (apps/printer) on the machine the NT-1809DD is plugged
// into — the same machine running this Stage. Companions (e.g. an iPad) can't
// reach it directly, so the Stage bridges: it reports printer availability to
// the server and forwards relayed print jobs to localhost.
const PRINTER_URL =
  (import.meta.env.VITE_PRINTER_URL as string | undefined) ??
  "http://localhost:8765";

const HEALTH_POLL_MS = 10_000;

export function usePrinterBridge(stageCode: string | null) {
  useEffect(() => {
    let disposed = false;

    let lastReported: boolean | null = null;
    const report = (available: boolean) => {
      if (available === lastReported) return; // only emit on change
      lastReported = available;
      trpcClient.printer.report
        .mutate({ stageCode, available })
        .catch((err) => console.error("printer.report error", err));
    };

    // Hysteresis: flip to available the instant a poll succeeds, but only flip
    // to unavailable after several consecutive misses. A single slow/dropped
    // /health poll (common while a long print holds the BLE link) would
    // otherwise unmount the companion's print button and make it flicker.
    const MISSES_BEFORE_UNAVAILABLE = 3;
    let misses = 0;

    const checkHealth = async () => {
      let ok = false;
      try {
        const res = await fetch(`${PRINTER_URL}/health`);
        const data = res.ok ? await res.json() : null;
        ok = data?.printer === true;
      } catch {
        ok = false;
      }
      if (disposed) return;
      if (ok) {
        misses = 0;
        report(true);
      } else if (++misses >= MISSES_BEFORE_UNAVAILABLE) {
        report(false);
      }
    };

    void checkHealth();
    const interval = setInterval(() => void checkHealth(), HEALTH_POLL_MS);

    const sub = trpcClient.printer.jobs.subscribe(
      { stageCode },
      {
        onData: (data) => {
          const { jobId, ...job } = data as PrintJob;
          // Forward to the local print service, then report the outcome back so
          // the companion's "printing…" state clears only when it's really done.
          void (async () => {
            let ok = false;
            try {
              const res = await fetch(`${PRINTER_URL}/print`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(job),
              });
              ok = res.ok;
            } catch (err) {
              console.error("printer forward error", err);
            }
            trpcClient.printer.complete
              .mutate({ jobId, ok })
              .catch((err) => console.error("printer.complete error", err));
          })();
        },
        onError: (err) => console.error("printer.jobs error", err),
      },
    );

    return () => {
      disposed = true;
      clearInterval(interval);
      sub.unsubscribe();
    };
  }, [stageCode]);
}
