import { useEffect, useMemo, useState } from "react";

// Local asset cache proxy (kiosk only).
//
// The show host (Mac mini) runs an nginx reverse-proxy that caches every R2
// asset to local disk (/tmp). The kiosk Firefox is launched with a
// `?proxy=http://localhost:PORT` flag; when present AND reachable we rewrite
// every student asset URL to go through that local cache instead of hitting
// R2 over the venue uplink. Everywhere else (students' phones, admin) the flag
// is absent, so URLs pass through untouched.
//
// Reachability is health-checked once per load. If the proxy is down we fall
// straight back to the canonical storage URLs — the show never depends on the
// cache being up.

const PARAM = "proxy";
const STORAGE_KEY = "asset-proxy-base";

// Capture the flag at module load, before the router can normalize it out of
// the URL. Persist to sessionStorage so SPA navigation within the kiosk keeps it.
function captureBase(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get(PARAM);
    if (fromUrl) {
      window.sessionStorage.setItem(STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const CANDIDATE = captureBase();

function trimSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

// Rewrite an absolute http(s) asset URL to go through the local cache.
// Host-agnostic: keep the path (+query), swap the origin. The path carries the
// per-upload UUID, so it is a stable cache key and a re-upload (new UUID) is a
// natural cache miss. Leaves data:/blob:/relative URLs alone.
export function toProxyUrl(base: string, url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return url;
    return `${trimSlash(base)}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

// Returns the proxy base ONLY after a health probe confirms the local cache is
// reachable; null otherwise (no flag, probe failed, or not yet resolved), so
// callers default to canonical URLs. One probe per load.
export function useAssetProxyBase(): string | null {
  const [base, setBase] = useState<string | null>(null);

  useEffect(() => {
    if (!CANDIDATE) return;
    let alive = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    fetch(`${trimSlash(CANDIDATE)}/healthz`, {
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then((r) => {
        if (alive && r.ok) setBase(CANDIDATE);
      })
      .catch(() => {
        /* proxy down — stay on canonical URLs */
      })
      .finally(() => clearTimeout(timer));
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(timer);
    };
  }, []);

  return base;
}

type WithAssetUrls = {
  portraitUrl: string | null;
  workMediaUrl: string | null;
};

// Map a student's asset URLs through the proxy. No-op (returns the same array
// reference) when the proxy is inactive, so it's safe to call unconditionally.
export function useProxiedAssets<T extends WithAssetUrls>(
  students: T[] | undefined,
  base: string | null,
): T[] | undefined {
  return useMemo(() => {
    if (!base || !students) return students;
    return students.map((s) => ({
      ...s,
      portraitUrl: s.portraitUrl ? toProxyUrl(base, s.portraitUrl) : s.portraitUrl,
      workMediaUrl: s.workMediaUrl
        ? toProxyUrl(base, s.workMediaUrl)
        : s.workMediaUrl,
    }));
  }, [students, base]);
}
