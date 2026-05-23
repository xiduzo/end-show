import { initials, shortMB } from "./loan-helpers";

export type LoanTone = "crayon" | "slime" | "slide" | "neutral";

const toneStyles: Record<
  LoanTone,
  { wrap: string; avatar: string; pill: string }
> = {
  crayon: {
    wrap: "border-crayon bg-crayon/15",
    avatar: "bg-crayon text-chalkboard",
    pill: "bg-lego-dark text-chalkboard",
  },
  slime: {
    wrap: "border-lego-dark/40 bg-slime/25 border-dashed",
    avatar: "bg-slime text-chalkboard",
    pill: "bg-lego-dark text-chalkboard",
  },
  slide: {
    wrap: "border-slide/60 bg-slide/15",
    avatar: "bg-slide text-chalkboard",
    pill: "bg-lego-dark text-chalkboard",
  },
  neutral: {
    wrap: "border-lego-dark/25 bg-white",
    avatar: "bg-lego-dark/15 text-lego-dark",
    pill: "bg-lego-dark text-chalkboard",
  },
};

export function LoanBanner({
  tone,
  label,
  peerName,
  prefix,
  bytes,
  suffix,
  reason,
  meta,
  actions,
}: {
  tone: LoanTone;
  label: string;
  peerName: string;
  prefix: string;
  bytes: number;
  suffix?: string;
  reason?: string;
  meta?: string;
  actions?: React.ReactNode;
}) {
  const s = toneStyles[tone];
  return (
    <div
      className={`mx-auto mt-4 max-w-6xl rounded-lg border-2 px-6 py-4 ${s.wrap}`}
    >
      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[1fr_auto]">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold ${s.avatar}`}
          >
            {initials(peerName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase">
              {label}
            </p>
            <p className="mt-0.5 font-mono text-base">
              <span className="font-bold">{peerName}</span> {prefix}{" "}
              <span className={`rounded px-2 py-0.5 font-bold ${s.pill}`}>
                {shortMB(bytes)}
              </span>
              {suffix ? ` ${suffix}` : null}
            </p>
            {reason && (
              <p className="mt-1 max-w-xl font-mono text-xs text-lego-dark/70 italic">
                "{reason}"
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {actions}
          {meta && (
            <p className="font-mono text-xs tracking-widest text-lego-dark/50 uppercase">
              {meta}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
