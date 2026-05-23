export function ShowcaseColumn({
  workMediaUrl,
  workMediaKind,
  busy,
  progress,
  onPick,
  onPickVideo,
  readOnly,
}: {
  workMediaUrl: string | null;
  workMediaKind: "work-image" | "work-video" | null;
  busy: boolean;
  progress: number;
  onPick: () => void;
  onPickVideo: () => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase">
          showcase work <span className="text-slide">*</span>
        </p>
        {!readOnly && busy ? (
          <span className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase">
            {progress > 0 && progress < 100 ? `${progress}%` : "uploading…"}
          </span>
        ) : workMediaUrl && !readOnly ? (
          <button
            type="button"
            onClick={onPick}
            disabled={busy}
            className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase hover:text-slide disabled:opacity-40"
          >
            replace ↺
          </button>
        ) : (
          <p className="font-mono text-xs text-lego-dark/40">
            one piece · image or video
          </p>
        )}
      </div>
      <div className="relative aspect-video overflow-hidden rounded-md border border-lego-dark/20 bg-lego-dark">
        {workMediaUrl ? (
          workMediaKind === "work-video" ? (
            <video
              key={workMediaUrl}
              controls
              playsInline
              preload="auto"
              crossOrigin="anonymous"
              className="h-full w-full object-cover"
            >
              <source src={workMediaUrl} type="video/mp4" />
            </video>
          ) : (
            <img
              src={workMediaUrl}
              alt="Work"
              className="h-full w-full object-cover"
            />
          )
        ) : readOnly ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 font-mono text-xs text-chalkboard/40">
            <span>no work uploaded</span>
            <span>student uploads from /profile</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPick}
            disabled={busy}
            className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.04)_0_1px,transparent_1px_8px)] font-mono text-xs text-chalkboard/60 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <span className="text-2xl text-chalkboard">
                  {progress > 0 && progress < 100 ? `${progress}%` : "…"}
                </span>
                <span>uploading</span>
              </>
            ) : (
              <>
                <span className="text-lg">↑</span>
                <span>drop an image or video here</span>
                <span className="text-chalkboard/40">we figure out the rest</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
