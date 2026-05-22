import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Fragment } from "react";

import { authClient } from "@/features/auth";

export type Crumb = {
  label: string;
  href?: string;
};

type Props = {
  crumbs?: Crumb[];
  statusText?: string;
  actions?: ReactNode;
};

export function TopBar({ crumbs, statusText, actions }: Props) {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const onSignOut = () => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: "/login" });
        },
      },
    });
  };
  return (
    <div className="sticky top-0 z-30 border-b border-lego-dark/10 bg-chalkboard/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-8 py-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-2 font-mono text-xs"
        >
          <span className="rounded-full bg-lego-dark/5 px-2 py-0.5 text-[10px] tracking-widest text-lego-dark/50 uppercase">
            '26 · mdd
          </span>
          {crumbs?.map((c, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <Fragment key={`${c.label}-${i}`}>
                <span aria-hidden className="text-lego-dark/30">
                  ›
                </span>
                {isLast || !c.href ? (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={
                      isLast
                        ? "font-bold text-lego-dark"
                        : "text-lego-dark/50"
                    }
                  >
                    {c.label}
                  </span>
                ) : (
                  <a
                    href={c.href}
                    className="text-lego-dark/50 hover:text-lego-dark hover:underline"
                  >
                    {c.label}
                  </a>
                )}
              </Fragment>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          {statusText ? (
            <span className="font-mono text-[11px] text-lego-dark/60">
              <span className="mr-1.5 inline-block size-1.5 rounded-full bg-slime align-middle" />
              {statusText}
            </span>
          ) : null}
          {actions}
          {session?.user?.email ? (
            <span
              className="font-mono text-[11px] text-lego-dark/60"
              title="signed in as"
            >
              {session.user.email}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onSignOut}
            className="rounded-full border border-lego-dark/20 px-3 py-1.5 font-mono text-xs text-lego-dark/70 hover:bg-lego-dark/5 hover:text-lego-dark"
          >
            sign out
          </button>
        </div>
      </div>
    </div>
  );
}
