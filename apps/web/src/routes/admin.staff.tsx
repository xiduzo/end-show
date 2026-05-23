import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { TopBar } from "@/shell";
import { trpc } from "@/lib/trpc";
import { cn } from "@end-show/ui/lib/utils";

export const Route = createFileRoute("/admin/staff")({
  component: AdminStaffRoute,
});

function AdminStaffRoute() {
  const qc = useQueryClient();
  const list = useQuery(trpc.admin.listStaff.queryOptions());
  const createStaff = useMutation(
    trpc.admin.createStaff.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({
          queryKey: trpc.admin.listStaff.queryKey(),
        });
      },
    }),
  );
  const removeStaff = useMutation(
    trpc.admin.removeStaff.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({
          queryKey: trpc.admin.listStaff.queryKey(),
        });
      },
    }),
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  const rows = list.data ?? [];

  const closeInvite = () => {
    setInviteOpen(false);
    setInviteName("");
    setInviteEmail("");
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = inviteName.trim();
    const email = inviteEmail.trim();
    if (!name || !email) return;
    try {
      await createStaff.mutateAsync({ name, email });
      toast.success(`${name} added as staff`);
      closeInvite();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add staff");
    }
  };

  const handleRemove = async (userId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from staff?`)) return;
    try {
      await removeStaff.mutateAsync({ userIds: [userId] });
      toast.success(`${name} removed`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not remove staff",
      );
    }
  };

  return (
    <div className="min-h-screen bg-chalkboard text-ink">
      <TopBar crumbs={[{ label: "admin" }, { label: "staff" }]} />
      <div className="container mx-auto py-10 font-mono">
        <AdminTabs current="staff" />

        <div className="mt-6 flex items-center justify-end">
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="h-9 rounded-full border border-ink/20 bg-white px-4 text-sm font-medium hover:border-ink/40"
          >
            + add staff
          </button>
        </div>

        <div className="mt-6 overflow-x-auto rounded-lg border border-ink/15 bg-white">
          <div className="grid min-w-[640px] grid-cols-[minmax(180px,1.6fr)_minmax(220px,2fr)_minmax(120px,1fr)_80px] items-center gap-3 rounded-t-lg bg-lego px-4 py-3 text-xs tracking-[0.2em] uppercase text-chalkboard/70">
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span />
          </div>

          {list.isLoading && (
            <div className="p-8 text-center text-sm text-ink/50">Loading…</div>
          )}
          {!list.isLoading && rows.length === 0 && (
            <div className="p-8 text-center text-sm text-ink/50">
              No staff yet.
            </div>
          )}

          <ul className="divide-y divide-dashed divide-ink/10">
            {rows.map((r) => (
              <li
                key={r.userId}
                className="grid min-w-[640px] grid-cols-[minmax(180px,1.6fr)_minmax(220px,2fr)_minmax(120px,1fr)_80px] items-center gap-3 px-4 py-3 text-sm"
              >
                <span className="font-display text-sm font-bold text-ink">
                  {r.name}
                  {r.isSelf && (
                    <span className="ml-2 text-xs tracking-widest uppercase text-ink/40">
                      you
                    </span>
                  )}
                </span>
                <span className="truncate text-ink/80">{r.email}</span>
                <span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs tracking-widest uppercase",
                      r.isRoot
                        ? "bg-ink text-chalkboard"
                        : "border border-ink/20 text-ink/70",
                    )}
                  >
                    {r.isRoot ? "root" : "staff"}
                  </span>
                </span>
                <div className="flex justify-end">
                  {r.isRoot || r.isSelf ? (
                    <span
                      className="text-xs tracking-widest uppercase text-ink/30"
                      title={
                        r.isRoot
                          ? "Root staff is protected"
                          : "Cannot remove yourself"
                      }
                    >
                      —
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRemove(r.userId, r.name)}
                      disabled={removeStaff.isPending}
                      className="rounded-full border border-ink/20 px-3 py-1 text-xs text-ink/70 hover:border-slide hover:text-slide disabled:opacity-50"
                    >
                      remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <footer className="mt-16 flex items-center justify-between border-t border-dashed border-ink/20 pt-6 text-xs tracking-[0.2em] uppercase text-ink/50">
          <span>End Show · MDD Graduation · {rows.length} Staff</span>
        </footer>
      </div>

      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => !createStaff.isPending && closeInvite()}
        >
          <form
            onSubmit={handleInviteSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-lg border border-ink/15 bg-white p-6 font-mono shadow-xl"
          >
            <h2 className="font-display text-2xl font-bold text-ink">
              Add staff
            </h2>
            <p className="mt-1 text-xs text-ink/60">
              Creates an account with staff role. They sign in via email OTP.
            </p>

            <label className="mt-5 block text-xs tracking-[0.2em] uppercase text-ink/60">
              Name
            </label>
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              autoFocus
              required
              maxLength={80}
              className="mt-1 h-10 w-full rounded-md border border-ink/20 bg-white px-3 text-sm focus:border-ink/50 focus:outline-none"
            />

            <label className="mt-4 block text-xs tracking-[0.2em] uppercase text-ink/60">
              Email
            </label>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              maxLength={200}
              className="mt-1 h-10 w-full rounded-md border border-ink/20 bg-white px-3 text-sm focus:border-ink/50 focus:outline-none"
            />

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeInvite}
                disabled={createStaff.isPending}
                className="h-9 rounded-full border border-ink/20 px-4 text-sm hover:border-ink/40 disabled:opacity-50"
              >
                cancel
              </button>
              <button
                type="submit"
                disabled={
                  createStaff.isPending ||
                  !inviteName.trim() ||
                  !inviteEmail.trim()
                }
                className="h-9 rounded-full bg-ink px-4 text-sm font-medium text-chalkboard hover:bg-ink/90 disabled:opacity-50"
              >
                {createStaff.isPending ? "adding…" : "add staff"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function AdminTabs({ current }: { current: "students" | "staff" }) {
  return (
    <nav className="mt-6 flex gap-2 border-b border-dashed border-ink/15">
      <TabLink to="/admin/students" active={current === "students"}>
        Students
      </TabLink>
      <TabLink to="/admin/staff" active={current === "staff"}>
        Staff
      </TabLink>
    </nav>
  );
}

function TabLink({
  to,
  active,
  children,
}: {
  to: "/admin/students" | "/admin/staff";
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
        active
          ? "border-ink text-ink"
          : "border-transparent text-ink/50 hover:text-ink",
      )}
    >
      {children}
    </Link>
  );
}
