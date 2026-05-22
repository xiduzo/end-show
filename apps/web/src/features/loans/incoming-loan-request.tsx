import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

import { initials, shortMB, timeAgo } from "./loan-helpers";

export type IncomingLoan = {
  id: string;
  bytes: number;
  reason: string;
  createdAt: Date | string | number;
  borrower: { id: string; name: string; email: string; displayName: string } | null;
};

export function IncomingLoanRequest({
  loan,
  headroomAfterBytes,
}: {
  loan: IncomingLoan;
  headroomAfterBytes: number;
}) {
  const qc = useQueryClient();
  const respond = useMutation(trpc.budget.respond.mutationOptions());
  const name =
    loan.borrower?.displayName?.trim() ||
    loan.borrower?.name ||
    loan.borrower?.email?.split("@")[0] ||
    "Someone";

  const doRespond = async (accept: boolean) => {
    try {
      await respond.mutateAsync({ loanId: loan.id, accept });
      toast.success(accept ? `Lent ${shortMB(loan.bytes)}` : "Declined");
      await qc.invalidateQueries({ queryKey: trpc.budget.get.queryKey() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  return (
    <div className="mx-auto mt-4 max-w-6xl rounded-lg border-2 border-crayon bg-crayon/15 px-6 py-4">
      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[1fr_auto]">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-crayon font-mono text-xs font-bold text-chalkboard">
            {initials(name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] tracking-widest text-lego-dark/60 uppercase">
              incoming request · {timeAgo(loan.createdAt)}
            </p>
            <p className="mt-0.5 font-mono text-base">
              <span className="font-bold">{name}</span> is asking to borrow{" "}
              <span className="rounded bg-lego-dark px-2 py-0.5 font-bold text-chalkboard">
                {shortMB(loan.bytes)}
              </span>
            </p>
            {loan.reason && (
              <p className="mt-1 max-w-xl font-mono text-xs text-lego-dark/70 italic">
                "{loan.reason}"
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => doRespond(false)}
              disabled={respond.isPending}
              className="rounded-full border border-lego-dark/30 px-4 py-1.5 font-mono text-xs hover:bg-lego-dark/5 disabled:opacity-40"
            >
              decline
            </button>
            <button
              type="button"
              onClick={() => doRespond(true)}
              disabled={respond.isPending}
              className="rounded-full bg-slide px-5 py-1.5 font-mono text-xs font-bold text-chalkboard disabled:opacity-40"
            >
              accept · lend {shortMB(loan.bytes)} ↑
            </button>
          </div>
          <p className="font-mono text-[10px] tracking-widest text-lego-dark/50 uppercase">
            your headroom after: {shortMB(headroomAfterBytes)}
          </p>
        </div>
      </div>
    </div>
  );
}
