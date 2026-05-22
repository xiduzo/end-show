import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

import { authClient } from "@/features/auth";

export const Route = createFileRoute("/admin")({
  component: () => <Outlet />,
  beforeLoad: async ({ location }) => {
    const session = await authClient.getSession();
    if (!session.data) throw redirect({ to: "/login" });
    const role = (session.data.user as { role?: string }).role;
    if (role !== "staff") throw redirect({ to: "/profile" });
    if (location.pathname === "/admin" || location.pathname === "/admin/") {
      throw redirect({ to: "/admin/students" });
    }
  },
});
