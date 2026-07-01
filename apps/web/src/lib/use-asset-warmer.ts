import { useEffect } from "react";

// Kiosk asset warmer.
//
// On the big screen the local nginx proxy (see @/lib/asset-proxy) is the real
// asset cache. This hook makes sure EVERY eligible student's work media is
// pulled into that on-disk cache up front — not just the next few in the queue —
// so any student sent to stage plays instantly off the LAN instead of triggering
// a cold R2 fetch mid-show.
//
// Portraits are already warmed for all students by <AssetPreloader> (hidden
// <img> tags), so this hook only chases the heavy work media (videos/images).
//
// It only runs on the kiosk: `base` is non-null only when the ?proxy= flag is
// present AND the local proxy passed its health probe. Everywhere else it's a
// no-op.

// Module-scoped so it survives remounts and query refetches within a session:
// a URL warmed once is never re-fetched. Asset paths carry a per-upload UUID, so
// a re-upload is a brand-new URL — a natural miss that gets warmed on the next
// update tick, while unchanged students are skipped.
const warmed = new Set<string>();

// Read the whole body to completion and discard every chunk. Draining fully is
// what makes nginx commit the object to its disk cache (it only writes COMPLETE
// responses); discarding chunks keeps browser memory flat regardless of size.
async function drain(url: string, signal: AbortSignal): Promise<void> {
  const res = await fetch(url, { cache: "no-store", mode: "cors", signal });
  if (!res.ok || !res.body) return;
  const reader = res.body.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}

async function warmPool(
  urls: string[],
  concurrency: number,
  signal: AbortSignal,
): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < urls.length && !signal.aborted) {
      const url = urls[i++];
      if (warmed.has(url)) continue;
      try {
        await drain(url, signal);
        warmed.add(url); // only mark warmed on a clean full read
      } catch {
        /* leave unwarmed — retried on the next update tick */
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, concurrency) }, worker),
  );
}

type WithAssetUrls = {
  workMediaUrl: string | null;
};

export function useKioskAssetWarmer(
  students: WithAssetUrls[] | undefined,
  base: string | null,
): void {
  useEffect(() => {
    if (!base || !students?.length) return;
    const ctrl = new AbortController();

    const media = students
      .map((s) => s.workMediaUrl)
      .filter((u): u is string => !!u && !warmed.has(u));
    if (media.length === 0) return;

    // Low concurrency: warming shares nginx with whatever is playing right now.
    // proxy_cache_lock dedupes if a warm races the live request for the same URL.
    void warmPool(media, 2, ctrl.signal);

    return () => ctrl.abort();
  }, [students, base]);
}
