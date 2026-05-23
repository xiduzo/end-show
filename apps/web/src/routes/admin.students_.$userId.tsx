import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { BudgetBar } from "@/features/loans";
import {
  ActiveLoanRow,
  IncomingLoanRequest,
  OutgoingLoanRow,
} from "@/features/loans";
import { CardEditor } from "@/features/stage";
import { trpc } from "@/lib/trpc";

export const Route = createFileRoute("/admin/students_/$userId")({
  component: AdminStudentEdit,
});

function AdminStudentEdit() {
  const { userId } = Route.useParams();
  const qc = useQueryClient();
  const data = useQuery(trpc.admin.getStudent.queryOptions({ userId }));
  const budget = useQuery(trpc.budget.get.queryOptions({ userId }));
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

  const currentHeadroom = budget.data
    ? Math.max(0, budget.data.effectiveBudgetBytes - budget.data.usedBytes)
    : 0;

  return (
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
        portraitUrl: data.data.portraitUrl,
        workMediaUrl: data.data.workMediaUrl,
        workMediaKind: data.data.workMediaKind,
        name: data.data.name,
        email: data.data.email,
      }}
      budgetSlot={
        <div className="space-y-3">
          <BudgetBar userId={userId} readOnly />
          {budget.data?.incoming.map((loan) => (
            <IncomingLoanRequest
              key={loan.id}
              loan={loan}
              headroomAfterBytes={Math.max(0, currentHeadroom - loan.bytes)}
              readOnly
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
              readOnly
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
              readOnly
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
              readOnly
            />
          ))}
        </div>
      }
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
  );
}
