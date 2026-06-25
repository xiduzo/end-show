import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

const STAGE_TOLERANCE_MS = 1000;

function probeVideoDurationMs(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.src = "";
    };
    video.onloadedmetadata = () => {
      const d = video.duration;
      cleanup();
      resolve(Number.isFinite(d) && d > 0 ? d * 1000 : null);
    };
    video.onerror = () => {
      cleanup();
      resolve(null);
    };
    video.src = url;
  });
}

export type AssetKind = "portrait" | "work-image" | "work-video";

const ACCEPT: Record<AssetKind, string> = {
  portrait: "image/jpeg,image/png,image/webp",
  "work-image": "image/jpeg,image/png,image/webp,image/gif",
  "work-video": "video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov",
};

function resolveKind(
  candidates: AssetKind[],
  file: File,
): AssetKind | null {
  if (candidates.length === 1) return candidates[0];
  const name = file.name.toLowerCase();
  if (candidates.includes("work-video")) {
    if (file.type.startsWith("video/")) return "work-video";
    if (/\.(mp4|webm|mov|m4v|quicktime)$/.test(name)) return "work-video";
  }
  if (candidates.includes("work-image")) {
    if (file.type.startsWith("image/")) return "work-image";
    if (/\.(jpe?g|png|webp|gif)$/.test(name)) return "work-image";
  }
  return candidates[0] ?? null;
}

export function useAssetUpload(opts: {
  onUploaded: () => void;
  targetUserId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeKind, setActiveKind] = useState<AssetKind | null>(null);
  const candidatesRef = useRef<AssetKind[]>([]);
  const requestUpload = useMutation(trpc.asset.requestUpload.mutationOptions());
  const finalize = useMutation(trpc.asset.finalizeUpload.mutationOptions());
  const stageConfig = useQuery(trpc.stage.config.queryOptions());

  const pickFile = (kindOrKinds: AssetKind | AssetKind[]) => {
    const kinds = Array.isArray(kindOrKinds) ? kindOrKinds : [kindOrKinds];
    candidatesRef.current = kinds;
    setActiveKind(kinds[0]);
    if (inputRef.current) {
      inputRef.current.accept = kinds.map((k) => ACCEPT[k]).join(",");
      inputRef.current.click();
    }
  };

  const processFile = async (file: File) => {
    const kind = resolveKind(candidatesRef.current, file);
    if (!kind) return;
    setActiveKind(kind);

    if (kind === "work-video" && stageConfig.data) {
      const dwellMs = stageConfig.data.dwellMs;
      const durationMs = await probeVideoDurationMs(file);
      if (durationMs !== null && Math.abs(durationMs - dwellMs) > STAGE_TOLERANCE_MS) {
        const stageSec = Math.round(dwellMs / 1000);
        const videoSec = Math.round(durationMs / 100) / 10;
        toast.warning(
          durationMs > dwellMs
            ? `Video is ${videoSec}s — only the first ${stageSec}s will be shown on stage.`
            : `Video is ${videoSec}s — it will loop until the ${stageSec}s stage slot ends.`,
        );
      }
    }

    setBusy(true);
    setProgress(0);
    try {
      const { assetId, r2Key, uploadUrl, softWarning } =
        await requestUpload.mutateAsync({
          kind,
          mimeType: file.type,
          bytes: file.size,
          targetUserId: opts.targetUserId,
        });
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.setRequestHeader("Cache-Control", "public, max-age=31536000, immutable");
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            setProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(file);
      });
      await finalize.mutateAsync({
        assetId,
        kind,
        r2Key,
        bytes: file.size,
        mimeType: file.type,
        targetUserId: opts.targetUserId,
      });
      opts.onUploaded();
      // Soft band (CONTEXT.md): upload succeeded but the Student is over budget
      // (within 1.20×). Surface the server's escalating warning.
      if (softWarning) toast.warning(softWarning);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress(0);
      setActiveKind(null);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    await processFile(file);
  };

  const dropFiles = async (
    kindOrKinds: AssetKind | AssetKind[],
    files: FileList | File[],
  ) => {
    const file = Array.from(files)[0];
    if (!file) return;
    const kinds = Array.isArray(kindOrKinds) ? kindOrKinds : [kindOrKinds];
    candidatesRef.current = kinds;
    await processFile(file);
  };

  return {
    inputRef,
    pickFile,
    onFile,
    dropFiles,
    busy,
    progress,
    activeKind,
  };
}
