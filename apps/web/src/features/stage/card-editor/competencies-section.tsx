import { useMemo, useState } from "react";

import { Highlight } from "./highlight";
import { COMP_MAX } from "./types";

export function CompetenciesSection({
  competencies,
  cohort,
  onChange,
}: {
  competencies: string[];
  cohort: Array<{ tag: string; count: number }>;
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);

  const matches = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return cohort
      .filter(
        (t) => t.tag.toLowerCase().includes(q) && !competencies.includes(t.tag),
      )
      .slice(0, 5);
  }, [input, cohort, competencies]);

  const suggestions = useMemo(
    () => cohort.filter((t) => !competencies.includes(t.tag)).slice(0, 14),
    [cohort, competencies],
  );

  const exactMatch = matches.some(
    (m) => m.tag.toLowerCase() === input.trim().toLowerCase(),
  );

  const add = (tag: string) => {
    const t = tag.trim();
    if (!t || competencies.includes(t) || competencies.length >= COMP_MAX)
      return;
    onChange([...competencies, t]);
    setInput("");
  };

  const remove = (tag: string) =>
    onChange(competencies.filter((c) => c !== tag));

  const remaining = COMP_MAX - competencies.length;

  return (
    <section className="border-t border-lego-dark/15 bg-lego-dark/[0.03]">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="font-mono text-[10px] tracking-widest text-lego-dark/60 uppercase">
              competencies <span className="text-slide">*</span>
            </p>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-tight">
              What are you <span className="bg-slime/60 px-1">known for</span>?
            </h2>
            <p className="mt-2 max-w-md font-mono text-sm text-lego-dark/70">
              Pick up to five. Type whatever you like — your cohort's tags
              appear as you type, but you're never locked into them.
            </p>

            <p className="mt-6 font-mono text-[10px] tracking-widest text-lego-dark/50 uppercase">
              your competencies
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {competencies.length === 0 ? (
                <span className="font-mono text-xs italic text-lego-dark/40">
                  nothing picked yet · add your first below ↓
                </span>
              ) : (
                competencies.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => remove(c)}
                    className="rounded-full bg-lego-dark px-3 py-1 font-mono text-xs text-chalkboard hover:bg-slide"
                  >
                    {c} ×
                  </button>
                ))
              )}
            </div>

            <p className="mt-6 font-mono text-[10px] tracking-widest text-lego-dark/50 uppercase">
              add a competency
              {input && (
                <span className="ml-2 text-lego-dark/40">· typing</span>
              )}
            </p>
            <div className="relative mt-2 max-w-md">
              <div className="flex items-center gap-2 rounded-full border border-lego-dark/30 bg-white px-3 py-2">
                <span className="font-mono text-slide">+</span>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setTimeout(() => setFocused(false), 150)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (matches[0]) add(matches[0].tag);
                      else if (input.trim()) add(input.trim());
                    }
                  }}
                  disabled={competencies.length >= COMP_MAX}
                  placeholder={
                    competencies.length >= COMP_MAX
                      ? "you're at 5 / 5 — remove one to add another"
                      : "type to add — or click a suggestion →"
                  }
                  className="flex-1 bg-transparent font-mono text-sm placeholder:text-lego-dark/30 focus:outline-none"
                  maxLength={40}
                />
                <span className="font-mono text-[10px] text-lego-dark/40">
                  {remaining} of {COMP_MAX} left
                </span>
              </div>

              {focused && input.trim() && (
                <div className="absolute top-full right-0 left-0 z-20 mt-1 rounded-md border border-lego-dark/20 bg-white shadow-lg">
                  <p className="border-b border-lego-dark/10 px-3 py-2 font-mono text-[10px] tracking-widest text-lego-dark/50 uppercase">
                    matches from your cohort
                  </p>
                  {matches.length > 0 ? (
                    matches.map((m) => (
                      <button
                        type="button"
                        key={m.tag}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          add(m.tag);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left font-mono text-sm hover:bg-lego-dark/5"
                      >
                        <span>
                          <Highlight text={m.tag} query={input} />
                        </span>
                        <span className="text-[10px] text-lego-dark/40">
                          {m.count} {m.count === 1 ? "student" : "students"} in
                          your cohort
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 font-mono text-xs italic text-lego-dark/40">
                      no matches yet
                    </p>
                  )}
                  {!exactMatch && input.trim() && (
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        add(input.trim());
                      }}
                      className="flex w-full items-center justify-between border-t border-dashed border-lego-dark/15 px-3 py-2 font-mono text-xs text-lego-dark/70 hover:bg-lego-dark/5"
                    >
                      <span>
                        <span className="text-slide">+</span> add "
                        {input.trim()}" as a new tag — only you
                      </span>
                      <span className="text-[10px]">shift + ↵</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <p className="font-mono text-[10px] tracking-widest text-lego-dark/50 uppercase">
                your cohort is using
              </p>
              <p className="font-mono text-[10px] text-lego-dark/40">
                click to add
              </p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.length === 0 ? (
                <span className="font-mono text-xs italic text-lego-dark/40">
                  no one in your cohort has added tags yet
                </span>
              ) : (
                suggestions.map((s) => (
                  <button
                    type="button"
                    key={s.tag}
                    onClick={() => add(s.tag)}
                    disabled={competencies.length >= COMP_MAX}
                    className="rounded-full border border-lego-dark/25 bg-white px-2.5 py-0.5 font-mono text-xs text-lego-dark hover:border-slide hover:text-slide disabled:opacity-40"
                  >
                    {s.tag}{" "}
                    <span className="text-[9px] text-lego-dark/40">
                      {s.count}
                    </span>
                  </button>
                ))
              )}
            </div>
            <p className="mt-4 font-mono text-[10px] text-lego-dark/40">
              <span className="font-bold">{competencies.length}</span> /{" "}
              {COMP_MAX} used
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
