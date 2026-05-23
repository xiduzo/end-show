import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

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

  const pickFile = (kindOrKinds: AssetKind | AssetKind[]) => {
    const kinds = Array.isArray(kindOrKinds) ? kindOrKinds : [kindOrKinds];
    candidatesRef.current = kinds;
    setActiveKind(kinds[0]);
    if (inputRef.current) {
      inputRef.current.accept = kinds.map((k) => ACCEPT[k]).join(",");
      inputRef.current.click();
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const kind = file ? resolveKind(candidatesRef.current, file) : null;
    if (!file || !kind) return;
    e.target.value = "";
    setActiveKind(kind);
    setBusy(true);
    setProgress(0);
    try {
      const { assetId, r2Key, uploadUrl } = await requestUpload.mutateAsync({
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress(0);
      setActiveKind(null);
    }
  };

  return {
    inputRef,
    pickFile,
    onFile,
    busy,
    progress,
    activeKind,
  };
}
