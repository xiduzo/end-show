import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

import { initials, shortMB, timeAgo } from "./loan-helpers";

export type IncomingLoan = {
  id: string;
  bytes: number;
  reason: string;
  createdAt: Date | string | number;
  borrower: {
    id: string;
    name: string;
    email: string;
    displayName: string;
    portraitUrl?: string | null;
    stageColor?: "slime" | "crayon" | "bubblegum" | null;
  } | null;
};

function stageRing(c: "slime" | "crayon" | "bubblegum" | null | undefined): string {
  if (c === "slime") return "ring-slime";
  if (c === "crayon") return "ring-crayon";
  if (c === "bubblegum") return "ring-bubblegum";
  return "ring-crayon";
}
function stageBg(c: "slime" | "crayon" | "bubblegum" | null | undefined): string {
  if (c === "slime") return "bg-slime";
  if (c === "crayon") return "bg-crayon";
  if (c === "bubblegum") return "bg-bubblegum";
  return "bg-crayon";
}
function stageDarkText(c: "slime" | "crayon" | "bubblegum" | null | undefined): string {
  if (c === "slime") return "text-slime-dark";
  if (c === "crayon") return "text-crayon-dark";
  if (c === "bubblegum") return "text-bubblegum-dark";
  return "text-crayon-dark";
}

export function IncomingLoanRequest({
  loan,
  headroomAfterBytes,
  readOnly = false,
}: {
  loan: IncomingLoan;
  headroomAfterBytes: number;
  readOnly?: boolean;
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

  const pendingResp = respond.isPending;

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-crayon bg-crayon/15 px-2 py-1 font-mono text-xs text-lego-dark"
      title={`${name} wants ${shortMB(loan.bytes)} · ${timeAgo(loan.createdAt)}${loan.reason ? ` — "${loan.reason}"` : ""} · headroom after: ${shortMB(headroomAfterBytes)}`}
    >
      {loan.borrower?.portraitUrl ? (
        <img
          src={loan.borrower.portraitUrl}
          alt=""
          className={`size-6 shrink-0 rounded-full object-cover ring-2 ${stageRing(loan.borrower?.stageColor)}`}
        />
      ) : (
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-full font-bold text-chalkboard ${stageBg(loan.borrower?.stageColor)}`}
        >
          {initials(name)}
        </span>
      )}
      <span>
        <span className="font-bold">{name}</span>{" "}
        <span className="text-lego-dark/60">wants</span>
      </span>
      <span
        className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${stageBg(loan.borrower?.stageColor)} ${stageDarkText(loan.borrower?.stageColor)}`}
      >
        +{shortMB(loan.bytes)}
      </span>
      {!readOnly && (
        <span className="ml-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => doRespond(false)}
            disabled={pendingResp}
            aria-label="decline"
            title="decline"
            className="flex size-5 items-center justify-center rounded-full border border-lego-dark/30 bg-white text-lego-dark/70 hover:border-lego-dark hover:text-lego-dark disabled:opacity-40"
          >
            ×
          </button>
          <button
            type="button"
            onClick={() => doRespond(true)}
            disabled={pendingResp}
            aria-label={`accept · lend ${shortMB(loan.bytes)}`}
            title={`accept · lend ${shortMB(loan.bytes)}`}
            className="flex size-5 items-center justify-center rounded-full bg-slide text-[11px] font-bold text-chalkboard hover:brightness-110 disabled:opacity-40"
          >
            ✓
          </button>
        </span>
      )}
    </span>
  );
}
