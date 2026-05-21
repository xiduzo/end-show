import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/admin/students")({
  component: AdminStudentsRoute,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: "/login" });
    const role = (session.data.user as { role?: string }).role;
    if (role !== "staff") throw redirect({ to: "/dashboard" });
    return { session };
  },
});

function AdminStudentsRoute() {
  const qc = useQueryClient();
  const list = useQuery(trpc.admin.listStudents.queryOptions());
  const setPub = useMutation(trpc.admin.setStudentPublished.mutationOptions());

  const onToggle = async (userId: string, next: boolean) => {
    try {
      await setPub.mutateAsync({ userId, isPublished: next });
      toast.success(next ? "Published" : "Unpublished");
      await qc.invalidateQueries({ queryKey: trpc.admin.listStudents.queryKey() });
      await qc.invalidateQueries({ queryKey: trpc.student.listEligible.queryKey() });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Toggle failed");
    }
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Admin · Students</h1>
        <Link to="/admin" className="text-sm text-blue-600 hover:underline">
          Pool view
        </Link>
      </div>

      {list.isLoading && <p className="mt-6">Loading…</p>}

      <ul className="mt-6 space-y-2">
        {list.data?.map((s) => (
          <li
            key={s.userId}
            className="flex items-center justify-between rounded-md border p-3 text-sm"
          >
            <div>
              <p className="font-medium">{s.displayName || s.name}</p>
              <p className="text-xs text-muted-foreground">{s.email}</p>
              {!s.hasProfile && (
                <p className="text-xs text-amber-600">no profile yet</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  s.isPublished
                    ? "bg-green-100 text-green-700"
                    : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {s.isPublished ? "published" : "draft"}
              </span>
              {s.hasProfile && (
                <button
                  type="button"
                  onClick={() => onToggle(s.userId, !s.isPublished)}
                  disabled={setPub.isPending}
                  className="rounded border px-2 py-0.5 text-xs hover:bg-zinc-50"
                >
                  {s.isPublished ? "unpublish" : "publish"}
                </button>
              )}
              <Link
                to="/admin/students/$userId"
                params={{ userId: s.userId }}
                className="rounded border px-2 py-0.5 text-xs hover:bg-zinc-50"
              >
                edit
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
