import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

import { LoanBanner } from "./loan-banner";
import { timeAgo } from "./loan-helpers";

export type OutgoingLoan = {
  id: string;
  bytes: number;
  reason: string;
  createdAt: Date | string | number;
  lender: { id: string; name: string; email: string; displayName: string } | null;
};

export function OutgoingLoanRow({ loan }: { loan: OutgoingLoan }) {
  const qc = useQueryClient();
  const cancel = useMutation(trpc.budget.cancel.mutationOptions());
  const name =
    loan.lender?.displayName?.trim() ||
    loan.lender?.name ||
    loan.lender?.email?.split("@")[0] ||
    "someone";

  const doCancel = async () => {
    try {
      await cancel.mutateAsync({ loanId: loan.id });
      toast.success("Request cancelled");
      await qc.invalidateQueries({ queryKey: trpc.budget.get.queryKey() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    }
  };

  return (
    <LoanBanner
      tone="neutral"
      label={`outgoing request · ${timeAgo(loan.createdAt)}`}
      peerName={name}
      prefix="hasn't answered yet for"
      bytes={loan.bytes}
      reason={loan.reason || undefined}
      meta="waiting for response"
      actions={
        <button
          type="button"
          onClick={doCancel}
          disabled={cancel.isPending}
          className="rounded-full border border-lego-dark/30 px-4 py-1.5 font-mono text-xs hover:bg-lego-dark/5 disabled:opacity-40"
        >
          cancel
        </button>
      }
    />
  );
}
