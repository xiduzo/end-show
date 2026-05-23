import { cn } from "@end-show/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";

const MAX_MB = 10;
const REASON_MAX = 140;

function shortMB(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  if (mb < 10) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb)} MB`;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function avatarColor(id: string): string {
  const palette = [
    "bg-slime",
    "bg-crayon",
    "bg-slide",
    "bg-bubblegum",
    "bg-lego",
  ];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length] ?? "bg-lego";
}

export function BorrowDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const peers = useQuery(trpc.budget.listCohortSpare.queryOptions());
  const request = useMutation(trpc.budget.requestLoan.mutationOptions());

  const [mb, setMb] = useState(3);
  const [reason, setReason] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const bytes = mb * 1024 * 1024;
  const selected = useMemo(
    () => peers.data?.find((p) => p.id === selectedId) ?? null,
    [peers.data, selectedId],
  );
  const eligibleCount = useMemo(
    () => peers.data?.filter((p) => p.spareBytes >= bytes).length ?? 0,
    [peers.data, bytes],
  );
  const peerLabel = (p: {
    displayName?: string;
    name: string;
    email: string;
  }) => p.displayName?.trim() || p.name || p.email.split("@")[0] || "";
  const filteredPeers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const all = peers.data ?? [];
    if (!q) return all;
    return all.filter((p) => {
      return (
        peerLabel(p).toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      );
    });
  }, [peers.data, filter]);

  const canSubmit =
    selected !== null && bytes > 0 && selected.spareBytes >= bytes;

  const onSubmit = async () => {
    if (!selected) return;
    try {
      await request.mutateAsync({
        fromUserId: selected.id,
        bytes,
        reason: reason.trim(),
      });
      toast.success("Request sent");
      await qc.invalidateQueries({ queryKey: trpc.budget.get.queryKey() });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Request failed");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-lego-dark/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-lg border-2 border-lego-dark bg-chalkboard shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[360px_1fr]">
          {/* Left: amount + why */}
          <div className="border-r border-lego-dark/15 p-6">
            <p className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase">
              how much do you need?
            </p>
            <p className="mt-2 font-display text-5xl font-bold tracking-tight">
              {mb}
              <span className="ml-1 align-baseline text-2xl text-lego-dark/50">
                MB
              </span>
            </p>
            <input
              type="range"
              min={1}
              max={MAX_MB}
              step={1}
              value={mb}
              onChange={(e) => setMb(Number(e.target.value))}
              className="mt-3 w-full accent-slide"
            />
            <div className="mt-1 flex justify-between font-mono text-xs text-lego-dark/50">
              <span>1 MB</span>
              <span>{MAX_MB} MB · max per request</span>
            </div>

            <p className="mt-6 font-mono text-xs tracking-widest text-lego-dark/60 uppercase">
              why? · they'll see this
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
              placeholder="my reel pushed over 60 mb — need 10 more so i can keep the long ending."
              rows={4}
              className="mt-2 w-full resize-none rounded-md border border-lego-dark/20 bg-white px-3 py-2 font-mono text-sm text-lego-dark placeholder:text-lego-dark/30 focus:border-lego focus:outline-none"
            />
            <div className="mt-1 flex justify-between font-mono text-xs text-lego-dark/40">
              <span>keep it short · they're busy</span>
              <span>
                {reason.length} / {REASON_MAX}
              </span>
            </div>
          </div>

          {/* Right: peer list */}
          <div className="p-6">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase">
                who has room? · sorted by spare
              </p>
              <p className="font-mono text-xs text-lego-dark/40">
                {eligibleCount} of {peers.data?.length ?? 0} have ≥ {mb} MB free
              </p>
            </div>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter by name…"
              className="mb-2 w-full rounded-md border border-lego-dark/20 bg-white px-3 py-1.5 font-mono text-xs text-lego-dark placeholder:text-lego-dark/30 focus:border-lego focus:outline-none"
            />
            <div className="max-h-[340px] space-y-1 overflow-y-auto pr-1">
              {peers.isLoading && (
                <p className="font-mono text-xs text-lego-dark/40">loading…</p>
              )}
              {!peers.isLoading && filteredPeers.length === 0 && (
                <p className="font-mono text-xs text-lego-dark/40">
                  {peers.data?.length === 0
                    ? "no other students yet"
                    : "no matches"}
                </p>
              )}
              {filteredPeers.map((p) => {
                const ok = p.spareBytes >= bytes;
                const after = p.effectiveBytes - bytes;
                const isSelected = selectedId === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => ok && setSelectedId(p.id)}
                    disabled={!ok}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
                      isSelected
                        ? "border-slide bg-slime/30"
                        : "border-lego-dark/15 hover:border-lego-dark/40 hover:bg-lego-dark/[0.03]",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold text-chalkboard",
                        avatarColor(p.id),
                      )}
                    >
                      {initials(peerLabel(p))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-sm font-bold text-lego-dark">
                        {peerLabel(p)}
                      </span>
                    </span>
                    <span
                      className="relative flex h-2 w-20 shrink-0 overflow-hidden rounded-full bg-lego-dark/10"
                      title={`${shortMB(p.usedBytes)} used · ${shortMB(p.floorBytes)} reserved floor · ${shortMB(p.spareBytes)} lendable · request ${shortMB(bytes)}`}
                    >
                      {(() => {
                        const total = Math.max(1, p.effectiveBytes);
                        const usedPct = Math.min(
                          100,
                          (p.usedBytes / total) * 100,
                        );
                        const floorPct = Math.min(
                          100 - usedPct,
                          (p.floorBytes / total) * 100,
                        );
                        const reqPct = Math.min(
                          100 - usedPct - floorPct,
                          (bytes / total) * 100,
                        );
                        return (
                          <>
                            <span
                              className="block h-full bg-lego-dark/40"
                              style={{ width: `${usedPct}%` }}
                            />
                            <span
                              className="block h-full bg-lego-dark/20 [background-image:repeating-linear-gradient(45deg,transparent_0_2px,rgba(0,0,0,0.15)_2px_4px)]"
                              style={{ width: `${floorPct}%` }}
                            />
                            <span
                              className={cn(
                                "block h-full",
                                !ok
                                  ? "bg-crayon/60"
                                  : isSelected
                                    ? "bg-slide"
                                    : "bg-lego-dark/60",
                              )}
                              style={{ width: `${reqPct}%` }}
                            />
                          </>
                        );
                      })()}
                    </span>
                    <span
                      className={cn(
                        "size-4 shrink-0 rounded-full border-2",
                        isSelected
                          ? "border-slide bg-slide"
                          : "border-lego-dark/30",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-lego-dark/15 bg-lego-dark/[0.03] px-6 py-3">
          <p className="font-mono text-xs text-lego-dark/60">
            {selected ? (
              <>
                asking{" "}
                <span className="font-bold text-lego-dark">
                  {peerLabel(selected)}
                </span>{" "}
                for <span className="font-bold text-lego-dark">{mb} MB</span>
              </>
            ) : (
              "pick someone above"
            )}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-lego-dark/30 px-4 py-1.5 font-mono text-xs hover:bg-lego-dark/5"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit || request.isPending}
              className="rounded-full bg-slide px-5 py-1.5 font-mono text-xs font-bold text-chalkboard disabled:opacity-40"
            >
              {request.isPending ? "sending…" : "send request ↑"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
