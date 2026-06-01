import type { StudentSummary } from "@end-show/api/routers/student";
import { cn } from "@end-show/ui/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAssetUpload } from "@/features/assets";
import { TopBar } from "@/shell";
import { trpc } from "@/lib/trpc";

import { ScaledStageCard } from "../scaled-stage-card";
import { UpNextBadge } from "../up-next-badge";
import { CompetenciesSection } from "./competencies-section";
import { Field } from "./field";
import { OneLinerMeter } from "./one-liner-meter";
import { PortraitColumn } from "./portrait-column";
import { ShowcaseColumn } from "./showcase-column";
import { StageColorPicker } from "./stage-color-picker";
import {
  COMP_MAX,
  inputCls,
  ONE_LINER_MAX,
  timeAgo,
  type CardEditorDraft,
  type CardEditorProfile,
} from "./types";

export type { CardEditorDraft, CardEditorProfile } from "./types";

type Props = {
  mode: "self" | "staff";
  profile: CardEditorProfile;
  onSave: (draft: CardEditorDraft) => Promise<void>;
  onAssetChanged: () => void;
  budgetSlot?: React.ReactNode;
};

type TabKey =
  | "identity"
  | "portrait"
  | "story"
  | "work"
  | "vibe"
  | "competencies";

const TABS: { key: TabKey; label: string }[] = [
  { key: "identity", label: "identity" },
  { key: "portrait", label: "portrait" },
  { key: "story", label: "story" },
  { key: "work", label: "work" },
  { key: "vibe", label: "vibe" },
  { key: "competencies", label: "skills" },
];

export function CardEditor({
  mode,
  profile,
  onSave,
  onAssetChanged,
  budgetSlot,
}: Props) {
  const qc = useQueryClient();
  const cohort = useQuery(
    trpc.student.cohortTags.queryOptions(
      mode === "staff" ? { excludeUserId: profile.userId } : undefined,
    ),
  );
  const stageConfig = useQuery(trpc.stage.config.queryOptions());
  const dwellSec = stageConfig.data
    ? Math.round(stageConfig.data.dwellMs / 1000)
    : null;

  const [draft, setDraft] = useState<CardEditorDraft>({
    displayName: profile.displayName,
    pronouns: profile.pronouns,
    introduction: profile.introduction.slice(0, ONE_LINER_MAX),
    link: profile.link,
    competencies: profile.competencies.slice(0, COMP_MAX),
    stageColor: profile.stageColor,
    track: profile.track,
  });
  const lastSyncedUserId = useRef(profile.userId);
  useEffect(() => {
    if (lastSyncedUserId.current !== profile.userId) {
      lastSyncedUserId.current = profile.userId;
      setDraft({
        displayName: profile.displayName,
        pronouns: profile.pronouns,
        introduction: profile.introduction.slice(0, ONE_LINER_MAX),
        link: profile.link,
        competencies: profile.competencies.slice(0, COMP_MAX),
        stageColor: profile.stageColor,
        track: profile.track,
      });
    }
  }, [profile]);

  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const inFlightDraft = useRef<CardEditorDraft | null>(null);
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const doSave = async (next: CardEditorDraft) => {
    if (inFlightDraft.current) {
      saveTimer.current = window.setTimeout(() => doSave(next), 400);
      return;
    }
    inFlightDraft.current = next;
    setSaving(true);
    try {
      await onSave(next);
      setSavedAt(Date.now());
      dirtyRef.current = false;
      qc.invalidateQueries({
        queryKey: trpc.student.cohortTags.queryKey(),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
      inFlightDraft.current = null;
    }
  };

  const scheduleSave = (next: CardEditorDraft) => {
    dirtyRef.current = true;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => doSave(next), 600);
  };

  const flushSave = async () => {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (dirtyRef.current) await doSave(draft);
    while (inFlightDraft.current) await new Promise((r) => setTimeout(r, 50));
  };

  const update = <K extends keyof CardEditorDraft>(
    key: K,
    value: CardEditorDraft[K],
  ) => {
    setDraft((d) => {
      const next = { ...d, [key]: value };
      scheduleSave(next);
      return next;
    });
  };

  const upload = useAssetUpload({
    onUploaded: () => {
      onAssetChanged();
      qc.invalidateQueries({
        queryKey: trpc.student.getMyProfile.queryKey(),
      });
    },
    targetUserId: mode === "staff" ? profile.userId : undefined,
  });

  const complete = (k: TabKey): boolean => {
    switch (k) {
      case "identity":
        return !!draft.displayName.trim();
      case "portrait":
        return !!profile.portraitUrl;
      case "story":
        return !!draft.introduction.trim();
      case "work":
        return !!profile.workMediaUrl;
      case "vibe":
        return !!draft.stageColor;
      case "competencies":
        return draft.competencies.length > 0;
    }
  };

  const [active, setActive] = useState<TabKey>("identity");
  const [dragOver, setDragOver] = useState(false);

  const dropKinds =
    active === "portrait"
      ? (["portrait"] as const)
      : active === "work"
        ? (["work-image", "work-video"] as const)
        : null;

  const onDragOver = (e: React.DragEvent) => {
    if (!dropKinds) return;
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
    e.preventDefault();
    setDragOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    if (!dropKinds) return;
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) {
      upload.dropFiles([...dropKinds], e.dataTransfer.files);
    }
  };

  const previewStudent = {
    userId: profile.userId,
    displayName: draft.displayName,
    pronouns: draft.pronouns,
    introduction: draft.introduction,
    link: draft.link,
    stageColor: draft.stageColor,
    track: draft.track,
    portraitUrl: profile.portraitUrl,
    workMediaUrl: profile.workMediaUrl,
    workMediaKind: profile.workMediaKind,
    competencies: draft.competencies,
  } as StudentSummary;

  const openFullscreen = async () => {
    await flushSave();
    window.open(`/stage-preview/${profile.userId}`, "_blank", "noopener");
  };

  return (
    <div className="min-h-screen bg-chalkboard text-lego-dark">
      <input
        ref={upload.inputRef}
        type="file"
        className="hidden"
        onChange={upload.onFile}
      />
      <TopBar
        crumbs={
          mode === "self"
            ? [{ label: "my profile" }, { label: "edit card" }]
            : [
                { label: "admin" },
                { label: "students", href: "/admin/students" },
                {
                  label:
                    profile.name ||
                    profile.displayName ||
                    profile.email ||
                    "student",
                },
              ]
        }
      />

      {budgetSlot}

      <div className="mx-auto container grid grid-cols-1 gap-6 py-6 pb-16 lg:grid-cols-[1fr_1.1fr]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="mb-2 flex items-baseline justify-between">
            <p className="font-mono text-xs tracking-widest text-lego-dark/50 uppercase">
              preview
            </p>
            <button
              type="button"
              onClick={openFullscreen}
              className="font-mono text-xs tracking-widest text-lego-dark/60 uppercase hover:text-slide"
            >
              full screen preview ↗
            </button>
          </div>
          <div className="relative aspect-video w-full overflow-hidden rounded-xl">
            <ScaledStageCard
              student={previewStudent}
              className="absolute inset-0 rounded-lg"
            />
            <UpNextBadge
              student={previewStudent}
              className="absolute top-3 right-3 z-20 origin-top-right scale-75"
            />
          </div>
          <div className="flex justify-between items-center">
            <p className="mt-2 font-mono text-xs text-lego-dark/40">
              {saving
                ? "saving…"
                : savedAt
                  ? `last saved ${timeAgo(savedAt)}`
                  : "saves as you go"}
            </p>
            {dwellSec !== null && (
              <p className="mt-1 font-mono text-xs text-lego-dark/40">
                you’ll be on stage for {dwellSec} seconds each rotation
              </p>
            )}
          </div>
        </aside>

        <div>
          <nav
            className="mb-5 flex flex-wrap gap-1.5 rounded-xl border border-lego-dark/15 bg-lego-dark/[0.03] px-2 py-2"
            role="tablist"
          >
            {TABS.map((t, i) => {
              const isActive = t.key === active;
              const isDone = complete(t.key);
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => setActive(t.key)}
                  className={cn(
                    "flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-xs tracking-widest uppercase transition",
                    isActive
                      ? "bg-lego-dark text-chalkboard"
                      : isDone
                        ? "bg-slide text-secondary-foreground hover:bg-slide/80"
                        : "text-lego-dark/60 hover:text-lego-dark",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full font-bold",
                      isActive
                        ? "bg-chalkboard text-lego-dark"
                        : isDone
                          ? "bg-secondary-foreground/15 text-secondary-foreground"
                          : "border border-lego-dark/30 text-lego-dark/50",
                    )}
                  >
                    {isDone ? "✓" : i + 1}
                  </span>
                  {t.label}
                </button>
              );
            })}
          </nav>

          <section
            role="tabpanel"
            key={active}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={cn(
              "relative rounded-xl border border-lego-dark/15 bg-chalkboard/40 p-5 transition",
              dropKinds && dragOver && "border-slide ring-2 ring-slide/40",
            )}
          >
            {dropKinds && dragOver && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-chalkboard/80 font-mono text-xs tracking-widest text-lego-dark uppercase">
                drop it like its hot
              </div>
            )}
            <div className="space-y-5">
              {active === "identity" && (
                <>
                  <Field label="Display name" required>
                    <input
                      value={draft.displayName}
                      onChange={(e) => update("displayName", e.target.value)}
                      placeholder="first last"
                      maxLength={80}
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Pronouns">
                    <input
                      value={draft.pronouns}
                      onChange={(e) =>
                        update("pronouns", e.target.value.toUpperCase())
                      }
                      placeholder="THEY/THEM"
                      maxLength={40}
                      className={inputCls}
                    />
                  </Field>
                  {mode === "staff" && (
                    <Field label="Track" required>
                      <div className="flex gap-2">
                        {(["IxD", "DFT"] as const).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => update("track", t)}
                            className={cn(
                              "rounded-md border px-4 py-2 font-display text-base font-bold tracking-wider transition",
                              draft.track === t
                                ? "border-lego-dark bg-lego-dark text-chalkboard"
                                : "border-lego-dark/20 bg-white text-lego-dark/60 hover:text-lego-dark",
                            )}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </Field>
                  )}
                  <Field label="Portfolio link">
                    <input
                      value={draft.link}
                      onChange={(e) => update("link", e.target.value)}
                      placeholder="yoursite.studio/mdd"
                      maxLength={300}
                      className={inputCls}
                    />
                  </Field>
                </>
              )}

              {active === "portrait" && (
                <div className="max-w-[260px]">
                  <PortraitColumn
                    portraitUrl={profile.portraitUrl}
                    busy={upload.busy && upload.activeKind === "portrait"}
                    progress={upload.progress}
                    onPick={() => upload.pickFile("portrait")}
                  />
                </div>
              )}

              {active === "story" && (
                <Field
                  label="One-liner"
                  required
                  hint={`${ONE_LINER_MAX} chars · shown under your name on stage`}
                >
                  <textarea
                    value={draft.introduction}
                    onChange={(e) =>
                      update(
                        "introduction",
                        e.target.value.slice(0, ONE_LINER_MAX),
                      )
                    }
                    placeholder="what's the one thing you want people to walk away knowing?"
                    rows={4}
                    className={cn(inputCls, "resize-none leading-snug")}
                  />
                  <OneLinerMeter value={draft.introduction} />
                </Field>
              )}

              {active === "work" && (
                <ShowcaseColumn
                  workMediaUrl={profile.workMediaUrl}
                  workMediaKind={profile.workMediaKind}
                  busy={
                    upload.busy &&
                    (upload.activeKind === "work-image" ||
                      upload.activeKind === "work-video")
                  }
                  progress={upload.progress}
                  onPick={() => upload.pickFile(["work-image", "work-video"])}
                  onPickVideo={() => upload.pickFile("work-video")}
                />
              )}

              {active === "vibe" && (
                <StageColorPicker
                  value={draft.stageColor}
                  onChange={(c) => update("stageColor", c)}
                />
              )}

              {active === "competencies" && (
                <CompetenciesSection
                  competencies={draft.competencies}
                  cohort={cohort.data ?? []}
                  onChange={(next) => update("competencies", next)}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
