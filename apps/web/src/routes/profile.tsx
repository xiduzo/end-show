import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { BudgetBar } from "@/features/loans";
import { CardEditor } from "@/features/stage";
import {
  ActiveLoanRow,
  IncomingLoanRequest,
  OutgoingLoanRow,
} from "@/features/loans";
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
  const budget = useQuery(trpc.budget.get.queryOptions());
  const upsert = useMutation(trpc.student.upsertProfile.mutationOptions());

  if (profile.isLoading) {
    return (
      <div className="container mx-auto max-w-2xl px-4 py-6 font-mono text-sm">
        Loading…
      </div>
    );
  }

  const userId = profile.data?.userId ?? "self";
  const currentHeadroom = budget.data
    ? Math.max(0, budget.data.effectiveBudgetBytes - budget.data.usedBytes)
    : 0;

  return (
    <>
      <CardEditor
        mode="self"
        profile={{
          userId,
          displayName: profile.data?.displayName ?? "",
          pronouns: profile.data?.pronouns ?? "",
          introduction: profile.data?.introduction ?? "",
          link: profile.data?.link ?? "",
          competencies: profile.data?.competencies ?? [],
          stageColor: profile.data?.stageColor ?? null,
          portraitUrl: profile.data?.portraitUrl ?? null,
          workMediaUrl: profile.data?.workMediaUrl ?? null,
          workMediaKind: profile.data?.workMediaKind ?? null,
        }}
        budgetSlot={
          <div className="space-y-3">
            <BudgetBar />
            {budget.data?.incoming.map((loan) => (
              <IncomingLoanRequest
                key={loan.id}
                loan={loan}
                headroomAfterBytes={Math.max(0, currentHeadroom - loan.bytes)}
              />
            ))}
            {budget.data?.outgoing.map((loan) => (
              <OutgoingLoanRow
                key={loan.id}
                loan={{
                  id: loan.id,
                  bytes: loan.bytes,
                  reason: loan.reason,
                  createdAt: loan.createdAt,
                  lender: loan.lender,
                }}
              />
            ))}
            {budget.data?.activeLent.map((loan) => (
              <ActiveLoanRow
                key={loan.id}
                direction="lent"
                loan={{
                  id: loan.id,
                  bytes: loan.bytes,
                  createdAt: loan.createdAt,
                  respondedAt: loan.respondedAt,
                  peer: loan.borrower,
                }}
              />
            ))}
            {budget.data?.activeBorrowed.map((loan) => (
              <ActiveLoanRow
                key={loan.id}
                direction="borrowed"
                headroomBytes={currentHeadroom}
                loan={{
                  id: loan.id,
                  bytes: loan.bytes,
                  createdAt: loan.createdAt,
                  respondedAt: loan.respondedAt,
                  peer: loan.lender,
                }}
              />
            ))}
          </div>
        }
        onSave={async (draft) => {
          await upsert.mutateAsync(draft);
          await qc.invalidateQueries({
            queryKey: trpc.student.getMyProfile.queryKey(),
          });
          await qc.invalidateQueries({
            queryKey: trpc.student.listEligible.queryKey(),
          });
        }}
        onAssetChanged={() => {
          qc.invalidateQueries({
            queryKey: trpc.student.getMyProfile.queryKey(),
          });
          qc.invalidateQueries({ queryKey: trpc.budget.get.queryKey() });
          qc.invalidateQueries({ queryKey: trpc.asset.getBudget.queryKey() });
          qc.invalidateQueries({ queryKey: trpc.asset.listMine.queryKey() });
        }}
      />
    </>
  );
}
