import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";

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
    <CardEditor
      mode="self"
      profile={sharedProfile}
      budgetSlot={budgetSlot}
      onSave={onSave}
      onAssetChanged={onAssetChanged}
    />
  );
}
