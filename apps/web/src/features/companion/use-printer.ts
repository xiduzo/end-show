import type { PrinterSnapshot } from "@end-show/api/printer/relay";
import type { StudentSummary } from "@end-show/api/routers/student";
import { useCallback, useEffect, useState } from "react";

import { trpcClient } from "@/lib/trpc";

// The printer hangs off the Stage machine, not this device (e.g. an iPad on
// a hosted site can never reach localhost). Availability and print jobs are
// relayed through the server, keyed by the paired stageCode.
export function usePrinter(stageCode: string | null) {
  const [available, setAvailable] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const sub = trpcClient.printer.watch.subscribe(
      { stageCode },
      {
        onData: (d) => setAvailable((d as PrinterSnapshot).available),
        onError: (e) => {
          console.error("printer.watch error", e);
          setAvailable(false);
        },
      },
    );
    return () => sub.unsubscribe();
  }, [stageCode]);

  const print = useCallback(
    async (student: StudentSummary) => {
      setPrinting(true);
      try {
        const res = await trpcClient.printer.print.mutate({
          stageCode,
          displayName: student.displayName,
          pronouns: student.pronouns,
          track: student.track,
          introduction: student.introduction,
          competencies: student.competencies,
          link: student.link,
          portraitUrl: student.portraitUrl,
        });
        return res.ok;
      } catch {
        return false;
      } finally {
        setPrinting(false);
      }
    },
    [stageCode],
  );

  return { available, printing, print };
}
