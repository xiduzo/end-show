import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

import { LoanBanner } from "./loan-banner";
import { shortMB, timeAgo } from "./loan-helpers";

export type ActiveLoan = {
  id: string;
  bytes: number;
  createdAt: Date | string | number;
  respondedAt: Date | string | number | null;
  peer: { id: string; name: string; email: string; displayName: string } | null;
};

export function ActiveLoanRow({
  loan,
  direction,
  headroomBytes,
}: {
  loan: ActiveLoan;
  direction: "lent" | "borrowed";
  headroomBytes?: number;
}) {
  const qc = useQueryClient();
  const giveBack = useMutation(trpc.budget.returnLoan.mutationOptions());
  const name =
    loan.peer?.displayName?.trim() ||
    loan.peer?.name ||
    loan.peer?.email?.split("@")[0] ||
    "someone";
  const since = loan.respondedAt ?? loan.createdAt;
  const isLent = direction === "lent";

  const canReturn =
    !isLent && headroomBytes !== undefined && headroomBytes >= loan.bytes;

  const doReturn = async () => {
    try {
      await giveBack.mutateAsync({ loanId: loan.id });
      toast.success(`Returned ${shortMB(loan.bytes)} to ${name}`);
      await qc.invalidateQueries({ queryKey: trpc.budget.get.queryKey() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Return failed");
    }
  };

  return (
    <LoanBanner
      tone={isLent ? "slime" : "slide"}
      label={`${isLent ? "lent · active" : "borrowed · active"} · since ${timeAgo(since)}`}
      peerName={name}
      prefix={isLent ? "is holding" : "is lending you"}
      bytes={loan.bytes}
      suffix={isLent ? "of yours" : undefined}
      meta={
        isLent
          ? "counts against your budget"
          : canReturn
            ? "extra headroom"
            : `need ${shortMB(loan.bytes)} free to return`
      }
      actions={
        !isLent ? (
          <button
            type="button"
            onClick={doReturn}
            disabled={!canReturn || giveBack.isPending}
            className="rounded-full bg-lego-dark hover:bg-lego-dark/90 px-5 py-1.5 font-mono text-xs font-bold text-chalkboard disabled:cursor-not-allowed disabled:opacity-40"
            title={canReturn ? undefined : "Free up space first"}
          >
            give back · {shortMB(loan.bytes)} ↓
          </button>
        ) : undefined
      }
    />
  );
}
