import { cn } from "@end-show/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { ActiveLoanRow } from "./active-loan-row";
import { BorrowDialog } from "./borrow-dialog";
import { IncomingLoanRequest } from "./incoming-loan-request";
import { trpc } from "@/lib/trpc";

function formatMB(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}

const PEER_PALETTE = ["bg-slime", "bg-crayon", "bg-bubblegum"] as const;

function peerColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return PEER_PALETTE[Math.abs(h) % PEER_PALETTE.length] ?? "bg-slime";
}

function vibeBg(c: string | null | undefined, fallbackId: string): string {
  if (c === "slime") return "bg-slime";
  if (c === "crayon") return "bg-crayon";
  if (c === "bubblegum") return "bg-bubblegum";
  return peerColor(fallbackId);
}

function peerName(p: {
  displayName?: string | null;
  name?: string | null;
  email?: string | null;
}): string {
  return (
    p.displayName?.trim() || p.name?.trim() || p.email?.split("@")[0] || "peer"
  );
}

export function BudgetBar({
  userId,
  readOnly = false,
}: {
  userId?: string;
  readOnly?: boolean;
} = {}) {
  const qc = useQueryClient();
  const budget = useQuery(
    trpc.budget.get.queryOptions(userId ? { userId } : undefined),
  );
  const assets = useQuery({
    ...trpc.asset.listMine.queryOptions(),
    enabled: !userId,
  });
  const cancel = useMutation(trpc.budget.cancel.mutationOptions());
  const [borrowOpen, setBorrowOpen] = useState(false);

  const onCancel = async (loanId: string) => {
    try {
      await cancel.mutateAsync({ loanId });
      toast.success("Request cancelled");
      await qc.invalidateQueries({ queryKey: trpc.budget.get.queryKey() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    }
  };

  if (!budget.data) {
    return (
      <div className="mx-auto mt-6 container rounded-lg border-2 border-lego-dark/15 bg-white px-6 py-5 font-mono text-xs text-lego-dark/50">
        loading budget…
      </div>
    );
  }

  const {
    defaultBytes,
    transferredOutBytes,
    transferredInBytes,
    effectiveBudgetBytes,
    usedBytes,
    activeBorrowed,
    activeLent,
    outgoing,
  } = budget.data;

  const ownCap = Math.max(0, defaultBytes - transferredOutBytes);
  const borrowedBytes = transferredInBytes;
  const pendingBytes = outgoing.reduce((s, l) => s + l.bytes, 0);

  // The bar's visual scale fits everything: full default budget (incl. lent-out
  // blocked region) + borrowed runway + pending. If used somehow exceeds even
  // that, we extend the scale to fit used too.
  const scale = Math.max(
    defaultBytes + borrowedBytes + pendingBytes,
    usedBytes,
    1,
  );
  const ownCapPct = (ownCap / scale) * 100;
  const blockedPct = (transferredOutBytes / scale) * 100;
  const capPct = (defaultBytes / scale) * 100;
  const usedPct = Math.min(100, (usedBytes / scale) * 100);
  const pctOfEffective =
    effectiveBudgetBytes > 0
      ? Math.round((usedBytes / effectiveBudgetBytes) * 100)
      : 0;

  const overBytes = Math.max(0, usedBytes - effectiveBudgetBytes);
  const headroom = Math.max(0, effectiveBudgetBytes - usedBytes);

  const tone =
    pctOfEffective < 60
      ? { word: "plenty of room", cls: "text-lego-dark/60" }
      : pctOfEffective < 85
        ? { word: "filling up", cls: "text-lego-dark/70" }
        : pctOfEffective < 100
          ? { word: "nearly full", cls: "text-crayon" }
          : { word: "over · borrow or trim", cls: "text-slide" };

  return (
    <>
      <div className="mx-auto mt-6 container rounded-lg border-2 border-lego-dark/30 bg-white py-5">
        <div className="px-6">
          <div className="flex items-baseline justify-between gap-4">
            <p className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase">
              storage budget
            </p>
            <p className="font-display text-3xl font-bold tracking-tight">
              {formatMB(usedBytes)}
              <span className="text-lego-dark/40">
                {" "}
                / {formatMB(defaultBytes)}
              </span>
            </p>
          </div>

          {/* phantom-extension bar */}
          <div
            className={cn(
              "relative mt-3 h-6 w-full overflow-hidden rounded-full border-2 bg-lego-dark/5 transition-colors",
              overBytes > 0 ? "border-slide" : "border-lego-dark/20",
            )}
          >
            {/* blocked-by-lend overlay: stacked per-borrower segments between own usable cap and full default */}
            {transferredOutBytes > 0 && activeLent.length > 0 && (
              <div
                className="absolute inset-y-0 flex overflow-hidden border-x-2 border-slide/70"
                style={{ left: `${ownCapPct}%`, width: `${blockedPct}%` }}
                title={`${formatMB(transferredOutBytes)} lent out — locked until returned`}
              >
                {activeLent.map((loan) => {
                  const w = (loan.bytes / transferredOutBytes) * 100;
                  const id = loan.borrower?.id ?? loan.id;
                  const name = peerName(loan.borrower ?? {});
                  const vibe = (
                    loan.borrower as { stageColor?: string | null } | null
                  )?.stageColor;
                  return (
                    <div
                      key={loan.id}
                      title={`${name} holds ${formatMB(loan.bytes)} — locked until returned`}
                      className={cn(
                        "h-full border-r border-white/40",
                        vibeBg(vibe, id),
                        "[background-image:repeating-linear-gradient(45deg,rgba(0,0,0,0.45)_0_3px,transparent_3px_8px)]",
                      )}
                      style={{ width: `${w}%` }}
                    />
                  );
                })}
              </div>
            )}

            {/* striped borrowed runway, one segment per lender */}
            {activeBorrowed.length > 0 && (
              <div
                className="absolute inset-y-0 flex"
                style={{
                  left: `${capPct}%`,
                  width: `${(borrowedBytes / scale) * 100}%`,
                }}
              >
                {activeBorrowed.map((loan) => {
                  const w = (loan.bytes / borrowedBytes) * 100;
                  const id = loan.lender?.id ?? loan.id;
                  const vibe = (
                    loan.lender as { stageColor?: string | null } | null
                  )?.stageColor;
                  return (
                    <div
                      key={loan.id}
                      title={`${peerName(loan.lender ?? {})} lent ${formatMB(loan.bytes)}`}
                      className={cn(
                        "h-full border-r border-white/40 opacity-80",
                        vibeBg(vibe, id),
                        "[background-image:repeating-linear-gradient(45deg,transparent_0_4px,rgba(255,255,255,0.4)_4px_8px)]",
                      )}
                      style={{ width: `${w}%` }}
                    />
                  );
                })}
              </div>
            )}

            {/* pending borrow requests — dashed ghost past borrowed runway */}
            {pendingBytes > 0 && (
              <div
                className="absolute inset-y-0 border-l-2 border-dashed border-lego-dark/40 bg-lego-dark/10"
                style={{
                  left: `${capPct + (borrowedBytes / scale) * 100}%`,
                  width: `${(pendingBytes / scale) * 100}%`,
                }}
                title={`${formatMB(pendingBytes)} pending — awaiting peer approval`}
              />
            )}

            {/* used fill: portrait (lego-dark) + work (slide) when we know the breakdown */}
            {(() => {
              const list = assets.data ?? [];
              const portraitBytes = list
                .filter((a) => a.kind === "portrait")
                .reduce((s, a) => s + a.bytes, 0);
              const workBytes = list
                .filter((a) => a.kind !== "portrait")
                .reduce((s, a) => s + a.bytes, 0);
              const haveBreakdown =
                !userId && list.length > 0 && portraitBytes + workBytes > 0;

              if (!haveBreakdown) {
                return (
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 transition-all",
                      overBytes > 0 ? "bg-slide" : "bg-lego-dark",
                    )}
                    style={{ width: `${usedPct}%` }}
                  />
                );
              }

              const portraitW = (portraitBytes / scale) * 100;
              const workW = (workBytes / scale) * 100;
              return (
                <>
                  {portraitBytes > 0 && (
                    <div
                      className="absolute inset-y-0 bg-lego-dark transition-all"
                      style={{ left: 0, width: `${portraitW}%` }}
                      title={`portrait · ${formatMB(portraitBytes)}`}
                    />
                  )}
                  {workBytes > 0 && (
                    <div
                      className="absolute inset-y-0 bg-slide transition-all"
                      style={{
                        left: `${portraitW}%`,
                        width: `${workW}%`,
                      }}
                      title={`work · ${formatMB(workBytes)}`}
                    />
                  )}
                </>
              );
            })()}

            {/* hard cap line */}
            <div
              className="absolute inset-y-0 w-[2px] bg-lego-dark"
              style={{ left: `${capPct}%` }}
            />
          </div>

          {/* legend row: tone */}
          <div className="mt-1 flex justify-end font-mono text-xs">
            <span className={tone.cls}>
              {overBytes > 0
                ? `over by ${formatMB(overBytes)} · ${tone.word}`
                : `${formatMB(headroom)} headroom · ${tone.word}`}
            </span>
          </div>

          {/* lender chips + borrow CTA */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {budget.data.incoming.map((loan) => (
              <IncomingLoanRequest
                key={loan.id}
                loan={loan}
                headroomAfterBytes={Math.max(0, headroom - loan.bytes)}
                readOnly={readOnly}
              />
            ))}

            {activeBorrowed.map((loan) => (
              <ActiveLoanRow
                key={loan.id}
                direction="borrowed"
                headroomBytes={headroom}
                readOnly={readOnly}
                loan={{
                  id: loan.id,
                  bytes: loan.bytes,
                  createdAt: loan.createdAt,
                  respondedAt: loan.respondedAt,
                  peer: loan.lender,
                }}
              />
            ))}

            {budget.data.activeLent.map((loan) => (
              <ActiveLoanRow
                key={loan.id}
                direction="lent"
                readOnly={readOnly}
                loan={{
                  id: loan.id,
                  bytes: loan.bytes,
                  createdAt: loan.createdAt,
                  respondedAt: loan.respondedAt,
                  peer: loan.borrower,
                }}
              />
            ))}

            {outgoing.map((loan) => {
              const name = peerName(loan.lender ?? {});
              const portrait = (
                loan.lender as { portraitUrl?: string | null } | null
              )?.portraitUrl;
              const pending =
                cancel.isPending && cancel.variables?.loanId === loan.id;
              return (
                <button
                  type="button"
                  key={loan.id}
                  onClick={() => onCancel(loan.id)}
                  disabled={readOnly || pending}
                  title={`Asked ${name} for ${formatMB(loan.bytes)} — click to cancel`}
                  className="group flex items-center gap-2 rounded-full border border-dashed border-lego-dark/30 bg-lego-dark/[0.03] px-2 py-1 font-mono text-xs text-lego-dark/60 hover:border-slide hover:text-slide disabled:opacity-40"
                >
                  {portrait ? (
                    <img
                      src={portrait}
                      alt=""
                      className="size-5 shrink-0 rounded-full object-cover opacity-80 group-hover:opacity-100"
                    />
                  ) : (
                    <span className="size-2 rounded-full bg-lego-dark/40 animate-pulse group-hover:bg-slide" />
                  )}
                  <span>asked {name}</span>
                  <span className="text-lego-dark/40 group-hover:text-slide/70">
                    +{formatMB(loan.bytes)}
                  </span>
                  <span
                    aria-label="cancel"
                    className="ml-1 text-lego-dark/40 group-hover:text-slide"
                  >
                    {pending ? "…" : "×"}
                  </span>
                </button>
              );
            })}

            {!readOnly &&
              (() => {
                const max = budget.data.maxActiveBorrows;
                const count = activeBorrowed.length + outgoing.length;
                const atLimit = count >= max;
                return (
                  <button
                    type="button"
                    onClick={() => setBorrowOpen(true)}
                    disabled={atLimit}
                    title={
                      atLimit
                        ? `Max ${max} borrows reached — cancel or return one first`
                        : `${count} of ${max} borrows used`
                    }
                    className="ml-auto rounded-full border-2 border-lego-dark px-4 py-1.5 font-mono text-xs font-bold text-lego-dark hover:bg-lego-dark hover:text-chalkboard disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-lego-dark"
                  >
                    {atLimit
                      ? `at limit (${count}/${max})`
                      : count > 0
                        ? `borrow more →`
                        : "I need more →"}
                  </button>
                );
              })()}
          </div>
        </div>
      </div>

      {!readOnly && borrowOpen && (
        <BorrowDialog onClose={() => setBorrowOpen(false)} />
      )}
    </>
  );
}
