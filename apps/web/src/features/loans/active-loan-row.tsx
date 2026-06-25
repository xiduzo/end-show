import { cn } from "@end-show/ui/lib/utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

import { initials, shortMB, timeAgo } from "./loan-helpers";

const PEER_PALETTE = ["bg-slime", "bg-crayon", "bg-bubblegum"] as const;
function peerColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PEER_PALETTE[Math.abs(h) % PEER_PALETTE.length] ?? "bg-slime";
}

export type ActiveLoan = {
  id: string;
  bytes: number;
  createdAt: Date | string | number;
  respondedAt: Date | string | number | null;
  peer: {
    id: string;
    name: string;
    email: string;
    displayName: string;
    portraitUrl?: string | null;
    stageColor?: "slime" | "crayon" | "bubblegum" | null;
  } | null;
};

function stageBg(c: "slime" | "crayon" | "bubblegum" | null | undefined): string | null {
  if (c === "slime") return "bg-slime";
  if (c === "crayon") return "bg-crayon";
  if (c === "bubblegum") return "bg-bubblegum";
  return null;
}
function stageRing(c: "slime" | "crayon" | "bubblegum" | null | undefined): string | null {
  if (c === "slime") return "ring-slime";
  if (c === "crayon") return "ring-crayon";
  if (c === "bubblegum") return "ring-bubblegum";
  return null;
}
function stageBorder(c: "slime" | "crayon" | "bubblegum" | null | undefined): string | null {
  if (c === "slime") return "border-slime/70";
  if (c === "crayon") return "border-crayon/70";
  if (c === "bubblegum") return "border-bubblegum/70";
  return null;
}
function stageDarkText(c: "slime" | "crayon" | "bubblegum" | null | undefined): string | null {
  if (c === "slime") return "text-slime-dark";
  if (c === "crayon") return "text-crayon-dark";
  if (c === "bubblegum") return "text-bubblegum-dark";
  return null;
}

export function ActiveLoanRow({
  loan,
  direction,
  headroomBytes,
  readOnly = false,
}: {
  loan: ActiveLoan;
  direction: "lent" | "borrowed";
  headroomBytes?: number;
  readOnly?: boolean;
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

  const peerId = loan.peer?.id ?? loan.id;
  const meta = isLent
    ? "counts against your budget"
    : canReturn
      ? "extra headroom"
      : `need ${shortMB(loan.bytes)} free to return`;
  const verb = isLent ? "holds" : "lent you";
  const tooltip = `${name} ${verb} ${shortMB(loan.bytes)} · since ${timeAgo(since)} · ${meta}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border bg-white px-2 py-1 font-mono text-xs",
        stageBorder(loan.peer?.stageColor) ??
          (isLent ? "border-slime/70" : "border-slide/60"),
      )}
      title={tooltip}
    >
      {loan.peer?.portraitUrl ? (
        <img
          src={loan.peer.portraitUrl}
          alt=""
          crossOrigin="anonymous"
          className={cn(
            "size-6 shrink-0 rounded-full object-cover ring-2",
            stageRing(loan.peer?.stageColor) ?? (isLent ? "ring-slime" : "ring-slide"),
          )}
        />
      ) : (
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full font-bold text-chalkboard",
            stageBg(loan.peer?.stageColor) ?? peerColor(peerId),
          )}
        >
          {initials(name)}
        </span>
      )}
      <span className="text-lego-dark">{name}</span>
      <span className="text-lego-dark/50">{isLent ? "holds" : "lent"}</span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[11px] font-bold",
          stageBg(loan.peer?.stageColor) ?? (isLent ? "bg-slime" : "bg-slide"),
          stageDarkText(loan.peer?.stageColor) ?? "text-chalkboard",
        )}
      >
        {isLent ? "−" : "+"}
        {shortMB(loan.bytes)}
      </span>
      {!isLent && !readOnly && (
        <button
          type="button"
          onClick={doReturn}
          disabled={!canReturn || giveBack.isPending}
          aria-label={`give back ${shortMB(loan.bytes)}`}
          title={canReturn ? `give back · ${shortMB(loan.bytes)}` : "Free up space first"}
          className="ml-1 flex size-5 items-center justify-center rounded-full bg-lego-dark text-[11px] font-bold text-chalkboard disabled:cursor-not-allowed disabled:opacity-40"
        >
          ↓
        </button>
      )}
    </span>
  );
}
