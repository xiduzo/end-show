import { Button } from "@end-show/ui/components/button";
import { Input } from "@end-show/ui/components/input";
import { Label } from "@end-show/ui/components/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

const FLOOR_BYTES = 20 * 1024 * 1024;

function parseMb(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 1024 * 1024);
}

export function BudgetTransferDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const peers = useQuery(trpc.student.listPeers.queryOptions());
  const budget = useQuery(trpc.asset.getBudget.queryOptions());
  const transfer = useMutation(trpc.budget.transfer.mutationOptions());

  const [toUserId, setToUserId] = useState("");
  const [mbInput, setMbInput] = useState("");

  const bytes = parseMb(mbInput);
  const senderEffectiveAfter =
    budget.data && bytes ? budget.data.effectiveBudgetBytes - bytes : null;
  const senderRemainingOk =
    budget.data && bytes ? budget.data.remainingBytes >= bytes : false;
  const floorOk = senderEffectiveAfter !== null ? senderEffectiveAfter >= FLOOR_BYTES : false;
  const canSubmit = Boolean(toUserId && bytes && senderRemainingOk && floorOk);

  const onSubmit = async () => {
    if (!toUserId || !bytes) return;
    try {
      await transfer.mutateAsync({ toUserId, bytes });
      toast.success("Transferred");
      await qc.invalidateQueries({ queryKey: trpc.asset.getBudget.queryKey() });
      await qc.invalidateQueries({ queryKey: trpc.budget.get.queryKey() });
      await qc.invalidateQueries({ queryKey: trpc.budget.myTransfers.queryKey() });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-lg border bg-background p-4 shadow-lg">
        <h2 className="text-lg font-bold">Gift storage</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Send some of your budget to a classmate. You must keep at least 20 MB.
        </p>

        <div className="mt-4 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="peer">Recipient</Label>
            <select
              id="peer"
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className="w-full rounded-md border bg-transparent p-2 text-sm"
            >
              <option value="">Select…</option>
              {peers.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.email})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="mb">Amount (MB)</Label>
            <Input
              id="mb"
              type="number"
              min="1"
              step="1"
              value={mbInput}
              onChange={(e) => setMbInput(e.target.value)}
              placeholder="50"
            />
            {bytes && !senderRemainingOk && (
              <p className="text-xs text-red-500">More than you have available.</p>
            )}
            {bytes && senderRemainingOk && !floorOk && (
              <p className="text-xs text-red-500">
                Would drop you below the 20 MB floor.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!canSubmit || transfer.isPending}>
            {transfer.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
