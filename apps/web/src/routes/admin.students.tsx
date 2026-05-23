import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { TopBar } from "@/shell";
import { trpc } from "@/lib/trpc";
import { cn } from "@end-show/ui/lib/utils";

export const Route = createFileRoute("/admin/students")({
  component: AdminStudentsRoute,
});

type StudentRow = {
  userId: string;
  name: string;
  email: string;
  hasProfile: boolean;
  isComplete: boolean;
  displayName: string;
  pronouns: string;
  link: string;
  competencies: string[];
  workMediaKind: "work-image" | "work-video" | null;
  workMediaUrl: string | null;
  portraitUrl: string | null;
  hasMedia: boolean;
  usedBytes: number;
  budgetBytes: number;
  overBudget: boolean;
  updatedAt: number;
};

type Filter =
  | "all"
  | "complete"
  | "incomplete"
  | "flagged"
  | "over-budget"
  | "no-media";

type SortKey =
  | "name"
  | "competencies"
  | "showcase"
  | "link"
  | "size"
  | "status"
  | "edited";

const STATUS_RANK: Record<string, number> = {
  flagged: 0,
  "no profile": 1,
  incomplete: 2,
  complete: 3,
};

const SHOWCASE_RANK: Record<string, number> = {
  "work-video": 0,
  "work-image": 1,
};

function statusOf(r: StudentRow): string {
  if (!r.hasProfile) return "no profile";
  if (r.overBudget) return "flagged";
  if (r.isComplete) return "complete";
  return "incomplete";
}

const PAGE_SIZE = 10;

function formatMB(n: number): string {
  const mb = n / (1024 * 1024);
  if (mb < 1) return `${(n / 1024).toFixed(1)}K`;
  if (mb < 1000) return `${mb.toFixed(1)}M`;
  return `${(mb / 1024).toFixed(2)}G`;
}

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  "bg-slime",
  "bg-crayon",
  "bg-bubblegum",
  "bg-slide",
  "bg-lego",
];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length] ?? "bg-lego";
}

function shortLink(link: string): string {
  if (!link) return "";
  try {
    const u = new URL(link);
    return (u.host + u.pathname).replace(/^www\./, "").replace(/\/$/, "");
  } catch {
    return link
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "");
  }
}

function toCsv(rows: StudentRow[]): string {
  const header = [
    "name",
    "email",
    "pronouns",
    "status",
    "competencies",
    "link",
    "size_bytes",
    "budget_bytes",
    "updated_at",
  ];
  const escape = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = rows.map((r) =>
    [
      r.displayName || r.name,
      r.email,
      r.pronouns,
      r.isComplete ? "complete" : r.hasProfile ? "incomplete" : "no-profile",
      r.competencies.join("|"),
      r.link,
      String(r.usedBytes),
      String(r.budgetBytes),
      new Date(r.updatedAt).toISOString(),
    ]
      .map(escape)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function AdminStudentsRoute() {
  const qc = useQueryClient();
  const list = useQuery(trpc.admin.listStudents.queryOptions());
  const createStudent = useMutation(
    trpc.admin.createStudent.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({
          queryKey: trpc.admin.listStudents.queryKey(),
        });
      },
    }),
  );
  const removeStudents = useMutation(
    trpc.admin.removeStudents.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({
          queryKey: trpc.admin.listStudents.queryKey(),
        });
        await qc.invalidateQueries({
          queryKey: trpc.student.listEligible.queryKey(),
        });
      },
    }),
  );

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("edited");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");

  const rows: StudentRow[] = list.data ?? [];

  const counts = useMemo(() => {
    let total = 0;
    let complete = 0;
    let incomplete = 0;
    let flagged = 0;
    let overBudget = 0;
    let noMedia = 0;
    for (const r of rows) {
      total++;
      if (r.isComplete) complete++;
      else incomplete++;
      if (r.overBudget) flagged++;
      if (r.overBudget) overBudget++;
      if (!r.hasMedia) noMedia++;
    }
    return { total, complete, incomplete, flagged, overBudget, noMedia };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (filter === "complete" && !r.isComplete) return false;
      if (filter === "incomplete" && r.isComplete) return false;
      if (filter === "flagged" && !r.overBudget) return false;
      if (filter === "over-budget" && !r.overBudget) return false;
      if (filter === "no-media" && r.hasMedia) return false;
      if (!q) return true;
      const hay = [r.displayName, r.name, r.email, r.link, ...r.competencies]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    out = [...out].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name":
          return (
            (a.displayName || a.name).localeCompare(b.displayName || b.name) *
            dir
          );
        case "competencies":
          return (a.competencies.length - b.competencies.length) * dir;
        case "showcase": {
          const ra = a.workMediaKind
            ? (SHOWCASE_RANK[a.workMediaKind] ?? 2)
            : 2;
          const rb = b.workMediaKind
            ? (SHOWCASE_RANK[b.workMediaKind] ?? 2)
            : 2;
          return (ra - rb) * dir;
        }
        case "link":
          return (a.link || "").localeCompare(b.link || "") * dir;
        case "size":
          return (a.usedBytes - b.usedBytes) * dir;
        case "status":
          return (
            ((STATUS_RANK[statusOf(a)] ?? 99) -
              (STATUS_RANK[statusOf(b)] ?? 99)) *
            dir
          );
        case "edited":
        default:
          return (a.updatedAt - b.updatedAt) * dir;
      }
    });
    return out;
  }, [rows, filter, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );
  const startIdx = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const endIdx = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE);

  const onToggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(
        key === "name" || key === "link" || key === "status" ? "asc" : "desc",
      );
    }
  };

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const onExportCsv = () => {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roster-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const allOnPageSelected =
    pageRows.length > 0 && pageRows.every((r) => selected.has(r.userId));
  const toggleAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) for (const r of pageRows) next.delete(r.userId);
      else for (const r of pageRows) next.add(r.userId);
      return next;
    });
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = inviteName.trim();
    const email = inviteEmail.trim();
    if (!name || !email) return;
    try {
      await createStudent.mutateAsync({ name, email });
      toast.success(`${name} added`);
      setInviteName("");
      setInviteEmail("");
      setInviteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add student");
    }
  };

  const handleRemoveSelected = async () => {
    const userIds = Array.from(selected);
    if (userIds.length === 0) return;
    if (
      !window.confirm(
        `Remove ${userIds.length} student${userIds.length === 1 ? "" : "s"}? This deletes their profile, uploads, and account.`,
      )
    ) {
      return;
    }
    try {
      const res = await removeStudents.mutateAsync({ userIds });
      toast.success(
        `Removed ${res.removed} student${res.removed === 1 ? "" : "s"}`,
      );
      setSelected(new Set());
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not remove students",
      );
    }
  };

  return (
    <div className="min-h-screen bg-chalkboard text-ink">
      <TopBar crumbs={[{ label: "admin" }, { label: "students" }]} />
      <div className="container mx-auto py-10 font-mono">
        <nav className="mt-6 flex gap-2 border-b border-dashed border-ink/15">
          <Link
            to="/admin/students"
            className="-mb-px border-b-2 border-ink px-3 py-2 text-sm font-medium text-ink"
          >
            Students
          </Link>
          <Link
            to="/admin/staff"
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-ink/50 hover:text-ink"
          >
            Staff
          </Link>
        </nav>

        <div className="flex flex-wrap items-center gap-3 mt-6">
          <FilterPill
            active={filter === "all"}
            count={counts.total}
            onClick={() => {
              setFilter("all");
              setPage(0);
            }}
          >
            all
          </FilterPill>
          <FilterPill
            active={filter === "complete"}
            count={counts.complete}
            onClick={() => {
              setFilter("complete");
              setPage(0);
            }}
          >
            complete
          </FilterPill>
          <FilterPill
            active={filter === "incomplete"}
            count={counts.incomplete}
            onClick={() => {
              setFilter("incomplete");
              setPage(0);
            }}
          >
            incomplete
          </FilterPill>
          <FilterPill
            active={filter === "flagged"}
            count={counts.flagged}
            onClick={() => {
              setFilter("flagged");
              setPage(0);
            }}
          >
            flagged
          </FilterPill>
          <FilterPill
            active={filter === "over-budget"}
            count={counts.overBudget}
            onClick={() => {
              setFilter("over-budget");
              setPage(0);
            }}
          >
            over budget
          </FilterPill>
          <FilterPill
            active={filter === "no-media"}
            count={counts.noMedia}
            onClick={() => {
              setFilter("no-media");
              setPage(0);
            }}
          >
            no media
          </FilterPill>

          <div className="ml-auto flex items-center gap-3">
            <div className="relative">
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="search name, competency, link…"
                className="h-9 w-72 rounded-full border border-ink/15 bg-white px-9 text-sm placeholder:text-ink/40 focus:border-ink/40 focus:outline-none"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40 text-sm">
                ⌕
              </span>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-ink/15 px-1.5 text-xs uppercase text-ink/50">
                ⌘K
              </span>
            </div>
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="h-9 rounded-full border border-ink/20 bg-white px-4 text-sm font-medium hover:border-ink/40"
            >
              + invite student
            </button>
            <button
              type="button"
              onClick={onExportCsv}
              className="h-9 rounded-full bg-slide px-4 text-sm font-medium text-white hover:bg-slide/90"
            >
              export csv ↓
            </button>
          </div>
        </div>

        {selected.size > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-md border border-ink/15 bg-lego px-4 py-2 text-chalkboard">
            <span className="text-xs tracking-widest uppercase">
              {selected.size} selected
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-full border border-chalkboard/30 px-3 py-1 text-xs hover:bg-chalkboard/10"
              >
                clear
              </button>
              <button
                type="button"
                onClick={handleRemoveSelected}
                disabled={removeStudents.isPending}
                className="rounded-full bg-slide px-3 py-1 text-xs font-medium text-white hover:bg-slide/90 disabled:opacity-50"
              >
                {removeStudents.isPending
                  ? "removing…"
                  : `remove ${selected.size}`}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 overflow-x-auto rounded-lg border border-ink/15 bg-white">
          <div className="grid min-w-[1200px] grid-cols-[40px_minmax(180px,1.6fr)_minmax(140px,1fr)_100px_minmax(140px,1fr)_minmax(160px,1fr)_120px_120px] items-center gap-3 rounded-t-lg bg-lego px-4 py-3 text-xs tracking-[0.2em] uppercase text-chalkboard/70">
            <input
              type="checkbox"
              checked={allOnPageSelected}
              onChange={toggleAllOnPage}
              className="h-4 w-4 accent-slide"
            />
            <button
              type="button"
              onClick={() => onToggleSort("name")}
              className="text-left hover:text-chalkboard"
            >
              name{arrow("name")}
            </button>
            <button
              type="button"
              onClick={() => onToggleSort("competencies")}
              className="text-left hover:text-chalkboard"
            >
              Competencies{arrow("competencies")}
            </button>
            <button
              type="button"
              onClick={() => onToggleSort("showcase")}
              className="text-left hover:text-chalkboard"
            >
              Showcase{arrow("showcase")}
            </button>
            <button
              type="button"
              onClick={() => onToggleSort("link")}
              className="text-left hover:text-chalkboard"
            >
              Portfolio Link{arrow("link")}
            </button>
            <button
              type="button"
              onClick={() => onToggleSort("size")}
              className="text-left hover:text-chalkboard"
            >
              Size{arrow("size")}
            </button>
            <button
              type="button"
              onClick={() => onToggleSort("status")}
              className="text-left hover:text-chalkboard"
            >
              Status{arrow("status")}
            </button>
            <button
              type="button"
              onClick={() => onToggleSort("edited")}
              className="text-left hover:text-chalkboard"
            >
              edited{arrow("edited")}
            </button>
          </div>

          {list.isLoading && (
            <div className="p-8 text-center text-sm text-ink/50">Loading…</div>
          )}
          {!list.isLoading && pageRows.length === 0 && (
            <div className="p-8 text-center text-sm text-ink/50">
              No students match this filter.
            </div>
          )}

          <ul className="divide-y divide-dashed divide-ink/10">
            {pageRows.map((r) => (
              <Row
                key={r.userId}
                row={r}
                selected={selected.has(r.userId)}
                onToggleSelect={() => {
                  setSelected((prev) => {
                    const n = new Set(prev);
                    if (n.has(r.userId)) n.delete(r.userId);
                    else n.add(r.userId);
                    return n;
                  });
                }}
              />
            ))}
          </ul>
        </div>

        <div className="mt-4 flex items-center justify-between text-xs text-ink/60">
          <span>
            showing {startIdx} – {endIdx} of {filtered.length} students · sorted
            by {sortKey} {sortDir === "asc" ? "↑" : "↓"}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={safePage <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-full border border-ink/20 bg-white px-3 py-1 disabled:opacity-30 hover:border-ink/40"
            >
              ← prev
            </button>
            <span>
              page {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="rounded-full border border-ink/20 bg-white px-3 py-1 disabled:opacity-30 hover:border-ink/40"
            >
              next →
            </button>
          </div>
        </div>

        <footer className="mt-16 flex items-center justify-between border-t border-dashed border-ink/20 pt-6 text-xs tracking-[0.2em] uppercase text-ink/50">
          <span>End Show · MDD Graduation · {counts.total} Students</span>
        </footer>
      </div>

      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => !createStudent.isPending && setInviteOpen(false)}
        >
          <form
            onSubmit={handleInviteSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-lg border border-ink/15 bg-white p-6 font-mono shadow-xl"
          >
            <h2 className="font-display text-2xl font-bold text-ink">
              Invite student
            </h2>
            <p className="mt-1 text-xs text-ink/60">
              Creates an account. The student signs in via email OTP.
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
                onClick={() => setInviteOpen(false)}
                disabled={createStudent.isPending}
                className="h-9 rounded-full border border-ink/20 px-4 text-sm hover:border-ink/40 disabled:opacity-50"
              >
                cancel
              </button>
              <button
                type="submit"
                disabled={
                  createStudent.isPending ||
                  !inviteName.trim() ||
                  !inviteEmail.trim()
                }
                className="h-9 rounded-full bg-ink px-4 text-sm font-medium text-chalkboard hover:bg-ink/90 disabled:opacity-50"
              >
                {createStudent.isPending ? "adding…" : "add student"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function StatCard({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "dark" | "outline" | "slide";
}) {
  const base =
    "flex h-24 w-28 flex-col justify-between rounded-md p-3 text-left";
  const styles =
    tone === "dark"
      ? "bg-lego text-chalkboard"
      : tone === "slide"
        ? "bg-slide text-white"
        : "border border-ink/15 bg-white text-ink";
  return (
    <div className={cn(base, styles)}>
      <span className="font-display text-3xl font-bold leading-none">
        {value}
      </span>
      <span className="text-xs tracking-[0.2em] uppercase opacity-80">
        {label}
      </span>
    </div>
  );
}

function FilterPill({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 items-center gap-2 rounded-full border px-3 text-xs",
        active
          ? "border-ink bg-ink text-chalkboard"
          : "border-ink/15 bg-white text-ink hover:border-ink/30",
      )}
    >
      <span>{children}</span>
      <span
        className={cn(
          "text-xs",
          active ? "text-chalkboard/70" : "text-ink/50",
        )}
      >
        {count}
      </span>
    </button>
  );
}

function Row({
  row,
  selected,
  onToggleSelect,
}: {
  row: StudentRow;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const compsRef = useRef<HTMLDivElement | null>(null);
  const showcaseRef = useRef<HTMLDivElement | null>(null);
  const [compsRect, setCompsRect] = useState<DOMRect | null>(null);
  const [showcaseRect, setShowcaseRect] = useState<DOMRect | null>(null);

  const openComps = () => {
    if (compsRef.current) setCompsRect(compsRef.current.getBoundingClientRect());
  };
  const closeComps = () => setCompsRect(null);
  const openShowcase = () => {
    if (showcaseRef.current)
      setShowcaseRect(showcaseRef.current.getBoundingClientRect());
  };
  const closeShowcase = () => setShowcaseRect(null);

  const compCount = row.competencies.length;
  const pct =
    row.budgetBytes <= 0
      ? 0
      : Math.min(100, (row.usedBytes / row.budgetBytes) * 100);

  const status = !row.hasProfile
    ? { label: "no profile", className: "border border-ink/20 text-ink/60" }
    : row.overBudget
      ? { label: "flagged", className: "bg-slide text-white" }
      : row.isComplete
        ? { label: "complete", className: "bg-ink text-chalkboard" }
        : {
            label: "incomplete",
            className: "border border-ink/20 text-ink/60",
          };

  return (
    <li className="relative grid min-w-[1200px] grid-cols-[40px_minmax(180px,1.6fr)_minmax(140px,1fr)_100px_minmax(140px,1fr)_minmax(160px,1fr)_120px_120px] items-center gap-3 bg-white px-4 py-3 text-sm hover:bg-ink/[0.02]">
      <Link
        to="/admin/students/$userId"
        params={{ userId: row.userId }}
        aria-label={`edit ${row.displayName || row.name}`}
        className="absolute inset-0 z-0"
      />
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        className="relative z-10 h-4 w-4 accent-slide"
      />

      <div className="relative z-10 flex items-center gap-3">
        {row.portraitUrl ? (
          <img
            src={row.portraitUrl}
            alt={`${row.displayName || row.name} portrait`}
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold",
              avatarColor(row.userId),
              "text-ink",
            )}
          >
            {initials(row.displayName || row.name)}
          </span>
        )}
        <span className="flex flex-col">
          <span className="font-display text-sm font-bold text-ink">
            {row.displayName || row.name}
          </span>
          {row.pronouns && (
            <span className="text-xs tracking-widest uppercase text-ink/50">
              {row.pronouns}
            </span>
          )}
        </span>
      </div>

      <div
        ref={compsRef}
        className="relative z-10 flex items-center gap-2"
        onMouseEnter={openComps}
        onMouseLeave={closeComps}
      >
        <div className="flex items-center gap-1 rounded-full border border-ink/15 bg-white px-2 py-1">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  i < compCount ? "bg-ink" : "border border-ink/25",
                )}
              />
            ))}
          </div>
          <span className="text-xs tracking-widest uppercase text-ink/70">
            {compCount}/5
          </span>
        </div>
        {compsRect &&
          createPortal(
            <div
              className="pointer-events-none fixed z-50 w-max max-w-xs rounded-md bg-ink p-3 text-chalkboard shadow-lg"
              style={{
                top: compsRect.bottom + 8,
                left: compsRect.left,
              }}
            >
              <p className="text-xs tracking-widest uppercase text-chalkboard/60">
                {compCount} of 5 competencies
              </p>
              {compCount > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {row.competencies.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-chalkboard/30 px-2 py-0.5 text-xs"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-chalkboard/60 italic">
                  No competencies selected yet.
                </p>
              )}
            </div>,
            document.body,
          )}
      </div>

      <div
        ref={showcaseRef}
        className="relative z-10"
        onMouseEnter={openShowcase}
        onMouseLeave={closeShowcase}
      >
        {row.workMediaKind ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs tracking-widest uppercase",
              row.workMediaKind === "work-video"
                ? "bg-slide text-white"
                : "border border-ink/20 text-ink/70",
            )}
          >
            <span className="text-xs">
              {row.workMediaKind === "work-video" ? "▶" : "◯"}
            </span>
            {row.workMediaKind === "work-video" ? "video" : "image"}
          </span>
        ) : (
          <span className="text-xs tracking-widest uppercase text-ink/30">
            —
          </span>
        )}
        {showcaseRect &&
          row.workMediaUrl &&
          createPortal(
            <div
              className="pointer-events-none fixed z-50 w-64 overflow-hidden rounded-md border border-ink/20 bg-ink p-1 shadow-lg"
              style={{
                top: showcaseRect.bottom + 8,
                left: showcaseRect.left,
              }}
            >
              {row.workMediaKind === "work-video" ? (
                <video
                  src={row.workMediaUrl}
                  muted
                  autoPlay
                  loop
                  playsInline
                  className="h-36 w-full rounded object-cover"
                />
              ) : (
                <img
                  src={row.workMediaUrl}
                  alt={`${row.displayName || row.name} showcase`}
                  className="h-36 w-full rounded object-cover"
                />
              )}
            </div>,
            document.body,
          )}
      </div>

      <div className="truncate">
        {row.link ? (
          <a
            href={row.link}
            target="_blank"
            rel="noreferrer"
            className="relative z-10 underline decoration-ink/30 underline-offset-2 hover:decoration-ink"
          >
            {shortLink(row.link)}
          </a>
        ) : (
          <span className="text-ink/30">—</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-ink/10">
          <div
            className={cn(
              "absolute inset-y-0 left-0",
              row.overBudget ? "bg-slide" : "bg-ink",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          className={cn(
            "shrink-0 text-xs tabular-nums",
            row.overBudget ? "text-slide" : "text-ink/70",
          )}
        >
          {formatMB(row.usedBytes)}
        </span>
      </div>

      <div>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs tracking-widest uppercase",
            status.className,
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="text-xs text-ink/60">{relativeTime(row.updatedAt)}</div>
    </li>
  );
}
