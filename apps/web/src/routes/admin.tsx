import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
  beforeLoad: async () => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: "/login" });
    const role = (session.data.user as { role?: string }).role;
    if (role !== "staff") throw redirect({ to: "/" });
    return { session };
  },
});

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function AdminRoute() {
  const pool = useQuery(trpc.admin.poolSummary.queryOptions());

  if (pool.isLoading) {
    return <div className="container mx-auto max-w-3xl px-4 py-6">Loading…</div>;
  }
  if (!pool.data) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-6 text-red-500">
        Failed to load pool data.
      </div>
    );
  }

  const pct =
    (pool.data.totalUsedBytes / Math.max(1, pool.data.poolDisplayedBytes)) * 100;
  const over = pool.data.totalUsedBytes > pool.data.poolDisplayedBytes;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Admin · Storage pool</h1>
        <Link
          to="/admin/students"
          className="text-sm text-blue-600 hover:underline"
        >
          Edit students →
        </Link>
      </div>

      <div className="mt-6 rounded-lg border p-4">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">Pool</span>
          <span className="text-sm text-muted-foreground">
            {formatBytes(pool.data.totalUsedBytes)} /{" "}
            {formatBytes(pool.data.poolDisplayedBytes)} (
            {formatBytes(pool.data.poolPhysicalBytes)} physical)
          </span>
        </div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full ${
              over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-zinc-500"
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      </div>

      <h2 className="mt-8 text-lg font-bold">Per student</h2>
      <ul className="mt-3 space-y-2">
        {pool.data.perStudent.map((s) => {
          const studentPct =
            (s.usedBytes / Math.max(1, pool.data!.poolDisplayedBytes)) * 100;
          return (
            <li key={s.userId} className="rounded-md border p-3 text-sm">
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="font-medium">{s.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">{s.email}</span>
                </div>
                <span className="text-xs">
                  {formatBytes(s.usedBytes)}
                  <span
                    className={`ml-2 rounded px-1.5 py-0.5 text-[10px] ${
                      s.isPublished
                        ? "bg-green-100 text-green-700"
                        : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {s.isPublished ? "published" : "draft"}
                  </span>
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full bg-zinc-500"
                  style={{ width: `${Math.min(100, studentPct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
