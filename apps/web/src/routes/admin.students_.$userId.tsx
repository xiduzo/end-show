import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { BudgetBar } from "@/features/loans";
import { CardEditor } from "@/features/stage";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/admin/students_/$userId")({
  component: AdminStudentEdit,
});

function AdminStudentEdit() {
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const data = useQuery(trpc.admin.getStudent.queryOptions({ userId }));
  const upsert = useMutation(trpc.admin.upsertStudent.mutationOptions());

  if (data.isLoading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6 font-mono text-sm">
        Loading…
      </div>
    );
  }
  if (!data.data) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6 text-red-500">
        Student not found.{" "}
        <Link to="/admin/students" className="underline">
          back
        </Link>
      </div>
    );
  }

  return (
    <>
      <CardEditor
        mode="staff"
        profile={{
          userId,
          displayName: data.data.displayName,
          pronouns: data.data.pronouns,
          introduction: data.data.introduction,
          link: data.data.link,
          competencies: data.data.competencies,
          stageColor: data.data.stageColor,
          track: data.data.track,
          portraitUrl: data.data.portraitUrl,
          workMediaUrl: data.data.workMediaUrl,
          workMediaKind: data.data.workMediaKind,
          name: data.data.name,
          email: data.data.email,
        }}
        budgetSlot={<BudgetBar userId={userId} readOnly />}
        onSave={async (draft) => {
          await upsert.mutateAsync({ userId, ...draft });
          await qc.invalidateQueries({
            queryKey: trpc.admin.getStudent.queryKey({ userId }),
          });
          await qc.invalidateQueries({
            queryKey: trpc.admin.listStudents.queryKey(),
          });
          await qc.invalidateQueries({
            queryKey: trpc.student.listEligible.queryKey(),
          });
        }}
        onAssetChanged={() => {
          qc.invalidateQueries({
            queryKey: trpc.admin.getStudent.queryKey({ userId }),
          });
          qc.invalidateQueries({
            queryKey: trpc.budget.get.queryKey({ userId }),
          });
        }}
      />
      <FlagFab
        userId={userId}
        name={data.data.displayName || data.data.name}
        isFlagged={data.data.isFlagged}
        flaggedReason={data.data.flaggedReason}
      />
    </>
  );
}

function FlagFab({
  userId,
  name,
  isFlagged,
  flaggedReason,
}: {
  userId: string;
  name: string;
  isFlagged: boolean;
  flaggedReason: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  const invalidate = async () => {
    await qc.invalidateQueries({
      queryKey: trpc.admin.getStudent.queryKey({ userId }),
    });
    await qc.invalidateQueries({
      queryKey: trpc.admin.listStudents.queryKey(),
    });
    await qc.invalidateQueries({
      queryKey: trpc.student.listEligible.queryKey(),
    });
  };

  const flag = useMutation(
    trpc.admin.flagStudents.mutationOptions({
      onSuccess: async () => {
        toast.success(`${name} flagged · emailed`);
        setReason("");
        setOpen(false);
        await invalidate();
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Could not flag"),
    }),
  );
  const unflag = useMutation(
    trpc.admin.unflagStudents.mutationOptions({
      onSuccess: async () => {
        toast.success(`${name} unflagged`);
        setOpen(false);
        await invalidate();
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Could not unflag"),
    }),
  );

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3 font-mono">
      {open && (
        <div className="w-80 overflow-hidden rounded-xl border border-ink/15 bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-2">
          {isFlagged ? (
            <>
              <div className="flex items-center gap-2 border-b border-bubblegum/40 bg-bubblegum/20 px-4 py-2.5">
                <span className="text-base leading-none">⚑</span>
                <span className="text-xs font-bold tracking-[0.2em] uppercase text-ink">
                  Flagged — hidden
                </span>
              </div>
              <div className="px-4 py-4">
                <p className="text-[0.65rem] tracking-[0.2em] uppercase text-ink/45">
                  Reason sent to {name}
                </p>
                <p className="mt-1 text-sm text-ink/85">{flaggedReason || "—"}</p>
                <button
                  type="button"
                  onClick={() => unflag.mutate({ userIds: [userId] })}
                  disabled={unflag.isPending}
                  className="mt-4 h-9 w-full rounded-full border border-ink/30 bg-white text-sm font-medium text-ink transition hover:border-ink/60 disabled:opacity-50"
                >
                  {unflag.isPending ? "unflagging…" : "unflag & restore"}
                </button>
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const r = reason.trim();
                if (r) flag.mutate({ userIds: [userId], reason: r });
              }}
            >
              <div className="flex items-center gap-2 border-b border-dashed border-ink/15 px-4 py-2.5">
                <span className="text-base leading-none text-ink/40">⚑</span>
                <span className="text-xs font-bold tracking-[0.2em] uppercase text-ink/70">
                  Flag this student
                </span>
              </div>
              <div className="px-4 py-4">
                <p className="text-xs text-ink/50">
                  Hides {name}&rsquo;s profile from the show and emails them the
                  reason.
                </p>
                <div className="relative mt-3">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    autoFocus
                    maxLength={500}
                    rows={3}
                    placeholder="Why is this profile being flagged?"
                    className="w-full resize-none rounded-lg border border-ink/20 bg-chalkboard/30 px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:border-ink/50 focus:bg-white focus:outline-none"
                  />
                  <span className="pointer-events-none absolute bottom-2 right-3 text-[0.65rem] tabular-nums text-ink/30">
                    {reason.trim().length}/500
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={flag.isPending || !reason.trim()}
                  className="mt-3 h-9 w-full rounded-full bg-slide text-sm font-medium text-white transition hover:bg-slide/90 disabled:opacity-40"
                >
                  {flag.isPending ? "flagging…" : "flag & notify"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={isFlagged ? "Flagged student" : "Flag student"}
        title={isFlagged ? "Flagged — hidden from the show" : "Flag student"}
        className={
          "flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-xl transition hover:scale-105 active:scale-95 " +
          (isFlagged
            ? "bg-bubblegum text-ink"
            : "bg-ink text-chalkboard hover:bg-ink/90")
        }
      >
        {open ? "✕" : "⚑"}
      </button>
    </div>
  );
}
