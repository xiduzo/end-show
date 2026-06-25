export function PortraitColumn({
  portraitUrl,
  busy,
  progress,
  onPick,
  readOnly,
}: {
  portraitUrl: string | null;
  busy: boolean;
  progress: number;
  onPick: () => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase">
          portrait <span className="text-slide">*</span>
        </p>
        {!readOnly && busy ? (
          <span className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase">
            {progress > 0 && progress < 100 ? `${progress}%` : "uploading…"}
          </span>
        ) : (
          portraitUrl &&
          !readOnly && (
            <button
              type="button"
              onClick={onPick}
              disabled={busy}
              className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase hover:text-slide disabled:opacity-40"
            >
              replace ↺
            </button>
          )
        )}
      </div>
      <div className="relative aspect-[3/4] overflow-hidden rounded-md border border-lego-dark/20 bg-lego-dark/[0.04]">
        {portraitUrl ? (
          <img
            src={portraitUrl}
            alt="Portrait"
            crossOrigin="anonymous"
            className="h-full w-full object-cover object-top"
          />
        ) : readOnly ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(135deg,rgba(1,1,45,0.04)_0_1px,transparent_1px_8px)] font-mono text-xs text-lego-dark/40">
            <span>no portrait</span>
            <span>student uploads from /profile</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPick}
            disabled={busy}
            className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,rgba(1,1,45,0.04)_0_1px,transparent_1px_8px)] font-mono text-xs text-lego-dark/40 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <span className="text-2xl text-lego-dark/70">
                  {progress > 0 && progress < 100 ? `${progress}%` : "…"}
                </span>
                <span>uploading</span>
              </>
            ) : (
              <>
                <span className="text-lg">↑</span>
                <span>drag photo here</span>
                <span>or click to browse</span>
              </>
            )}
          </button>
        )}
        {!portraitUrl && (
          <span className="absolute top-2 left-2 font-mono text-xs tracking-widest text-lego-dark/40 uppercase">
            3:4 · portrait
          </span>
        )}
      </div>
    </div>
  );
}
