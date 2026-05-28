import { useMemo, useRef, useState } from "react";

import { Field } from "./field";
import { Highlight } from "./highlight";
import { COMP_MAX, COMP_TAG_MAX } from "./types";

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
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const q = input.trim().toLowerCase();
    const pool = cohort.filter((t) => !competencies.includes(t.tag));
    if (!q) return pool.slice(0, 8);
    return pool.filter((t) => t.tag.toLowerCase().includes(q)).slice(0, 8);
  }, [input, cohort, competencies]);

  const exactMatch = cohort.some(
    (m) => m.tag.toLowerCase() === input.trim().toLowerCase(),
  );

  const add = (tag: string) => {
    const t = tag.trim();
    if (!t || competencies.includes(t) || competencies.length >= COMP_MAX)
      return;
    onChange([...competencies, t]);
    setInput("");
    inputRef.current?.focus();
  };

  const remove = (tag: string) =>
    onChange(competencies.filter((c) => c !== tag));

  const atMax = competencies.length >= COMP_MAX;
  const showDropdown = focused && !atMax;

  return (
    <Field
      label="Competencies"
      required
      hint={`${competencies.length} / ${COMP_MAX}`}
    >
      <div className="relative">
        <div
          className="flex flex-wrap items-center gap-1.5 rounded-md border border-lego-dark/20 bg-white px-2 py-1.5 focus-within:border-lego"
          onClick={() => inputRef.current?.focus()}
        >
          {competencies.map((c) => (
            <button
              type="button"
              key={c}
              onClick={(e) => {
                e.stopPropagation();
                remove(c);
              }}
              className="rounded-full bg-lego-dark px-2.5 py-0.5 font-mono text-xs text-chalkboard hover:bg-slide"
            >
              {c} ×
            </button>
          ))}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (matches[0] && input.trim()) add(matches[0].tag);
                else if (input.trim()) add(input.trim());
              } else if (
                e.key === "Backspace" &&
                !input &&
                competencies.length > 0
              ) {
                remove(competencies[competencies.length - 1]!);
              }
            }}
            disabled={atMax}
            placeholder={
              atMax
                ? "max reached — remove one to add"
                : competencies.length === 0
                  ? "type to search your cohorts competencies, or add a new one"
                  : ""
            }
            maxLength={COMP_TAG_MAX}
            className="min-w-[8rem] flex-1 bg-transparent px-1 py-0.5 font-mono text-sm placeholder:text-lego-dark/30 focus:outline-none"
          />
        </div>

        {showDropdown && (matches.length > 0 || input.trim()) && (
          <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-auto rounded-md border border-lego-dark/20 bg-white shadow-lg">
            {matches.map((m) => (
              <button
                type="button"
                key={m.tag}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(m.tag);
                }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-sm hover:bg-lego-dark/5"
              >
                <span>
                  {input.trim() ? (
                    <Highlight text={m.tag} query={input} />
                  ) : (
                    m.tag
                  )}
                </span>
                <span className="text-xs text-lego-dark/40">{m.count}</span>
              </button>
            ))}
            {input.trim() && !exactMatch && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(input.trim());
                }}
                className="flex w-full items-center justify-between border-t border-dashed border-lego-dark/15 px-3 py-1.5 font-mono text-xs text-lego-dark/70 hover:bg-lego-dark/5"
              >
                <span>
                  <span className="text-slide">+</span> add "{input.trim()}"
                </span>
                <span>↵</span>
              </button>
            )}
          </div>
        )}
      </div>
    </Field>
  );
}
