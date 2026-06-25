import { Button } from "@end-show/ui/components/button";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

type Kind = "portrait" | "work-image" | "work-video";

const ACCEPT: Record<Kind, string> = {
  portrait: "image/jpeg,image/png,image/webp",
  "work-image": "image/jpeg,image/png,image/webp,image/gif",
  "work-video": "video/mp4,video/webm,video/quicktime",
};

export function UploadWidget({
  kind,
  label,
  currentUrl,
  onUploaded,
  onCleared,
}: {
  kind: Kind;
  label: string;
  currentUrl: string | null;
  onUploaded: () => void;
  onCleared?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const requestUpload = useMutation(trpc.asset.requestUpload.mutationOptions());
  const finalize = useMutation(trpc.asset.finalizeUpload.mutationOptions());

  const onPick = () => inputRef.current?.click();

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setBusy(true);
    setProgress(0);
    try {
      const { assetId, r2Key, uploadUrl, softWarning } =
        await requestUpload.mutateAsync({
          kind,
          mimeType: file.type,
          bytes: file.size,
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
          else reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        };
        xhr.onerror = () => reject(new Error("Upload network error"));
        xhr.send(file);
      });

      await finalize.mutateAsync({
        assetId,
        kind,
        r2Key,
        bytes: file.size,
        mimeType: file.type,
      });

      toast.success(`${label} uploaded`);
      if (softWarning) toast.warning(softWarning);
      onUploaded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {currentUrl && onCleared && (
          <button
            type="button"
            onClick={onCleared}
            className="text-xs text-muted-foreground hover:underline"
          >
            remove
          </button>
        )}
      </div>
      {currentUrl ? (
        kind === "work-video" ? (
          <video
            src={currentUrl}
            controls
            className="max-h-48 w-full rounded-md border bg-black"
          />
        ) : (
          <img
            src={currentUrl}
            alt={label}
            className="max-h-48 rounded-md border object-cover"
          />
        )
      ) : (
        <div className="flex h-24 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
          no {label.toLowerCase()} yet
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPick}
          disabled={busy}
        >
          {busy
            ? progress > 0 && progress < 100
              ? `Uploading… ${progress}%`
              : "Uploading…"
            : currentUrl
              ? "Replace"
              : "Upload"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT[kind]}
          className="hidden"
          onChange={onChange}
        />
      </div>
    </div>
  );
}
