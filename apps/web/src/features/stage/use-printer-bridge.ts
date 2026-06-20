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

    const report = (available: boolean) => {
      trpcClient.printer.report
        .mutate({ stageCode, available })
        .catch((err) => console.error("printer.report error", err));
    };

    const checkHealth = async () => {
      try {
        const res = await fetch(`${PRINTER_URL}/health`);
        const data = res.ok ? await res.json() : null;
        if (!disposed) report(data?.printer === true);
      } catch {
        if (!disposed) report(false);
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
