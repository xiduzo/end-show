import type { StudentSummary } from "@end-show/api/routers/student";
import { useCallback, useEffect, useState } from "react";

// Local print service (apps/printer) running on the machine the NT-1809DD
// is plugged into. Override when the companion runs on a different device
// than the printer host (e.g. iPad next to a Raspberry Pi).
const PRINTER_URL =
  (import.meta.env.VITE_PRINTER_URL as string | undefined) ??
  "http://localhost:8765";

export function usePrinter() {
  const [available, setAvailable] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${PRINTER_URL}/health`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAvailable(data?.printer === true))
      .catch(() => setAvailable(false));
    return () => controller.abort();
  }, []);

  const print = useCallback(async (student: StudentSummary) => {
    setPrinting(true);
    try {
      const res = await fetch(`${PRINTER_URL}/print`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: student.displayName,
          pronouns: student.pronouns,
          track: student.track,
          introduction: student.introduction,
          competencies: student.competencies,
          link: student.link,
          portraitUrl: student.portraitUrl,
        }),
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      setPrinting(false);
    }
  }, []);

  return { available, printing, print };
}
