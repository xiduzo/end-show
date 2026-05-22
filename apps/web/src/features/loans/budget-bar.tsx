import { cn } from "@end-show/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { BorrowDialog } from "./borrow-dialog";
import { trpc } from "@/lib/trpc";

function formatMB(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}

export function BudgetBar() {
  const budget = useQuery(trpc.budget.get.queryOptions());
  const [borrowOpen, setBorrowOpen] = useState(false);

  if (!budget.data) {
    return (
      <div className="mx-auto mt-6 max-w-6xl rounded-lg border border-lego-dark/15 bg-white px-6 py-4 font-mono text-xs text-lego-dark/50">
        loading budget…
      </div>
    );
  }

  const total = budget.data.effectiveBudgetBytes;
  const used = budget.data.usedBytes;
  const headroom = Math.max(0, total - used);
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const pendingOutSum = budget.data.outgoing.reduce(
    (sum, l) => sum + l.bytes,
    0,
  );
  const pctTone =
    pct < 60
      ? "plenty of room"
      : pct < 85
        ? "filling up"
        : pct < 100
          ? "nearly full"
          : pct < 120
            ? "over · soft warning"
            : "hard block";

  return (
    <>
      <div className="mx-auto mt-6 max-w-6xl rounded-lg border-2 border-lego-dark/30 bg-white px-6 py-5">
        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[1fr_auto]">
          <div>
            <p className="font-mono text-[10px] tracking-widest text-lego-dark/60 uppercase">
              storage budget
              {pendingOutSum > 0 && (
                <span className="ml-2 rounded-full bg-crayon px-2 py-0.5 text-[9px] font-bold tracking-wider text-chalkboard">
                  +{formatMB(pendingOutSum)} pending
                </span>
              )}
            </p>
            <p className="mt-1 font-display text-4xl font-bold tracking-tight">
              {formatMB(used)}
              <span className="text-lego-dark/40"> / {formatMB(total)}</span>
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-lego-dark/10">
              <div
                className={cn(
                  "h-full transition-all",
                  pct >= 120
                    ? "bg-slide"
                    : pct >= 100
                      ? "bg-crayon"
                      : "bg-lego-dark",
                )}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <p className="mt-1 font-mono text-[10px] text-lego-dark/50">
              <span className="float-right">
                {formatMB(headroom)} headroom · {pctTone}
              </span>
            </p>
          </div>

          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => setBorrowOpen(true)}
              className="rounded-full border-2 border-lego-dark px-5 py-2 font-mono text-xs font-bold text-lego-dark hover:bg-lego-dark hover:text-chalkboard"
            >
              I need more →
            </button>
          </div>
        </div>
      </div>

      {borrowOpen && <BorrowDialog onClose={() => setBorrowOpen(false)} />}
    </>
  );
}
