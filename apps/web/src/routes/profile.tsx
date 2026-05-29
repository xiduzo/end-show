import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { BudgetBar } from "@/features/loans";
import { CardEditor } from "@/features/stage";
import { authClient } from "@/features/auth";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/profile")({
  component: ProfileRoute,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({ to: "/login" });
    }
    return { session };
  },
});

function ProfileRoute() {
  const qc = useQueryClient();
  const profile = useQuery(trpc.student.getMyProfile.queryOptions());
  const upsert = useMutation(trpc.student.upsertProfile.mutationOptions());

  if (profile.isLoading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6 font-mono text-sm">
        Loading…
      </div>
    );
  }

  const userId = profile.data?.userId ?? "self";

  const sharedProfile = {
    userId,
    displayName: profile.data?.displayName ?? "",
    pronouns: profile.data?.pronouns ?? "",
    introduction: profile.data?.introduction ?? "",
    link: profile.data?.link ?? "",
    competencies: profile.data?.competencies ?? [],
    stageColor: profile.data?.stageColor ?? null,
    track: profile.data?.track ?? "IxD",
    portraitUrl: profile.data?.portraitUrl ?? null,
    workMediaUrl: profile.data?.workMediaUrl ?? null,
    workMediaKind: profile.data?.workMediaKind ?? null,
  };

  const onSave = async (draft: Parameters<typeof upsert.mutateAsync>[0]) => {
    await upsert.mutateAsync(draft);
    await qc.invalidateQueries({
      queryKey: trpc.student.getMyProfile.queryKey(),
    });
    await qc.invalidateQueries({
      queryKey: trpc.student.listEligible.queryKey(),
    });
  };

  const onAssetChanged = () => {
    qc.invalidateQueries({
      queryKey: trpc.student.getMyProfile.queryKey(),
    });
    qc.invalidateQueries({ queryKey: trpc.budget.get.queryKey() });
    qc.invalidateQueries({ queryKey: trpc.asset.getBudget.queryKey() });
    qc.invalidateQueries({ queryKey: trpc.asset.listMine.queryKey() });
  };

  const budgetSlot = <BudgetBar />;

  return (
    <>
      <CardEditor
        mode="self"
        profile={sharedProfile}
        budgetSlot={budgetSlot}
        onSave={onSave}
        onAssetChanged={onAssetChanged}
      />
      {profile.data?.isFlagged && (
        <FlaggedFab
          reason={profile.data.flaggedReason}
          reviewRequest={profile.data.reviewRequest}
        />
      )}
    </>
  );
}

function FlaggedFab({
  reason,
  reviewRequest,
}: {
  reason: string;
  reviewRequest: "none" | "pending" | "denied";
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [message, setMessage] = useState("");

  const request = useMutation(
    trpc.student.requestReview.mutationOptions({
      onSuccess: async () => {
        toast.success("Re-review requested · staff notified");
        setMessage("");
        await qc.invalidateQueries({
          queryKey: trpc.student.getMyProfile.queryKey(),
        });
      },
      onError: (err) =>
        toast.error(
          err instanceof Error ? err.message : "Could not send request",
        ),
    }),
  );

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 font-mono">
      {open && (
        <div className="w-80 overflow-hidden rounded-xl border border-bubblegum/40 bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 border-b border-bubblegum/40 bg-bubblegum/20 px-4 py-2.5">
            <span className="text-base leading-none">⚑</span>
            <span className="text-xs font-bold tracking-[0.2em] uppercase text-ink">
              Profile hidden
            </span>
          </div>
          <div className="px-4 py-4">
            <p className="text-[0.65rem] tracking-[0.2em] uppercase text-ink/45">
              Why it was flagged
            </p>
            <p className="mt-1 text-sm text-ink/85">{reason || "—"}</p>

            {reviewRequest === "pending" ? (
              <p className="mt-4 rounded-lg bg-slime/20 px-3 py-2.5 text-xs text-ink/70">
                Your re-review request was sent. You&rsquo;ll be emailed once
                staff decide.
              </p>
            ) : reviewRequest === "denied" ? (
              <p className="mt-4 rounded-lg bg-ink/5 px-3 py-2.5 text-xs text-ink/70">
                Your re-review request was declined. Please reach out to staff
                directly.
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  request.mutate({ message: message.trim() });
                }}
              >
                <p className="mt-4 text-xs text-ink/50">
                  Fixed it? Ask a staff member to take another look.
                </p>
                <div className="relative mt-3">
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={500}
                    rows={3}
                    placeholder="What did you change? (optional)"
                    className="w-full resize-none rounded-lg border border-ink/20 bg-chalkboard/30 px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-ink/50 focus:bg-white focus:outline-none"
                  />
                  <span className="pointer-events-none absolute bottom-2 right-3 text-[0.65rem] tabular-nums text-ink/30">
                    {message.trim().length}/500
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={request.isPending}
                  className="mt-3 h-9 w-full rounded-full bg-slide text-sm font-medium text-white transition hover:bg-slide/90 disabled:opacity-40"
                >
                  {request.isPending ? "sending…" : "request re-review"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Profile flagged"
        title="Your profile is flagged — hidden from the show"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-bubblegum text-2xl text-ink shadow-xl transition hover:scale-105 active:scale-95"
      >
        {open ? "✕" : "⚑"}
      </button>
    </div>
  );
}
