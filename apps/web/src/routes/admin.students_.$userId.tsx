import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

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
  );
}
