import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  const list = useQuery(trpc.admin.listStudents.queryOptions());

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "edited">("edited");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
      if (sortKey === "name") {
        return (
          (a.displayName || a.name).localeCompare(b.displayName || b.name) * dir
        );
      }
      return (a.updatedAt - b.updatedAt) * dir;
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

  const onToggleSort = (key: "name" | "edited") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

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

  return (
    <div className="min-h-screen bg-chalkboard text-ink">
      <TopBar crumbs={[{ label: "admin" }, { label: "students" }]} />
      <div className="container mx-auto max-w-7xl px-6 py-10 font-mono">
        <header className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="font-display text-[5rem] leading-none font-bold tracking-tight text-ink">
              Roster<span className="text-slide">.</span>
            </h1>
          </div>
        </header>

        <div className="my-8 border-t border-dashed border-ink/20" />

        <div className="flex flex-wrap items-center gap-3">
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
              <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-ink/15 px-1.5 text-[10px] uppercase text-ink/50">
                ⌘K
              </span>
            </div>
            <button
              type="button"
              onClick={() => toast("Invite flow not implemented yet")}
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

        <div className="mt-6 rounded-lg border border-ink/15 bg-white">
          <div className="grid grid-cols-[40px_minmax(180px,1.6fr)_minmax(140px,1fr)_100px_minmax(140px,1fr)_minmax(160px,1fr)_120px_120px_40px] items-center gap-3 rounded-t-lg bg-lego px-4 py-3 text-[10px] tracking-[0.2em] uppercase text-chalkboard/70">
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
              name {sortKey === "name" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </button>
            <span>Competencies</span>
            <span>Showcase</span>
            <span>Portfolio Link</span>
            <span>Size</span>
            <span>Status</span>
            <button
              type="button"
              onClick={() => onToggleSort("edited")}
              className="text-left hover:text-chalkboard"
            >
              edited{" "}
              {sortKey === "edited" ? (sortDir === "asc" ? "↑" : "↓") : ""}
            </button>
            <span />
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

        <footer className="mt-16 flex items-center justify-between border-t border-dashed border-ink/20 pt-6 text-[10px] tracking-[0.2em] uppercase text-ink/50">
          <span>End Show '26 · MDD Graduation · {counts.total} Students</span>
        </footer>
      </div>
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
      <span className="text-[10px] tracking-[0.2em] uppercase opacity-80">
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
          "text-[10px]",
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
  const [hoverComps, setHoverComps] = useState(false);

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
    <li
      className="relative grid grid-cols-[40px_minmax(180px,1.6fr)_minmax(140px,1fr)_100px_minmax(140px,1fr)_minmax(160px,1fr)_120px_120px_40px] items-center gap-3 px-4 py-3 text-sm hover:bg-ink/[0.02]"
      style={hoverComps ? { zIndex: 40 } : undefined}
    >
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
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold",
            avatarColor(row.userId),
            "text-ink",
          )}
        >
          {initials(row.displayName || row.name)}
        </span>
        <span className="flex flex-col">
          <span className="font-display text-sm font-bold text-ink">
            {row.displayName || row.name}
          </span>
          {row.pronouns && (
            <span className="text-[10px] tracking-widest uppercase text-ink/50">
              {row.pronouns}
            </span>
          )}
        </span>
      </div>

      <div
        className="relative z-10 flex items-center gap-2"
        onMouseEnter={() => setHoverComps(true)}
        onMouseLeave={() => setHoverComps(false)}
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
          <span className="text-[10px] tracking-widest uppercase text-ink/70">
            {compCount}/5
          </span>
        </div>
        {hoverComps && compCount > 0 && (
          <div className="absolute left-0 top-full z-20 mt-2 w-max rounded-md bg-ink p-3 text-chalkboard shadow-lg">
            <p className="text-[9px] tracking-widest uppercase text-chalkboard/60">
              {compCount} of 5 competencies
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {row.competencies.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-chalkboard/30 px-2 py-0.5 text-[11px]"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        {row.workMediaKind ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] tracking-widest uppercase",
              row.workMediaKind === "work-video"
                ? "bg-slide text-white"
                : "border border-ink/20 text-ink/70",
            )}
          >
            <span className="text-[9px]">
              {row.workMediaKind === "work-video" ? "▶" : "◯"}
            </span>
            {row.workMediaKind === "work-video" ? "video" : "image"}
          </span>
        ) : (
          <span className="text-[10px] tracking-widest uppercase text-ink/30">
            —
          </span>
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
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] tracking-widest uppercase",
            status.className,
          )}
        >
          {status.label}
        </span>
      </div>

      <div className="text-xs text-ink/60">{relativeTime(row.updatedAt)}</div>

      <div className="flex justify-end text-ink/40" aria-hidden>
        ›
      </div>
    </li>
  );
}
